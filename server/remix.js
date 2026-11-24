// The remix menu (1.17.0; Rose #796 and #797, Quill #798 and #811). Remix asks for New quote, New song or both, each with
// an optional prompt. The app makes the pick itself, with no model: a plain word match of her prompt, what the photo shows
// and the cover's quote against her own quote stock only, and against the song list, where a hidden song is never picked
// and a saved song wins a tie. With both ticked the quote comes first, and the song is matched to the new quote. A pick
// lands as a new queue cover only once it passes the compose gate (QUOTE_IN_STOCK, SONG_IN_POOL). The work runs in the
// background while she reviews, and the page puts a finished remix right after the cover she's on. A remix that can't pick
// lands nothing and leaves a note on the cover it came from. A space with a model may make the same pick with it, under the
// same stock, pool and hidden rules and the same gate.
// 1.21.0 (Big Edit item 16): the page remixes on the spot instead (remix-now, at the end). Arjang's final word (room #960):
// "It should never duplicate." So the background route makes nothing now, and a remix a page from before 1.21.0 left
// waiting closes with a note instead of a copy. A copy such a page already made still goes where the page puts it.
import { captionState } from "./captionDrafts.js";
import { cleanWhy, normalizeForStockCheck, quoteInStock, recheckSaved, songInPool, verifyItem } from "./full.js";
import { pickable } from "./music.js";
import { generateCaption, loadQuotes, loadTrending } from "./services.js";
import { SONG_SOURCES, cleanHook, cleanSongFile, downloadedSongs, songFields } from "./songs.js";
import { store } from "./store.js";
import { words } from "./words.js";

export const PROMPT_MAX = 300;

// The match's words live in words.js since 1.21.0, for the compose check's lines too.
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
  // The queue reads in review order (1.20.1), so the cover takes its place there too: the same review time as the cover
  // it follows, so it sits right after it, or a time before every queued cover at the front.
  const after = at >= 0 ? items[at] : null;
  if (after && typeof after.reviewOrderAt === "number") it.reviewOrderAt = after.reviewOrderAt;
  else if (after) delete it.reviewOrderAt;
  else it.reviewOrderAt = store.frontTimes(1)[0];
  return true;
}

// What a remix left waiting by a page from before 1.21.0 says when it closes: it makes no copy (room #960).
export const LEFT_WAITING = "Remix works on the spot now. Open the cover and remix it again.";
/** A remix a page from before 1.21.0 left waiting closes with a note, and nothing new comes into the queue. */
function closeWaiting() {
  let closed = 0;
  for (const r of remixes()) if (r.status === "pending") { Object.assign(r, { status: "failed", error: LEFT_WAITING, finishedAt: Date.now() }); closed += 1; }
  if (closed) store.saveDb();
}

function partOf(v) {
  const on = v?.on === true;
  const prompt = on ? String(v?.prompt ?? "").trim() : "";
  return prompt.length > PROMPT_MAX ? { error: `Keep each prompt to ${PROMPT_MAX} characters or fewer.` } : { on, prompt };
}

// ---------- Remix on the spot (1.21.0, Big Edit item 16) ----------
// Arjang: "It should remix it instantly instead of putting it next in queue." Submit changes the cover she's on right
// away, in any list, with the picks and the gate above. Nothing new comes into the queue. What was about the old quote or
// song drops, as on 1.17's copy, and the cover is one version newer. A caption she typed stays hers; a drafted one is
// drafted again for a new quote. A checked cover is checked again. The answer carries the fields before and after, so
// undo and redo can put either back through remix-fields.

/** Every field a remix can change, and so every field undo puts back. A field the cover doesn't have reads as null. */
const OWN = ["quote", "song", "songSource", "songPreviewUrl", "songSpotifyUrl", "songFile", "songHook", "showQuote", "showQuoteSet",
  "quoteRating", "songRating", "why", "caption", "captionSource", "revision", "remixedAt"];
const GONE_WHEN_NULL = new Set(["showQuoteSet", "captionSource", "revision", "remixedAt"]); // null takes the field off
const ownFields = (item) => Object.fromEntries(OWN.map((k) => [k, item[k] === undefined ? null : structuredClone(item[k])]));
const rating = (v) => Number.isInteger(v) && v >= 1 && v <= 10;

