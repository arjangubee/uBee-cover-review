// The remix menu (1.17.0; Rose #796 and #797, Quill #798 and #811). Remix asks for New quote, New song or both, each with
// an optional prompt. The app makes the pick itself, with no model: a plain word match of her prompt, what the photo shows
// and the cover's quote against her own quote stock only, and against the song list, where a hidden song is never picked
// and a saved song wins a tie. With both ticked the quote comes first, and the song is matched to the new quote. A pick
// lands as a new queue cover only once it passes the compose gate (QUOTE_IN_STOCK, SONG_IN_POOL). The work runs in the
// background while she reviews, and the page puts a finished remix right after the cover she's on. A remix that can't pick
// lands nothing and leaves a note on the cover it came from. A space with a model may make the same pick with it, under the
// same stock, pool and hidden rules and the same gate.
import { normalizeForStockCheck, quoteInStock, revisionOf, songInPool } from "./full.js";
import { pickable } from "./music.js";
import { generateCaption, loadQuotes, loadTrending } from "./services.js";
import { downloadedSongs, songFields } from "./songs.js";
import { currentSpace, runIn, store } from "./store.js";

export const PROMPT_MAX = 300;
const delay = () => Math.max(0, Number(process.env.COVER_REVIEW_REMIX_DELAY_MS) || 0); // tests slow it down to review meanwhile

// Words that carry no meaning of their own, left out of the match.
const STOP = new Set(("a an the and or but nor so yet of to in on at by for with from into onto over under about as than then "
  + "is am are was were be been being it its it's this that these those there here i me my mine you your yours we us our "
  + "ours they them their he him his she her hers do does did done have has had will would can could should may might must "
  + "not no just very too all any some each every more most what who whom which when where why how up down out off if").split(" "));

/** The words of a text that a match counts: lower case, accents and apostrophes off, common words out, endings trimmed. */
export function words(text) {
  return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}
