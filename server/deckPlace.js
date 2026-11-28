// Places in a random deck (1.40.0 part 18), for the covers the server moves on purpose: Rewind's cover to the front, and
// a finished remix right after the cover it came from. A recent deck reads reviewOrderAt only, so these change nothing
// there. See deckOrder.js.
import { deckOrderOf, frontPlace, placeAfter, seedOf } from "./deckOrder.js";
import { store } from "./store.js";

const queued = () => store.db.items.filter((i) => i.status === "queue");

/** In a random deck, this cover goes in front of every queued cover. */
export function placeFront(item) {
  const seed = seedOf(store.settings);
  if (deckOrderOf(store.settings) !== "random" || seed == null) return;
  item.deckPlace = frontPlace(queued().filter((i) => i.id !== item.id), seed);
}

/** In a random deck, this cover goes right after another one (or to the front when there's none). */
export function placeAfterItem(item, after) {
  const seed = seedOf(store.settings);
  if (deckOrderOf(store.settings) !== "random" || seed == null) return;
  item.deckPlace = after && after.status === "queue" ? placeAfter(queued(), after, seed, item.id) : frontPlace(queued().filter((i) => i.id !== item.id), seed);
}
