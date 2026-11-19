// The comment CTA in a caption (1.10, Arjang #435; 1.10.1, Arjang #453, Quill #458). The switch under "Instagram
// caption" is the only way a call reaches a caption. A call written into the caption itself, the way captions were
// drafted before 1.10, is left out wherever the caption shows and out of what posts: one of her saved lines, anywhere,
// or a "Comment WORD" sentence at the start. Every other word stays, and nothing stored is rewritten.
// Shared by the page (what shows) and the server (what posts), so the two can't drift.

const LEAD_CALL = /^\s*comment\s+([\p{L}\p{N}]{2,})[^\n]*?(?:(?:!+|\.+|…)(?=\s|$)|\n|$)/iu;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The call a cover has switched on, or null: off, or a keyword no longer on her list. */
export function ctaFor(item, ctas) {
  const want = String(item?.cta ?? "").trim().toUpperCase();
  if (!want) return null;
  return (ctas || []).find((c) => c.keyword === want) || null;
}

// Takes text[start, end) out and closes the gap with one of the separators that were around it.
function cut(text, start, end) {
  const before = text.slice(0, start), after = text.slice(end);
  if (!before.trim()) return after.replace(/^\s+/, "");
  if (!after.trim()) return before.replace(/\s+$/, "");
  const left = before.match(/\s*$/)[0], right = after.match(/^\s*/)[0];
  return before.slice(0, before.length - left.length) + (left || right) + after.slice(right.length);
}

/** The caption with any call written into it left out. Exactly the caption when it has none. */
export function plainCaption(text, ctas) {
  let t = String(text ?? "");
  for (const c of ctas || []) {
    const line = String(c?.line ?? "").trim();
    if (!line) continue;
    const re = new RegExp(escapeRe(line), "iu");
    for (let m = re.exec(t); m; m = re.exec(t)) t = cut(t, m.index, m.index + m[0].length);
  }
  const lead = t.match(LEAD_CALL);
  if (lead && lead[1] === lead[1].toUpperCase() && /\p{Lu}/u.test(lead[1])) t = cut(t, 0, lead[0].length);
  return t;
}

/** What posts: off, the plain caption; on, her line once and then the plain caption. */
export function postedCaption(item, ctas) {
  const caption = plainCaption(item?.caption, ctas);
  const cta = ctaFor(item, ctas);
  if (!cta) return caption;
  const body = caption.trim();
  return body ? `${cta.line} ${body}` : cta.line;
}