/** The fields undo or redo sends back, each checked like the route that sets it. Anything else is left out. */
function cleanOwn(f) {
  if (!f || typeof f !== "object" || Array.isArray(f) || !OWN.some((k) => k in f)) return { error: "Send the fields to put back." };
  const out = {};
  for (const k of OWN.filter((key) => key in f)) {
    const v = f[k];
    if (v === null) { out[k] = null; continue; }
    switch (k) {
      case "songSource":
        if (!SONG_SOURCES.includes(v)) return { error: "That song source isn't one." };
        out[k] = v; break;
      case "songFile":
        if (!cleanSongFile(v)) return { error: "That song clip isn't a clip in the songs folder or in Symphony." };
        out[k] = cleanSongFile(v); break;
      case "songHook":
        if (!cleanHook(v)) return { error: "That song hook isn't a start and an end." };
        out[k] = cleanHook(v); break;
      case "showQuote": case "showQuoteSet":
        if (typeof v !== "boolean") return { error: `${k} is true or false.` };
        out[k] = v; break;
      case "quoteRating": case "songRating":
        if (!rating(v)) return { error: "A rating is a whole number from 1 to 10." };
        out[k] = v; break;
      case "why": {
        const why = cleanWhy(v);
        if (!why) return { error: "Say why it matches, in a sentence or two." };
        if (Number.isFinite(Number(v.recordedAt)) && Number(v.recordedAt) > 0) why.recordedAt = Number(v.recordedAt); // when it was said
        out[k] = why; break;
      }
      case "captionSource":
        if (!["placeholder", "model", "human"].includes(v)) return { error: "That caption source isn't one." };
        out[k] = v; break;
      case "revision":
        if (!Number.isInteger(v) || v < 1) return { error: "A version is a whole number from 1 up." };
        out[k] = v; break;
      case "remixedAt":
        if (!Number.isFinite(v) || v < 0) return { error: "remixedAt is a time." };
        out[k] = v; break;
      default: out[k] = String(v); // quote, song, caption and the song's two links
    }
  }
  return { fields: out };
}

export function registerRemix(app) {
  // The 1.17 background remix made a new cover, so it's gone (room #960: "It should never duplicate."). A page opened
  // before 1.21.0 hears why; reloaded, it remixes on the spot.
  app.post("/api/items/:id/remix", (_req, res) => res.status(410).json({ error: "Remix changes the cover on the spot now. Reload the page and remix it again." }));
  // The remixes the page hasn't placed or shown yet: waiting, done, or failed.
  app.get("/api/remixes", (_req, res) => {
    closeWaiting();
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

  // Remix on the spot (1.21.0): { quote: { on, prompt }, song: { on, prompt } }, at least one ticked. Answers the cover as it
  // is now, with the remix's fields before and after; 422 with the reason when it can't pick, and then nothing changes.
  app.post("/api/items/:id/remix-now", (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: "item not found" });
    const quote = partOf(req.body?.quote), song = partOf(req.body?.song);
    if (quote.error || song.error) return res.status(400).json({ error: quote.error || song.error });
    if (!quote.on && !song.on) return res.status(400).json({ error: "Tick New quote, New song or both." });
    delete item.lastRemix; // a new try clears a note an older remix left (1.17)
    const out = pickFor(item, { id: nextRemixId(), quote, song }); // the counter moves, so each remix picks something new
    if (out.error) {
      store.saveDb();
      return res.status(422).json({ error: out.error });
    }
    const before = ownFields(item);
    const typed = captionState(item, generateCaption(item, store.settings.voiceProfile)) === "human"; // read with the old quote
    Object.assign(item, out.fields, { revision: (item.revision || 1) + 1, why: null, remixedAt: Date.now() });
    if (quote.on) {
      // She asked for a new quote, so it shows: a quote she had turned off on this cover comes back on.
      delete item.showQuoteSet;
      item.showQuote = false;
      item.quoteRating = null;
      if (!typed) {
        item.caption = generateCaption(item, store.settings.voiceProfile);
        item.captionSource = "placeholder"; // the offline draft; a model may replace it, as on any new cover
      }
    }
    if (song.on) item.songRating = null;
    if (item.beacons) verifyItem(item); // a checked cover is checked again with its new picks
    store.saveDb();
    res.json({ item, before, after: ownFields(item) });
  });

  // Undo and redo of a remix on the spot (1.21.0): { fields } from remix-now's before or after. Only a remix's own fields,
  // each checked. A checked cover is checked again, so its check always matches what it shows.
  app.post("/api/items/:id/remix-fields", (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: "item not found" });
    const { fields, error } = cleanOwn(req.body?.fields);
    if (error) return res.status(400).json({ error });
    for (const [k, v] of Object.entries(fields)) {
      if (v === null && GONE_WHEN_NULL.has(k)) delete item[k];
      else item[k] = v;
    }
    if (item.beacons) recheckSaved(item);
    store.saveDb();
    res.json({ item });
  });
}