// waves, wave -> wav; dancing, danced, dance -> danc; mornings, morning -> morn. Short words stay as they are.
function stem(w) {
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}
const same = (a, b) => String(a ?? "").trim().replace(/\s+/g, " ").toLowerCase() === String(b ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The best candidate for the weighted texts: the most matched words, then (songs) her saved ones, then a turn that
 * moves with each remix, so a remix with nothing to match still gets a different pick each time. */
function best(cands, texts, seed) {
  const parts = texts.map(([weight, text]) => [weight, new Set(words(text))]);
  const n = cands.length;
  return cands.map((c, i) => {
    const own = new Set(words(c.text));
    let score = 0;
    for (const [weight, ws] of parts) for (const w of ws) if (own.has(w)) score += weight;
    return { c, score, turn: (((i - seed) % n) + n) % n };
  }).sort((a, b) => b.score - a.score || Number(Boolean(b.c.saved)) - Number(Boolean(a.c.saved)) || a.turn - b.turn)[0]?.c ?? null;
}

function pickQuote(src, prompt, seed) {
  // Her stock, each quote once and never the cover's own, read the way the stock check reads them (1.17.1).
  const now = normalizeForStockCheck(src.quote);
  const stock = new Map();
  for (const q of loadQuotes()) {
    const text = String(q?.text ?? "").trim(), key = normalizeForStockCheck(text);
    if (key && key !== now && !stock.has(key)) stock.set(key, text);
  }
  const hit = best([...stock.values()].map((text) => ({ text })), [[3, prompt], [2, src.description], [1, src.quote]], seed);
  return hit ? { quote: hit.text } : { error: "Your quote list has no other quote to pick from." };
}

// Where a new song comes from, like a new cover's: the songs folder (or Symphony online) first, without her hidden songs
// and with her saved ones first, then her Spotify library, then trending.
function songCandidates() {
  const { saved, rest } = pickable(downloadedSongs());
  if (saved.length || rest.length) {
    return [...saved.map((s) => [s, true]), ...rest.map((s) => [s, false])]
      .map(([s, isSaved]) => ({ text: `${s.artist} - ${s.title}`, saved: isSaved, fields: songFields(s) }));
  }
  const listed = (songs, songSource) => songs.map((s) => ({ text: `${s.artist} - ${s.title}`, fields: { song: `${s.artist} - ${s.title}`, songSource,
    songPreviewUrl: String(s.previewUrl || ""), songSpotifyUrl: String(s.spotifyUrl || ""), songFile: null, songHook: null } }));
  const lib = store.settings.spotifyLibrary || [];
  if (lib.length) return listed(lib, "spotify");
  return listed(loadTrending().songs || [], "trending");
}

function pickSong(src, quote, prompt, seed) {
  const cands = songCandidates().filter((c) => !same(c.text, src.song) && !(src.songFile && c.fields.songFile === src.songFile));
  const hit = best(cands, [[3, prompt], [2, quote], [1, src.description]], seed);
  return hit ? { fields: hit.fields } : { error: "There's no other song to pick. Your songs are hidden, or this cover has the only one." };
}

/** The new cover's quote and song fields, or the reason there's none. Each pick has to pass its part of the compose gate. */
function pickFor(src, rec) {
  const seed = src.id * 31 + rec.id;
  const fields = {};
  let quote = src.quote;
  if (rec.quote.on) {
    const q = pickQuote(src, rec.quote.prompt, seed);
    if (q.error) return q;
    if (!quoteInStock(q.quote)) return { error: "The new quote isn't on your quote list." }; // QUOTE_IN_STOCK
    fields.quote = quote = q.quote;
  }
  if (rec.song.on) {
    const s = pickSong(src, quote, rec.song.prompt, seed);
    if (s.error) return s;
    if (!songInPool(s.fields)) return { error: "The new song isn't on your song list." }; // SONG_IN_POOL
    Object.assign(fields, s.fields);
  }
  return { fields };
}

const remixes = () => (store.db.remixes ||= []);
function nextRemixId() {
  const id = Number(store.db.nextRemixId) || 1;
  store.db.nextRemixId = id + 1;
  return id;
}

/** Moves a cover right after another one, or, with no other one there, to the front of the queue. */
function moveItem(id, afterId) {
  const items = store.db.items;
  const from = items.findIndex((i) => i.id === id);
  if (from < 0) return false;
  const [it] = items.splice(from, 1);
  const at = afterId == null ? -1 : items.findIndex((i) => i.id === afterId);
  if (at >= 0) items.splice(at + 1, 0, it);
  else { const first = items.findIndex((i) => i.status === "queue"); items.splice(first < 0 ? items.length : first, 0, it); }
  return true;
}

function finish(id) {
  const rec = remixes().find((r) => r.id === id);
  if (!rec || rec.status !== "pending") return;
  const src = store.getItem(rec.sourceId);
  const out = src ? pickFor(src, rec) : { error: "The cover this remix came from isn't there anymore." };
  rec.finishedAt = Date.now();
  if (out.error) {
    Object.assign(rec, { status: "failed", error: out.error });
    if (src) src.lastRemix = { status: "failed", error: out.error, at: rec.finishedAt, remixId: rec.id };
    store.saveDb();
    return;
  }
  // The new cover is the old remix's copy (the photo, its layout, style and color, slides and photo edits, her note) with
  // the new picks. What explained or rated the old quote or song doesn't carry: why it matches, and that part's stars.
  // A remix of a remix keeps one " (remix)" on its title (Quill #826 item 4).
  const title = String(src.title ?? "").endsWith(" (remix)") ? src.title : `${src.title} (remix)`;
  const copy = { ...revisionOf(src), status: "queue", parentId: src.id, revision: (src.revision || 1) + 1, title,
    createdAt: rec.finishedAt, why: null, ...out.fields };
  delete copy.lastRemix;
  if (rec.quote.on) {
    // She asked for a new quote, so it shows: a quote she had turned off on the old cover comes back on here.
    delete copy.showQuoteSet;
    copy.showQuote = false;
    copy.quoteRating = null;
    copy.caption = generateCaption(copy, store.settings.voiceProfile);
    copy.captionSource = "placeholder"; // the offline draft; a model may replace it, as on any new cover
  }
  if (rec.song.on) copy.songRating = null;
  const item = store.addItem(copy);
  moveItem(item.id, src.id); // it waits right after the cover it came from until the page puts it after the one she's on
  delete src.lastRemix;
  Object.assign(rec, { status: "done", itemId: item.id });
  store.saveDb();
}

// One timer per waiting remix. A remix a restart left waiting starts again the next time the page asks.
const running = new Set();
function schedule(rec) {
  const space = currentSpace();
  const key = `${space}\u0000${rec.id}`;
  if (running.has(key)) return;
  running.add(key);
  setTimeout(() => runIn(space, () => { try { finish(rec.id); } finally { running.delete(key); } }), delay());
}

function partOf(v) {
  const on = v?.on === true;
  const prompt = on ? String(v?.prompt ?? "").trim() : "";
  return prompt.length > PROMPT_MAX ? { error: `Keep each prompt to ${PROMPT_MAX} characters or fewer.` } : { on, prompt };
}

export function registerRemix(app) {
  // { quote: { on, prompt }, song: { on, prompt } }: at least one ticked. Answers the waiting remix right away.
  app.post("/api/items/:id/remix", (req, res) => {
    const src = store.getItem(req.params.id);
    if (!src) return res.status(404).json({ error: "item not found" });
    const quote = partOf(req.body?.quote), song = partOf(req.body?.song);
    if (quote.error || song.error) return res.status(400).json({ error: quote.error || song.error });
    if (!quote.on && !song.on) return res.status(400).json({ error: "Tick New quote, New song or both." });
    const rec = { id: nextRemixId(), sourceId: src.id, quote, song, status: "pending", itemId: null, error: null, createdAt: Date.now(), finishedAt: null };
    remixes().push(rec);
    delete src.lastRemix; // a new try clears the old note
    store.saveDb();
    schedule(rec);
    res.json({ remix: rec });
  });
  // The remixes the page hasn't placed or shown yet: waiting, done, or failed.
  app.get("/api/remixes", (_req, res) => {
    for (const r of remixes()) if (r.status === "pending") schedule(r);
    res.json({ remixes: remixes() });
  });
  // The page has it: a done remix moves right after the cover she's on ({ after: id }), or to the front of the queue
  // ({ after: null }); a failed one has been shown. Either way it's off the list.
  app.post("/api/remixes/:id/ack", (req, res) => {
    const list = remixes();
    const at = list.findIndex((r) => r.id === Number(req.params.id));
    if (at < 0) return res.status(404).json({ error: "That remix isn't waiting." });
    const rec = list[at];
    if (rec.status === "pending") return res.status(409).json({ error: "That remix is still being made." });
    const placed = rec.status === "done" && moveItem(rec.itemId, req.body?.after == null ? null : Number(req.body.after));
    list.splice(at, 1);
    store.saveDb();
    res.json({ remix: { ...rec, placed } });
  });
}
