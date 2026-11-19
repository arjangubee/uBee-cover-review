// Captions drafted by a model, in the space's own voice (1.9, Quill #269, #276, #284, #292).
// Pure functions only, so a ported space can use the same rules with its own model call.
import { captionProblems } from "./captionRules.js";

/**
 * The text that shows on the cover: the quote when it's turned on, then her text boxes. Empty when nothing shows
 * (1.9.2, Quill #327): a hidden quote is not on the cover, so it is never a caption's topic.
 */
export function overlaidText(cover) {
  return [cover.showQuote ? cover.quote : "", ...(Array.isArray(cover.extraTexts) ? cover.extraTexts.map((b) => b?.quote) : [])]
    .map((t) => String(t ?? "").trim()).filter(Boolean).join("\n");
}

/** True when a voiced caption would be about the photo (no text shows) and nobody has said what the photo shows yet. */
export function needsDescription(cover, voice) {
  return Boolean(String(voice ?? "").trim()) && !overlaidText(cover) && !String(cover.description ?? "").trim();
}

/**
 * The prompt a model drafts one caption from. With no voice it is the original's generateInstagramCaption prompt,
 * word for word (Quill #284). With the space's voice it is on topic of the text on the cover, in that voice, with no
 * length rule of its own: the voice decides length, format and tone. When the cover shows no text, the caption is
 * about what the photo shows, from the cover's description (1.9.2, Quill #327). A creator's specifics (her spellings,
 * her angle) live in her voice text, in her space's data, never here.
 */
export function captionPrompt(cover, voice) {
  const v = String(voice ?? "").trim();
  if (!v) {
    return "Write one Instagram caption for this cover. Make it a short unexpected curveball that still clicks with the image and quote. "
      + "Sound like a person typing with caveman-level brevity: one fragment, one blunt observation, or a few raw words. One to eight words. "
      + "Lowercase is fine. Mild profanity is fine when it genuinely fits, but do not force it. No emoji, hashtags, explanations, marketing language, "
      + "polished prose, or full setup. Never use an antithesis formula such as \"it's not this, it's that,\" \"not x but y,\" or any close variation. "
      + `Avoid repeating the cover quote.\n\nCover quote: ${cover.quote ?? ""}\nImage description: ${cover.description ?? ""}`;
  }
  const head = "Write one Instagram caption for this cover in the creator's own voice, described below. "
    + "Write as her, in the first person, so her words and her story stay hers. Follow the voice exactly, the way she writes and spells.";
  const text = overlaidText(cover);
  if (text) return `${head} Keep it on topic of the text on the cover.\n\nText on the cover:\n${text}\n\nHer voice:\n${v}`;
  return `${head} There is no text on this cover, so write about what the photo shows.\n\n`
    + `What the photo shows:\n${String(cover.description ?? "").trim()}\n\nHer voice:\n${v}`;
}

/**
 * Why a model's draft can't be saved, in plain words. Empty when it's fine. With no voice it must fit the original's
 * output schema: 1 to 80 characters, at most 8 words, no hashtags, no emoji, no not-this-but-that. Every draft also
 * meets Pollen's caption rules, since covers post through Pollen.
 */
export function draftProblems(draft, { voice } = {}) {
  const text = String(draft ?? "").trim();
  if (!text) return ["The draft is empty."];
  const out = [];
  if (!String(voice ?? "").trim()) {
    if (text.length > 80) out.push(`Make it shorter: ${text.length} characters, the most is 80.`);
    if (text.split(/\s+/).length > 8) out.push("Use 8 words at most.");
    if (/(^|\s)#\w/u.test(text)) out.push("No hashtags.");
  }
  return [...out, ...captionProblems(text)];
}

/**
 * Where a caption came from: blank, placeholder (the offline draft, the quote as written), model or human.
 * A row saved before 1.9 has no source: it reads as a placeholder when it matches the offline draft of its quote,
 * and as human otherwise, so words of unknown origin are never replaced.
 */
export function captionState(item, offlineDraft) {
  const cap = String(item?.caption ?? "").trim();
  if (!cap) return "blank";
  if (item.captionSource) return item.captionSource;
  return cap === String(offlineDraft ?? "").trim() ? "placeholder" : "human";
}

/**
 * True when a model may draft this cover's caption: a queue or approved cover whose caption is blank, or a placeholder
 * on a cover made since drafting started (fillFrom, ms). Older placeholders wait until backfill sets fillFrom to 0.
 * Typed and model captions are never replaced.
 */
export function canDraft(item, { offlineDraft, fillFrom } = {}) {
  if (!item || !["queue", "approved"].includes(item.status)) return false;
  const state = captionState(item, offlineDraft);
  if (state === "blank") return true;
  return state === "placeholder" && Number(item.createdAt || 0) >= Number(fillFrom || 0);
}
