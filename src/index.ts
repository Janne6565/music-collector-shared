/**
 * Everything the Music Collector web and mobile apps have to agree on exactly.
 *
 * The rule for what belongs here: if the two apps computing it differently would make the
 * same collection converge differently, or store the same input as different values, it is
 * shared. Rendering, storage engines and API clients are not — they are each app's own.
 *
 * These files used to be hand-mirrored between the two repos under MIRROR headers, and
 * drifted anyway.
 */

// The domain, and the rules that decide who wins a conflict.
export * from "./domain/types.js";
export * from "./domain/hlc.js";
export * from "./domain/merge.js";
export * from "./domain/money.js";
export * from "./domain/passwordStrength.js";
export * from "./domain/preview.js";

// The write path. Every edit is stamped here, or it loses every merge it takes part in.
export * from "./local/LocalStore.js";
export * from "./local/copyWrites.js";
export * from "./local/photoWrites.js";
export * from "./local/wishWrites.js";

// Reconciliation, and the platform seam it reaches the network through.
export * from "./sync/syncEngine.js";
export * from "./sync/transport.js";

// Screen logic that must behave identically on both, though it is drawn differently.
export * from "./detail/theme.js";
export * from "./detail/useCopyEditorLogic.js";
