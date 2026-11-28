// The deck's order (1.40.0 part 18, the creator's ask, room #1582 and #1583): random or recent, one setting per account.
// Recent is the queue order as it always was. Random is a shuffle made here on the server from a seed kept in her
// settings, so it holds across reloads, list switches and server copies. Pure functions, so a ported space can use them
// with its own settings row.
//
// Random keeps the places she asked for: a cover Rewind brings back leads, and a remix that comes next sits right after
// the cover it was made from. Each is a deckPlace on the cover, { seed, key }, that counts only for the seed it was made
// for, so a new shuffle starts clean. Covers without one fall where the seed puts them.

export const DECK_ORDERS = ["random", "recent"];

/** Her deck order: random unless she picked recent. */
export function deckOrderOf(settings) {
  return settings?.deckOrder?.order === "recent" ? "recent" : "random";
}

/** A new seed for a new shuffle. */
export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

/** The seed in use, or null when there isn't one yet. */
export function seedOf(settings) {
  const s = Number(settings?.deckOrder?.seed);
  return Number.isInteger(s) && s > 0 ? s : null;
}

// FNV-1a over seed and id, as a number from 0 up to 1. The same seed and id always give the same number.
function unit(seed, id) {
  let h = 0x811c9dc5;
  for (const c of `${seed}:${id}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h / 4294967296;
}

/** Where a cover sits in the shuffle: its own place for this seed, or where the seed puts it. */
export function deckKey(item, seed) {
  const p = item?.deckPlace;
  return p && p.seed === seed && Number.isFinite(p.key) ? p.key : unit(seed, item.id);
}

/** The covers in shuffled order. */
export function inRandomOrder(list, seed) {
  return [...list].sort((a, b) => deckKey(a, seed) - deckKey(b, seed) || a.id - b.id);
}

/** A place in front of every queued cover. */
export function frontPlace(queue, seed) {
  const keys = queue.map((i) => deckKey(i, seed));
  return { seed, key: Math.min(0, ...keys) - 1 };
}

/** A place right after one cover and before the one that follows it. */
export function placeAfter(queue, after, seed, movingId = null) {
  const sorted = inRandomOrder(queue.filter((i) => i.id !== movingId), seed);
  const at = sorted.findIndex((i) => i.id === after.id);
  if (at < 0) return frontPlace(queue, seed);
  const here = deckKey(sorted[at], seed);
  const next = sorted[at + 1];
  return { seed, key: next ? (here + deckKey(next, seed)) / 2 : here + 1 };
}

/**
 * The queue as the deck shows it. groups is the queue split the way the server reads it (compose check passed, the
 * rest, then skipped). Recent leaves each group in queue order. Random shuffles the first two and leaves skipped covers
 * last, in the order they were skipped.
 */
export function orderDeck({ passing, waiting, skipped }, settings) {
  if (deckOrderOf(settings) === "recent") return [...passing, ...waiting, ...skipped];
  const seed = seedOf(settings) ?? 1;
  return [...inRandomOrder(passing, seed), ...inRandomOrder(waiting, seed), ...skipped];
}
