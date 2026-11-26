// Song picks for Shuffle and Remix (1.27.0, Quill #1119, Arjang #1092).
// 1. Exact request first: a prompt that names a song ("November - Tyler, The Creator", either order, or "Title by Artist")
//    is looked up on every song list, and the song it names is set as is. A dash request that isn't on any list is "not
//    found" and nothing changes; no same-artist stand-in.
// 2. No repeats: each cover keeps the songs it has had (songsTried). Shuffle and Remix never offer one of them again,
//    and say so once the list runs out (the next try starts over).
// 3. Right pool first: a plain pick matches the cover itself (her quote, the photo's description, the caption) over her
//    own song list, saved songs winning a tie. There's no genre pool and no built-in edge for any genre.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pickable } from "./music.js";
import { loadTrending } from "./services.js";
import { downloadedSongs, songFields } from "./songs.js";
import { DATA_DIR, store } from "./store.js";
import { words } from "./words.js";

const TRIED_MAX = 300;
/** A song name the way two names compare: lower case, accents and punctuation off, one space between words. */
export const songKey = (text) => String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** The best candidate for the weighted texts: the most matched words, then her saved ones, then a turn that moves with
 * the seed, so a pick with nothing to match still differs each time. */
export function best(cands, texts, seed) {
  const parts = texts.map(([weight, text]) => [weight, new Set(words(text))]);
  const n = cands.length;
  return cands.map((c, i) => {
    const own = new Set(words(c.text));
    let score = 0;
    for (const [weight, ws] of parts) for (const w of ws) if (own.has(w)) score += weight;
    return { c, score, turn: (((i - seed) % n) + n) % n };
  }).sort((a, b) => b.score - a.score || Number(Boolean(b.c.saved)) - Number(Boolean(a.c.saved)) || a.turn - b.turn)[0]?.c ?? null;
}

const listed = (songs, songSource, extra = {}) => songs.filter((s) => s && s.artist && s.title).map((s) => ({
  text: `${s.artist} - ${s.title}`, artist: String(s.artist), title: String(s.title), ...extra,
  fields: { song: `${s.artist} - ${s.title}`, songSource, songPreviewUrl: String(s.previewUrl || ""), songSpotifyUrl: String(s.spotifyUrl || ""),
    songFile: null, songHook: null } }));
const downloaded = (songs, saved) => songs.map((s) => ({ text: `${s.artist} - ${s.title}`, artist: String(s.artist ?? ""), title: String(s.title ?? ""),
  saved, fields: songFields(s) }));
function songPool() {
  const p = join(DATA_DIR, "song-pool.json");
  if (!existsSync(p)) return [];
  try { const v = JSON.parse(readFileSync(p, "utf8")); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Where a plain pick comes from, as a new cover's song does: the songs folder (or Symphony online) without her hidden
 * songs and with her saved ones first, else her Spotify library, else trending. */
export function songCandidates() {
  const { saved, rest } = pickable(downloadedSongs());
  if (saved.length || rest.length) return [...downloaded(saved, true), ...downloaded(rest, false)];
  const lib = store.settings.spotifyLibrary || [];
  if (lib.length) return listed(lib, "spotify");
  return listed(loadTrending().songs || [], "trending");
}

/** Every list an exact request is looked up on, in this order: the songs folder (hidden songs too: she named it), her
 * Spotify library, trending, then the song pool. */
function everySong() {
  return [...downloaded(downloadedSongs(), false), ...listed(store.settings.spotifyLibrary || [], "spotify"),
    ...listed(loadTrending().songs || [], "trending"), ...listed(songPool(), "manual")];
}

/** The two names a prompt gives for one song, or null when it doesn't name one. A dash splits it ("November - Tyler, The
 * Creator", or "Tyler, The Creator - November"); " by " does too ("November by Tyler, The Creator"), but only as a
 * try, since "by" also turns up in plain prompts. */
export function namedSong(prompt) {
  const text = String(prompt ?? "").trim().replace(/^["'“‘]+|["'”’]+$/g, "");
  const dash = text.split(/\s+[-\u2013\u2014]\s+/);
  if (dash.length === 2 && songKey(dash[0]) && songKey(dash[1])) return { a: songKey(dash[0]), b: songKey(dash[1]), sure: true };
  const by = text.split(/\s+by\s+/i);
  if (by.length === 2 && songKey(by[0]) && songKey(by[1])) return { a: songKey(by[0]), b: songKey(by[1]), sure: false };
  return null;
}

/** An exact request: { fields } when a list has the song, { error } when a dash request isn't on any list, and null when the
 * prompt names no song (or a " by " try found none), so the plain pick runs. */
export function exactSong(prompt) {
  const ask = namedSong(prompt);
  if (!ask) return null;
  const hit = everySong().find((c) => {
    const t = songKey(c.title), ar = songKey(c.artist);
    return (t === ask.a && ar === ask.b) || (t === ask.b && ar === ask.a);
  });
  if (hit) return { fields: hit.fields };
  if (!ask.sure) return null;
  return { error: `"${String(prompt).trim()}" isn't on your song lists, so nothing changed. Check the title and artist, or add it to your songs.` };
}

const triedOf = (item) => (Array.isArray(item.songsTried) ? item.songsTried.map(songKey).filter(Boolean) : []);
export const NO_OTHER = "There's no other song to pick. Your songs are hidden, or this cover has the only one.";
export const EXHAUSTED = "That's every song on your list for this cover. Shuffle again to start over.";

/**
 * A new song for a cover: { fields } or { error }. An exact request wins (and its "not found" changes nothing). Otherwise
 * the plain pick: never the cover's song or one it has had, matched to the cover (the prompt first when there is one).
 * Nothing on the item changes here; noteTried records a pick once it's made.
 */
export function pickSongFor(item, { prompt = "", quote = item.quote, seed = 0 } = {}) {
  const exact = exactSong(prompt);
  if (exact) return exact;
  const others = songCandidates().filter((c) => songKey(c.text) !== songKey(item.song) && !(item.songFile && c.fields.songFile === item.songFile));
  if (!others.length) return { error: NO_OTHER };
  const tried = new Set(triedOf(item));
  const cands = others.filter((c) => !tried.has(songKey(c.text)));
  if (!cands.length) return { error: EXHAUSTED, exhausted: true };
  const hit = best(cands, [[3, prompt], [2, quote], [1, item.description], [1, item.caption]], seed);
  return { fields: hit.fields };
}

/** After a pick: the song the cover had joins its tried list. A list that ran out starts over (exhausted). */
export function noteTried(item, before, { exhausted = false } = {}) {
  if (exhausted) { item.songsTried = []; return; }
  const key = songKey(before);
  if (!key) return;
  const list = triedOf(item).filter((k) => k !== key);
  list.push(key);
  item.songsTried = list.slice(-TRIED_MAX);
}

/** Shuffle (the button next to play): a new song matched to what the cover says, never one it has had. */
export function shuffleSong(item) {
  const out = pickSongFor(item, { seed: item.id + triedOf(item).length });
  if (out.fields || out.exhausted) noteTried(item, item.song, out);
  return out;
}
