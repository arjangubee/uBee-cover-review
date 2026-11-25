// The standalone simulator's fixes, folded into Chats (1.14.0, Quill #725, Rose #738 and #770). Pure functions, so a
// ported space applies exactly the same rules wherever it drafts.

/**
 * The voice's version: djb2 over JSON.stringify(sections), the Voice tab's sections as saved ({ title, body }, in order),
 * written as v plus 8 lowercase hex digits. It changes whenever the saved voice changes and stays put otherwise.
 */
export function voiceVersion(sections) {
  const s = JSON.stringify(Array.isArray(sections) ? sections : []);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `v${h.toString(16).padStart(8, "0")}`;
}

/**
 * The !! rule her voice states, read from the profile, never built in. The first line in any section that holds "!!"
 * is the rule: "N in M" on that line gives { per: N, outOf: M }, and with no fraction it reads 1 in 5. No such line
 * means no rule (null).
 */
export function bangRuleOf(sections) {
  for (const s of Array.isArray(sections) ? sections : []) {
    for (const line of String(s?.body ?? "").split("\n")) {
      if (!line.includes("!!")) continue;
      const m = line.match(/(\d+)\s*in\s*(\d+)/);
      return m ? { per: Number(m[1]), outOf: Number(m[2]) } : { per: 1, outOf: 5 };
    }
  }
  return null;
}

const BANG = /!!+$/u;

/**
 * A draft's !! endings held to the rule across the whole draft, never per line: with a rule, floor(lines x per /
 * outOf) lines ending in two or more ! keep them, and a draft of more than one line never keeps them on every line. The
 * earliest keep theirs. The rest lose the run of ! entirely (no period in its place); nothing else changes. With no
 * rule, every !! ending goes. A single ! is words, not an ending.
 * An emoji ending is hers and never counts or goes (1.21.1, Quill #942): her comment replies end on emoji about 6 in 10
 * and her DM texts about 1 in 5 (room #934), so holding emoji to the !! rule cut most of them, and a cut
 * could stop inside a run at a skin tone.
 */
export function capEndings(text, sections) {
  const rule = bangRuleOf(sections);
  const lines = String(text ?? "").split("\n");
  const filled = lines.filter((l) => l.trim() !== "").length;
  let allowed = rule ? Math.floor((filled * rule.per) / rule.outOf) : 0;
  if (filled > 1) allowed = Math.min(allowed, filled - 1);
  return lines.map((line) => {
    if (!BANG.test(line.trimEnd())) return line;
    if (allowed > 0) { allowed--; return line; }
    return line.trimEnd().replace(BANG, "").trimEnd();
  }).join("\n");
}

/** Instagram's line for a story reply when the words didn't come through. Never shown as her follower's words. */
export const STORY_PLACEHOLDER = "replied to your story";

/**
 * A story reply's own words. When the last message from them is a story reply (share_story, reply_to story) with
 * text, that text is the incoming message. With no text and the placeholder as the incoming message, it's flagged as
 * not captured, and nothing is invented.
 */
export function storyCapture(thread, incomingText) {
  const list = Array.isArray(thread) ? thread : [];
  let last = null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.from === "them") { last = list[i]; break; }
  if (last && last.kind === "share_story" && last.reply_to === "story") {
    const words = typeof last.text === "string" ? last.text.trim() : "";
    if (words) return { incomingText: words, notCaptured: false };
    if (String(incomingText ?? "").trim().toLowerCase() === STORY_PLACEHOLDER) return { incomingText, notCaptured: true };
  }
  return { incomingText, notCaptured: false };
}
