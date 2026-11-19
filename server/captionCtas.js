// The comment call (1.10, Arjang #435): a ManyChat-style line like "Comment WORD and I'll send you ..."
// that leads a caption only when the cover's switch is on. The space keeps its own lines, set by its
// Muse; upstream ships none. The caption is stored without the call, and what posts is the two together.
import { captionProblems } from "./captionRules.js";

export const CTA_LIMIT = 6;
export const CTA_LINE_LIMIT = 300;
const KEYWORD = /^[\p{L}\p{N}]{2,24}$/u;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Her list, checked: one word keywords (kept in capitals), each line carrying its keyword and passing Pollen's rules. */
export function cleanCtas(list) {
  if (!Array.isArray(list)) return { error: "Send ctas as a list of { keyword, line }." };
  if (list.length > CTA_LIMIT) return { error: `Keep it to ${CTA_LIMIT} comment calls or fewer.` };
  const ctas = [];
  for (const raw of list) {
    const keyword = String(raw?.keyword ?? "").trim().toUpperCase();
    const line = String(raw?.line ?? "").trim();
    if (!KEYWORD.test(keyword)) return { error: `"${keyword}" won't work as a keyword. Use one word, 2 to 24 letters or numbers.` };
    if (ctas.some((c) => c.keyword === keyword)) return { error: `${keyword} is on the list twice. Keep one line per keyword.` };
    if (!line || line.length > CTA_LINE_LIMIT) return { error: `The line for ${keyword} needs 1 to ${CTA_LINE_LIMIT} characters.` };
    if (!new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(keyword)}([^\\p{L}\\p{N}]|$)`, "iu").test(line)) {
      return { error: `The line for ${keyword} has to say the keyword ${keyword}, so fans know what to comment.` };
    }
    const problems = captionProblems(line);
    if (problems.length) return { error: `Pollen would refuse the line for ${keyword}: ${problems.join(" ")}` };
    ctas.push({ keyword, line });
  }
  return { ctas };
}

/** The call a cover has switched on, or null: off, or a keyword no longer on her list. */
export function ctaFor(item, ctas) {
  const want = String(item?.cta ?? "").trim().toUpperCase();
  if (!want) return null;
  return (ctas || []).find((c) => c.keyword === want) || null;
}

/** What posts: the call first when the switch is on, then the caption. */
export function postedCaption(item, ctas) {
  const caption = String(item?.caption ?? "").trim();
  const cta = ctaFor(item, ctas);
  if (!cta) return String(item?.caption ?? "");
  return caption ? `${cta.line} ${caption}` : cta.line;
}

/** True when a caption already carries a comment call: one of her lines or keywords, or "Comment WORD" at the start. */
export function bakedCta(text, ctas) {
  const t = String(text ?? "");
  const lead = t.match(/^\s*comment\s+([\p{L}\p{N}]{2,})/iu)?.[1];
  if (lead && lead === lead.toUpperCase() && /\p{Lu}/u.test(lead)) return true; // "Comment WORD ..." at the start
  return (ctas || []).some((c) => t.toLowerCase().includes(c.line.toLowerCase())
    || new RegExp(`\\bcomment\\s+${escapeRe(c.keyword)}(?![\\p{L}\\p{N}])`, "iu").test(t));
}
