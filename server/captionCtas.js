// The comment CTA (1.10, Arjang #435; renamed from "comment call" in 1.10.1, Arjang #453): a ManyChat-style line
// like "Comment WORD and I'll send you ..." that leads a caption only when the cover's switch is on. The space keeps
// its own lines, set by its Muse; upstream ships none. What shows and what posts come from client/src/captionCall.js,
// shared with the page: off is the plain caption, on is her line once and then the plain caption.
import { captionProblems } from "./captionRules.js";
import { saysKeyword } from "../client/src/captionCall.js";
export { ctaFor, plainCaption, postedCaption } from "../client/src/captionCall.js";

export const CTA_LIMIT = 6;
export const CTA_LINE_LIMIT = 300;
const KEYWORD = /^[\p{L}\p{N}]{2,24}$/u;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A line she wrote for one cover (1.36.0, Arjang Nov 26), under the rules her saved lines follow. { line } or { error }. */
export function cleanCtaLine(keyword, raw) {
  const line = String(raw ?? "").trim();
  if (!line || line.length > CTA_LINE_LIMIT) return { error: `The comment CTA needs 1 to ${CTA_LINE_LIMIT} characters.` };
  if (!saysKeyword(line, keyword)) return { error: `Keep the word ${keyword} in it, so fans know what to comment.` };
  const problems = captionProblems(line);
  if (problems.length) return { error: `Pollen would refuse that line: ${problems.join(" ")}` };
  return { line };
}

/** Her list, checked: one word keywords (kept in capitals), each line carrying its keyword and passing Pollen's rules. */
export function cleanCtas(list) {
  if (!Array.isArray(list)) return { error: "Send ctas as a list of { keyword, line }." };
  if (list.length > CTA_LIMIT) return { error: `Keep it to ${CTA_LIMIT} comment CTAs or fewer.` };
  const ctas = [];
  for (const raw of list) {
    const keyword = String(raw?.keyword ?? "").trim().toUpperCase();
    const line = String(raw?.line ?? "").trim();
    if (!KEYWORD.test(keyword)) return { error: `"${keyword}" won't work as a keyword. Use one word, 2 to 24 letters or numbers.` };
    if (ctas.some((c) => c.keyword === keyword)) return { error: `${keyword} is on the list twice. Keep one line per keyword.` };
    if (!line || line.length > CTA_LINE_LIMIT) return { error: `The line for ${keyword} needs 1 to ${CTA_LINE_LIMIT} characters.` };
    if (!saysKeyword(line, keyword)) {
      return { error: `The line for ${keyword} has to say the keyword ${keyword}, so fans know what to comment.` };
    }
    const problems = captionProblems(line);
    if (problems.length) return { error: `Pollen would refuse the line for ${keyword}: ${problems.join(" ")}` };
    ctas.push({ keyword, line });
  }
  return { ctas };
}

/** True when a caption already carries a comment CTA: one of her lines or keywords, or "Comment WORD" at the start. */
export function bakedCta(text, ctas) {
  const t = String(text ?? "");
  const lead = t.match(/^\s*comment\s+([\p{L}\p{N}]{2,})/iu)?.[1];
  if (lead && lead === lead.toUpperCase() && /\p{Lu}/u.test(lead)) return true; // "Comment WORD ..." at the start
  return (ctas || []).some((c) => t.toLowerCase().includes(c.line.toLowerCase())
    || new RegExp(`\\bcomment\\s+${escapeRe(c.keyword)}(?![\\p{L}\\p{N}])`, "iu").test(t));
}
