// Pollen's caption rules, checked in the app before a cover is sent, so the creator hears what to fix
// right away instead of a failure a minute later. Pollen checks again on its side; these mirror
// pollen/platforms/base.py (emoji, slop rules) and Instagram's 2,200 character limit.

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u203C\u2049\u2122\u2139\u2194-\u21AA\u231A-\u23FF\u24C2\u25AA-\u25FE\u3030\u303D\u3297\u3299]/gu;
const ANTITHESIS = [
  /\b(it'?s|it is|this is|this'?s|that'?s|that is|he'?s|she'?s|they'?re)\s+not\b[^.!?\n]{0,80}?[,;:.]\s*(it'?s|it is|this is|this'?s|that'?s|that is|he'?s|she'?s|they'?re)\b/i,
  /\bnot only\b[^.!?\n]{0,80}\bbut\b/i,
  /\binstead of\b[^.!?\n]{0,80}\bthink\b/i,
  /\bnot (just|merely|simply)\b[^.!?\n]{0,80}[,;:]\s*\w/i,
];
const DASH = /\u2014|\u2013|\s--\s|\s-\s/;
export const BANNED_WORDS = ["clean", "vibe", "vibes", "vibey", "pivotal", "crucial", "game-changer", "game changer", "gamechanger"];
export const CAPTION_LIMIT = 2200; // Instagram's limit; Pollen trims for the shorter platforms itself

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Plain reasons Pollen would refuse this caption. Empty when it's good to go. */
export function captionProblems(caption) {
  const cap = String(caption ?? "");
  const out = [];
  const found = cap.match(EMOJI) || [];
  const shown = [...new Set(found)].filter((c) => c !== "\uFE0F" && c !== "\u200D");
  if (found.length) out.push(`Remove the emoji${shown.length ? `: ${shown.join(" ")}` : ""}. Captions never use emoji.`);
  if (DASH.test(cap)) out.push("Swap the dash for a period or comma.");
  if (ANTITHESIS.some((re) => re.test(cap))) out.push("Rewrite the \"it's not X, it's Y\" line.");
  const words = BANNED_WORDS.filter((w) => new RegExp(`(?<![\\w-])${escapeRe(w)}(?![\\w-])`, "i").test(cap));
  if (words.length) out.push(`Drop ${words.map((w) => `"${w}"`).join(", ")}.`);
  if (cap.length > CAPTION_LIMIT) out.push(`Make it shorter: ${cap.length.toLocaleString("en-US")} characters, Instagram allows 2,200.`);
  return out;
}
