// Get quote (1.40.0 part 20, the creator's ask, room #1582; Arjang #1596 and call #13): a quote for a photo she uploaded
// onto a cover. The quote comes from her own quote list, so the compose check's QUOTE_IN_STOCK still holds.
// This server has no model: it picks by a plain word match of what the photo shows, the caption and the title, the way
// remix does (songPick.js best), never the quote the cover has now. A space with a model maps quote-fill to its model
// call (call #13, Get quote only), with quotePrompt and the photo, and saves the answer only when quoteDraftProblems
// finds none. Pure functions, so a ported space can use the same rules.
import { best } from "./songPick.js";

const key = (t) => String(t ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Her quote list, each quote once, without the cover's own. */
export function quoteStock(quotes, current = "") {
  const now = key(current), seen = new Set(), out = [];
  for (const q of quotes || []) {
    const text = String(q?.text ?? q ?? "").trim(), k = key(text);
    if (k && k !== now && !seen.has(k)) { seen.add(k); out.push(text); }
  }
  return out;
}

/** The pick with no model: the most words shared with the photo's description (3), the caption (2) and the title (1). */
export function offlineQuote(item, quotes, seed = 0) {
  const stock = quoteStock(quotes, item?.quote);
  const hit = best(stock.map((text) => ({ text })), [[3, item?.description], [2, item?.caption], [1, item?.title]], seed);
  return hit ? hit.text : "";
}

/** What a model is asked: one quote from her list that fits the photo it's shown, written exactly as it is there. */
export function quotePrompt(item, quotes) {
  const stock = quoteStock(quotes, item?.quote);
  return [
    "Look at the photo. Pick the one quote from her list below that fits it best: what it shows, its mood, its moment.",
    "Answer with that quote only, exactly as it's written in the list. No quote marks, no other words.",
    item?.description ? `What the photo shows: ${String(item.description).trim()}` : "",
    item?.caption ? `Her caption: ${String(item.caption).trim()}` : "",
    "Her quotes:",
    ...stock.map((q) => `- ${q}`),
  ].filter(Boolean).join("\n");
}

/** Why a model's answer can't be saved: empty, not on her list, or the quote the cover already has. Empty means none. */
export function quoteDraftProblems(answer, quotes, current = "") {
  const k = key(String(answer ?? "").replace(/^["'“‘]+|["'”’]+$/g, ""));
  if (!k) return ["The answer is empty."];
  if (k === key(current)) return ["That's the quote the cover has now."];
  if (!(quotes || []).some((q) => key(q?.text ?? q) === k)) return ["That quote isn't on her list."];
  return [];
}

/** The answer as it's written on her list. */
export function stockText(answer, quotes) {
  const k = key(String(answer ?? "").replace(/^["'“‘]+|["'”’]+$/g, ""));
  const hit = (quotes || []).find((q) => key(q?.text ?? q) === k);
  return hit ? String(hit.text ?? hit).trim() : "";
}
