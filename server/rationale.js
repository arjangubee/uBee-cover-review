// The compose check's lines (1.21.0, Big Edit item 12). Arjang: "this space holds the rationale behind your media
// composition: should have a short blurb that argues each decision like a caveman. A five year old should be able to
// understand the connections from your argument. Since Image gets selected first, its gets no rationale."
// So a check writes one short line for the quote and one for the song, and none for the image. This server has no model:
// its own lines come from the words the photo (her Muse's description of it), the quote and the song's title share, and
// say where the quote or the song came from when they share none. A space with a model maps rationale-fill to its model
// call with rationalePrompt; its lines land only inside rationaleProblems' rules and for the quote and song they were
// written for (basedOn), and a later check keeps them while those stay the same.
import { wordsAsWritten } from "./words.js";

// The caption rules' emoji ranges, written as code points.
const EMOJI = new RegExp(`[${[[0x1F000, 0x1FAFF], [0x1F1E6, 0x1F1FF], [0x2600, 0x27BF], [0x2B00, 0x2BFF], [0xFE0F], [0x200D], [0x203C], [0x2049],
  [0x2122], [0x2139], [0x2194, 0x21AA], [0x231A, 0x23FF], [0x24C2], [0x25AA, 0x25FE], [0x3030], [0x303D], [0x3297], [0x3299]]
  .map(([a, b]) => (b ? `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}` : String.fromCodePoint(a))).join("")}]`, "u");
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|--`); // en and em dashes, or two hyphens
export const LINE_MAX = 120; // characters
export const WORDS_MAX = 18;

/** The song's title from "Artist - Title" (the whole name when there's no dash). */
const titleOf = (song) => { const s = String(song ?? ""); const at = s.indexOf(" - "); return at >= 0 ? s.slice(at + 3) : s; };

/** The first word of `text` that `other` has too, as each writes it: { mine, theirs }, or null. */
function shared(text, other) {
  const theirs = new Map();
  for (const w of wordsAsWritten(other)) if (!theirs.has(w.stem)) theirs.set(w.stem, w.word);
  for (const w of wordsAsWritten(text)) if (theirs.has(w.stem)) return { mine: w.word, theirs: theirs.get(w.stem) };
  return null;
}
const too = (a, b) => (a === b ? `${b} too` : b);

/**
 * The offline lines for a cover: { quote, song }, each a short caveman line or null when that part isn't there.
 * quoteOn: the quote shows on the cover. saved: she saved the cover's song. quoteInStock and songInPool: the check's
 * QUOTE_IN_STOCK and SONG_IN_POOL. A part that fails its check is never argued for: its line says what to fix.
 */
export function offlineRationale(item, { quoteOn = true, saved = false, quoteInStock = true, songInPool = true } = {}) {
  const pic = String(item?.description ?? "").trim();
  const quoteText = String(item?.quote ?? "").trim();
  let quote = null;
  if (!quoteOn) quote = "No words on picture this time. Picture talk alone.";
  else if (quoteText && quoteInStock === false) quote = "Words not on your list. Pick words from your list.";
  else if (quoteText) {
    const hit = pic ? shared(quoteText, pic) : null; // mine: the quote's word, theirs: the photo's
    quote = hit ? `Picture have ${hit.theirs}. Words say ${too(hit.theirs, hit.mine)}. Same thing, so them go together.`
      : "Words come from your own list. Your words go with your picture.";
  }
  let song = null;
  const name = String(item?.song ?? "").trim();
  if (name && !songInPool) song = "Song not on your song list. Pick a song from your list.";
  else if (name) {
    const title = titleOf(name);
    const withWords = quoteOn && quoteText ? shared(title, quoteText) : null;
    const withPic = !withWords && pic ? shared(title, pic) : null;
    if (withWords) song = `Song say ${withWords.mine}. Words say ${too(withWords.mine, withWords.theirs)}. Song fit words.`;
    else if (withPic) song = `Song say ${withPic.mine}. Picture have ${too(withPic.mine, withPic.theirs)}. Song fit picture.`;
    else if (saved) song = "You save this song. You like it, so it go here.";
    else if (item.songSource === "trending") song = "Many people use this song now. People hear it and stop to look.";
    else if (item.songSource === "spotify") song = "Song come from your own music. It sound like you.";
    else song = "Song come from your song list. It ready for your posts.";
  }
  return { quote, song };
}

/** What's wrong with a model's lines, in plain words: [] when they can go on the card. */
export function rationaleProblems(lines) {
  const out = [];
  for (const [key, label] of [["quote", "The quote line"], ["song", "The song line"]]) {
    const v = lines?.[key];
    if (v == null) continue; // that part isn't on the cover
    const line = String(v);
    if (!line.trim()) out.push(`${label} is empty.`);
    else if (/[\r\n]/.test(line)) out.push(`${label} has to be one line.`);
    else if (EMOJI.test(line)) out.push(`${label} has an emoji. Use words only.`);
    else if (DASH.test(line)) out.push(`${label} has a long dash. Use short sentences instead.`);
    else if (line.trim().length > LINE_MAX) out.push(`${label} is ${line.trim().length} characters. The most is ${LINE_MAX}.`);
    else if (line.trim().split(/\s+/).length > WORDS_MAX) out.push(`${label} is ${line.trim().split(/\s+/).length} words. Use ${WORDS_MAX} at most.`);
  }
  return out;
}

/** The prompt a space's model answers with { "quote": "...", "song": "..." }. */
export function rationalePrompt(item, { quoteOn = true } = {}) {
  const pic = String(item?.description ?? "").trim();
  const quoteText = String(item?.quote ?? "").trim();
  const song = String(item?.song ?? "").trim();
  return [
    "Argue like a caveman why each part of this cover goes with its picture. The picture was picked first, so it gets no line.",
    "Write one short line for the quote and one for the song. Use tiny words a five year old knows. Name what is in the picture,",
    `and the word or feeling in the quote or song that matches it. ${WORDS_MAX} words or fewer a line. No emoji, no dashes.`,
    "Example: Picture have beach. Words say ocean. Beach have ocean, so them go together.",
    "",
    `Picture: ${pic || "look at the image."}`,
    quoteOn && quoteText ? `Quote: "${quoteText}"` : "Quote: none shows on this cover. Say so, in caveman words.",
    song ? `Song: ${song}` : "Song: none. Answer null for the song.",
    "",
    'Answer with JSON only: {"quote": "...", "song": "..."}',
  ].join("\n");
}

/** What the lines are about: the quote and the song as they are, and whether the quote shows. */
export const basisOf = (item, quoteOn) => ({ quote: String(item?.quote ?? ""), song: String(item?.song ?? ""), quoteOn: Boolean(quoteOn) });
export const sameBasis = (a, b) => Boolean(a && b) && a.quote === b.quote && a.song === b.song && Boolean(a.quoteOn) === Boolean(b.quoteOn);
