import { describe, expect, it } from "vitest";
import { ZipError, crc32, decodeUtf8, encodeUtf8, readZip, writeZip } from "./zip.js";

const AT = new Date("2026-08-26T10:30:00Z");

function bytes(text: string): Uint8Array {
  return encodeUtf8(text);
}

describe("the zip codec", () => {
  it("round-trips names and bytes", () => {
    const archive = writeZip(
      [
        { path: "collection.json", bytes: bytes('{"a":1}') },
        { path: "photos/4f2a.jpg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]) },
      ],
      AT,
    );

    const read = readZip(archive);
    expect(read.map((entry) => entry.path)).toEqual(["collection.json", "photos/4f2a.jpg"]);
    expect(decodeUtf8(read[0].bytes)).toBe('{"a":1}');
    expect([...read[1].bytes]).toEqual([0xff, 0xd8, 0xff, 0x00, 0x01]);
  });

  it("writes something other tools recognise as a zip", () => {
    const archive = writeZip([{ path: "a.txt", bytes: bytes("hi") }], AT);

    // "PK\x03\x04" — the signature every unzip in the world looks for first.
    expect([...archive.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("keeps non-ASCII names, which is what the UTF-8 flag is for", () => {
    const archive = writeZip([{ path: "photos/Björk – Homogénic.jpg", bytes: bytes("x") }], AT);

    expect(readZip(archive)[0].path).toBe("photos/Björk – Homogénic.jpg");
  });

  it("handles an empty entry and an empty archive", () => {
    expect(
      readZip(writeZip([{ path: "empty", bytes: new Uint8Array(0) }], AT))[0].bytes.length,
    ).toBe(0);
    expect(readZip(writeZip([], AT))).toEqual([]);
  });

  it("survives bytes that look like headers", () => {
    // A photo's own bytes can contain "PK\x03\x04". A reader that scanned for signatures
    // instead of following the central directory would find an entry inside the JPEG.
    const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b, 0x01, 0x02, 0x09]);
    const read = readZip(writeZip([{ path: "photos/a.jpg", bytes: payload }], AT));

    expect(read).toHaveLength(1);
    expect([...read[0].bytes]).toEqual([...payload]);
  });

  it("refuses a file that is not a zip at all", () => {
    expect(() => readZip(bytes("this is a csv, actually"))).toThrow(ZipError);
  });

  it("catches a damaged entry rather than handing back the damage", () => {
    const archive = writeZip([{ path: "a.txt", bytes: bytes("the original text") }], AT);
    // Flip a byte inside the stored data, which is where a bad transfer would land.
    archive[40] ^= 0xff;

    expect(() => readZip(archive)).toThrow(/damaged/);
  });

  it("computes the CRC-32 the format specifies", () => {
    // The standard check value: "123456789" is 0xCBF43926 in every CRC-32 implementation.
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("is deterministic, so the same collection exports to the same bytes", () => {
    const entries = [{ path: "collection.json", bytes: bytes("{}") }];

    expect([...writeZip(entries, AT)]).toEqual([...writeZip(entries, AT)]);
  });
});
