import { z } from "zod";

// The room-side part of mods: what a room stores. A leaf module (zod only) so
// room schemas can import it without an import cycle.

/** At most this many mods are installed in one room. */
export const ROOM_MOD_LIMIT = 8;

export const modId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
const modHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
/** What a room stores: an exact, content-hash-pinned mod version. */
export const modRef = z
  .object({ id: modId, version: z.number().int().min(1).max(10_000), hash: modHash })
  .strict();
export type ModRef = z.infer<typeof modRef>;
export const roomMods = z
  .array(modRef)
  .max(ROOM_MOD_LIMIT)
  .refine((refs) => new Set(refs.map((ref) => ref.id)).size === refs.length, "A mod can be installed once per room");
