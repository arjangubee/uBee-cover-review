// The words a plain word match counts (1.17.0's remix picks; since 1.21.0 the compose check's lines too). Lower case,
// accents and apostrophes off, common words out, endings trimmed, so "dancing" and "dance" read as one word.

// Words that carry no meaning of their own, left out of the match.
const STOP = new Set(("a an the and or but nor so yet of to in on at by for with from into onto over under about as than then "
  + "is am are was were be been being it its it's this that these those there here i me my mine you your yours we us our "
  + "ours they them their he him his she her hers do does did done have has had will would can could should may might must "
  + "not no just very too all any some each every more most what who whom which when where why how up down out off if").split(" "));

const plain = (text) => String(text ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "");

/** The words of a text that a match counts: lower case, accents and apostrophes off, common words out, endings trimmed. */
export function words(text) {
  return plain(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

/** Each counted word of a text as it's written there (lower case), with its stem: [{ word, stem }]. */
export function wordsAsWritten(text) {
  return plain(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => ({ word: w, stem: stem(w) }));
}

// waves, wave -> wav; dancing, danced, dance -> danc; mornings, morning -> morn. Short words stay as they are.
function stem(w) {
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}
