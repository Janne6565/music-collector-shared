/**
 * A minimal ZIP writer and reader, stored-only.
 *
 * Hand-written for the same reason the CSV parser is: the alternative is a dependency in
 * both apps, and what is actually needed here is small and completely specified. The
 * archive holds JPEGs and PNGs, which are already compressed — DEFLATE would spend CPU on
 * a phone to save single-digit percent — so every entry is written with method 0 (STORE)
 * and the writer needs no compressor at all.
 *
 * The output is a real ZIP: `unzip`, Finder and Windows Explorer all open a `.mc` renamed
 * to `.zip`. That is deliberate — an export nobody can open without this app would be a
 * worse archive than the CSV it sits beside.
 *
 * Deliberately not supported: DEFLATE on read (an entry compressed by another tool is
 * rejected loudly rather than returned as garbage), ZIP64, and encryption. Nothing this
 * app writes needs them, and a collection large enough to need ZIP64 (4 GB, or 65535
 * files) is rejected with a message rather than silently truncated to a corrupt file.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** Bit 11: the file name is UTF-8 rather than the ancient IBM code page. */
const UTF8_NAME_FLAG = 0x0800;
const STORED = 0;

/** The largest value the non-ZIP64 header fields can hold. */
const MAX_UINT32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

export interface ZipEntry {
  /** Forward-slash separated, relative, and never leading with a slash. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export class ZipError extends Error {}

/**
 * Packs entries into a ZIP archive.
 *
 * `modifiedAt` is written into every entry rather than "now", so an archive built from
 * the same collection twice is byte-identical. That is what makes the round-trip test
 * able to assert on the bytes instead of on a re-parse of them.
 */
export function writeZip(entries: readonly ZipEntry[], modifiedAt: Date): Uint8Array {
  if (entries.length > MAX_ENTRIES) {
    throw new ZipError(`Too many files for a ZIP archive: ${entries.length}`);
  }
  const { date, time } = toDosDateTime(modifiedAt);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encodeUtf8(entry.path);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Writer(30 + name.length);
    local.u32(LOCAL_HEADER);
    local.u16(20); // Version needed: 2.0, which is what STORE requires.
    local.u16(UTF8_NAME_FLAG);
    local.u16(STORED);
    local.u16(time);
    local.u16(date);
    local.u32(crc);
    local.u32(size); // Compressed and uncompressed are the same thing when stored.
    local.u32(size);
    local.u16(name.length);
    local.u16(0); // No extra field.
    local.bytes(name);
    locals.push(local.done(), entry.bytes);

    const central = new Writer(46 + name.length);
    central.u32(CENTRAL_HEADER);
    central.u16(20); // Version made by.
    central.u16(20);
    central.u16(UTF8_NAME_FLAG);
    central.u16(STORED);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(size);
    central.u32(size);
    central.u16(name.length);
    central.u16(0); // Extra field.
    central.u16(0); // Comment.
    central.u16(0); // Disk number.
    central.u16(0); // Internal attributes.
    central.u32(0); // External attributes.
    central.u32(offset);
    central.bytes(name);
    centrals.push(central.done());

    offset += 30 + name.length + size;
    if (offset > MAX_UINT32) {
      throw new ZipError("Archive is larger than 4 GB, which needs ZIP64");
    }
  }

  const directorySize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Writer(22);
  end.u32(END_OF_CENTRAL_DIRECTORY);
  end.u16(0); // This disk.
  end.u16(0); // Disk the directory starts on.
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(directorySize);
  end.u32(offset);
  end.u16(0); // No archive comment.

  return concat([...locals, ...centrals, end.done()]);
}

/**
 * Reads an archive back.
 *
 * Entries are located through the central directory rather than by walking local headers,
 * because that is the only part of a ZIP that is authoritative: an entry written with a
 * data descriptor has zeroes in its local header, and a reader that trusted them would
 * hand back empty files. The CRC of every entry is verified — a photo silently truncated
 * by a bad transfer is exactly the failure an archive format exists to catch.
 */
export function readZip(archive: Uint8Array): ZipEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = findEndOfCentralDirectory(archive, view);
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);

  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > archive.length || view.getUint32(cursor, true) !== CENTRAL_HEADER) {
      throw new ZipError("Corrupt archive: the file list ends early");
    }
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const path = decodeUtf8(archive.subarray(cursor + 46, cursor + 46 + nameLength));

    if (method !== STORED) {
      throw new ZipError(`"${path}" is compressed, which this reader does not support`);
    }

    if (localOffset + 30 > archive.length || view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new ZipError(`Corrupt archive: "${path}" points at nothing`);
    }
    // The local header's own name and extra lengths, not the directory's: the two are
    // allowed to differ, and the data starts after the local copy.
    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    if (dataStart + size > archive.length) {
      throw new ZipError(`Corrupt archive: "${path}" is truncated`);
    }

    const bytes = archive.slice(dataStart, dataStart + size);
    if (crc32(bytes) !== crc) {
      throw new ZipError(`"${path}" is damaged: its checksum does not match`);
    }
    entries.push({ path, bytes });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * The end record sits at the very end unless the archive carries a comment, so this scans
 * backwards over the largest comment a ZIP can hold rather than assuming it does not.
 */
function findEndOfCentralDirectory(archive: Uint8Array, view: DataView): number {
  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let at = archive.length - 22; at >= earliest; at -= 1) {
    if (view.getUint32(at, true) === END_OF_CENTRAL_DIRECTORY) return at;
  }
  throw new ZipError("Not a ZIP archive");
}

/** MS-DOS packed date and time, which is the only clock a ZIP header has. */
function toDosDateTime(at: Date): { date: number; time: number } {
  // 1980 is the epoch of the format; anything earlier cannot be represented at all.
  const year = Math.max(1980, at.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
    // Seconds are stored in two-second steps, which is a real property of the format.
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
  };
}

/** Little-endian append-only buffer, so header layouts above read as their spec order. */
class Writer {
  private readonly buffer: Uint8Array;
  private readonly view: DataView;
  private at = 0;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
    this.view = new DataView(this.buffer.buffer);
  }

  u16(value: number): void {
    this.view.setUint16(this.at, value, true);
    this.at += 2;
  }

  u32(value: number): void {
    this.view.setUint32(this.at, value >>> 0, true);
    this.at += 4;
  }

  bytes(value: Uint8Array): void {
    this.buffer.set(value, this.at);
    this.at += value.length;
  }

  done(): Uint8Array {
    return this.buffer;
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
