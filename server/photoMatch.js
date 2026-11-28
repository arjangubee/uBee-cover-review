// Generate (1.40.0 part 19, the creator's ask, room #1582): carousel photos matched to the cover's overlay text. No model:
// the same plain word match remix uses (words.js). A photo's words are what it shows (description, counts 2) and its
// title (1), against the text on the cover. Pure functions, so a ported space can rank with its own rows.
import { words } from "./words.js";

/** The text on a cover's photo: the quote when it shows, and her own boxes on the cover photo. */
export function overlayTextOf(item, quoteOn = true) {
  const boxes = (Array.isArray(item?.extraTexts) ? item.extraTexts : []).filter((b) => b && b.slide == null);
  return [quoteOn ? item?.quote : "", ...boxes.map((b) => b.quote)].map((t) => String(t ?? "").trim()).filter(Boolean).join(" ");
}

/** The candidates, best match first: the most shared words, then a turn that moves with the seed. Each carries score. */
export function rankPhotos(text, cands, seed = 0) {
  const want = new Set(words(text));
  const n = cands.length;
  return cands.map((c, i) => {
    let score = 0;
    for (const [weight, t] of [[2, c.description], [1, c.title]]) for (const w of new Set(words(t))) if (want.has(w)) score += weight;
    return { c, score, turn: (((i * 7919 - seed) % n) + n) % n };
  }).sort((a, b) => b.score - a.score || a.turn - b.turn).map(({ c, score }) => ({ ...c, score }));
}
