// Symphony online (1.12; Arjang #477, #480 and #483, Quill #497 and #500, Symphony #496). Symphony's Mac publishes
// its songs after each daily update to a private feed. A space connects it with a Symphony code from uBee, kept only
// in data/settings.json like the Pollen code, and never answered by any endpoint. This server reads the feed and keeps
// it for 30 minutes, so the code never reaches the page. Hook clips go through /api/symphony/clips/:id, which redirects
// to a signed link, so a cover stores a stable "symphony:<id>" and never a link that expires. Nothing changes until a
// code is connected.
import { store } from "./store.js";

export const SYMPHONY_URL = process.env.COVER_REVIEW_SYMPHONY_URL || "https://evmqkvnclbqcijlyezrr.supabase.co/functions/v1/symphony";
const FRESH_MS = Number(process.env.COVER_REVIEW_SYMPHONY_FRESH_MS || 30 * 60 * 1000);
const RETRY_MS = 60 * 1000; // after a failed read, wait this long before trying again on its own
const LINK_MARGIN_MS = 10 * 60 * 1000; // links this close to expiring are read again before a redirect
const PREFIX = "symphony:";
const ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const MAX_PARTS = 8;

const REFUSED = "That Symphony code didn't work. Check it with uBee.";
const REVOKED = "That Symphony code doesn't work anymore. Ask uBee for a new one.";
const OFFLINE = "Can't reach Symphony right now. Check the internet and try again.";
export const MISSING_ONLINE_CLIP = "This cover's song clip isn't in Symphony right now. Shuffle the song or check the Symphony code.";

class SymphonyError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** The song id in a cover's songFile when it's a Symphony clip ("symphony:<id>"), else null. */
export function symphonyId(file) {
  const f = String(file ?? "");
  if (!f.startsWith(PREFIX)) return null;
  const id = f.slice(PREFIX.length);
  return ID.test(id) ? id : null;
}
export const isSymphonyFile = (file) => String(file ?? "").startsWith(PREFIX);
export const symphonyClipUrl = (id, part = 0) => `/api/symphony/clips/${id}${part ? `?part=${part}` : ""}`;

// ---------- Reading the feed: only what the screens use, in the types they expect ----------
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function https(u) {
  try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : null; } catch { return null; }
}
// A clip link has to point at Symphony's own storage, so a redirect can never send the page anywhere else.
function clipLink(u) {
  try { const x = new URL(String(u)); return x.origin === new URL(SYMPHONY_URL).origin ? x.href : null; } catch { return null; }
}
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const span = (p) => {
  const start = num(p?.start), end = num(p?.end);
  return start != null && end != null && start >= 0 && end > start ? { start, end } : null;
};

function readSong(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id, 120), artist = text(raw.artist, 200), title = text(raw.title, 200);
  if (!ID.test(id) || !artist || !title) return null;
  const hook = span({ start: raw.hookStart, end: raw.hookEnd });
  const parts = hook ? (Array.isArray(raw.parts) ? raw.parts : []).map(span).filter(Boolean).slice(0, MAX_PARTS) : [];
  const clipLinks = hook ? (Array.isArray(raw.clipUrls) ? raw.clipUrls : raw.clipUrl ? [raw.clipUrl] : []).slice(0, MAX_PARTS).map(clipLink) : [];
  const today = {};
  for (const [k, v] of Object.entries(raw.today && typeof raw.today === "object" ? raw.today : {})) {
    const rank = num(v?.rank);
    if (/^[a-z]{2,20}$/.test(k) && rank != null) today[k] = { rank, move: v?.move == null ? null : text(String(v.move), 12) };
  }
  const signals = {};
  for (const [k, v] of Object.entries(raw.depth?.signals && typeof raw.depth.signals === "object" ? raw.depth.signals : {})) {
    if (/^[a-zA-Z]{1,30}$/.test(k)) signals[k] = Boolean(v);
  }
  const starts = raw.previewStart && typeof raw.previewStart === "object" ? raw.previewStart : {};
  return {
    id, artist, title, artwork: https(raw.artwork), genre: text(raw.genre, 60) || null,
    durationSec: num(raw.durationSec), addedAt: text(raw.addedAt, 40) || null, analyzed: Boolean(raw.analyzed),
    error: text(raw.error, 200) || null, popularity: num(raw.popularity) ?? 0, watch: https(raw.watch), isrc: text(raw.isrc, 20) || null,
    links: { apple: https(raw.links?.apple), spotify: https(raw.links?.spotify), youtube: https(raw.links?.youtube) },
    today,
    hook: hook ? {
      ...hook, label: text(raw.hookLabel, 40) || `${clock(hook.start)} to ${clock(hook.end)}`,
      level: ["high", "medium", "low"].includes(raw.level) ? raw.level : null,
      parts: parts.length ? parts : [hook],
      lines: (Array.isArray(raw.lines) ? raw.lines : []).map((l) => text(l, 200)).filter(Boolean).slice(0, 12),
    } : null,
    previewStart: { apple: num(starts.apple), deezer: num(starts.deezer), spotify: num(starts.spotify) },
    previewUrl: { apple: https(raw.previewUrl?.apple), spotify: https(raw.previewUrl?.spotify) },
    replayPeak: num(raw.replayPeak),
    replay: Array.isArray(raw.replay) && raw.replay.length && raw.replay.length <= 200 ? raw.replay.map((v) => Math.max(0, Math.min(99, Math.round(num(v) ?? 0)))) : null,
    depth: raw.depth && typeof raw.depth === "object" ? { score: num(raw.depth.score) ?? 0, max: num(raw.depth.max) ?? 0, signals } : null,
    chorusCount: num(raw.chorusCount) ?? 0, views: num(raw.views),
    clipLinks, // stays on this server: the page gets this app's own clip addresses
  };
}

function readFeed(doc) {
  const list = Array.isArray(doc?.songs) ? doc.songs : null;
  if (!list) throw new SymphonyError("Symphony's feed has no songs list. Try again later.", 502);
  const songs = [];
  const byId = new Map();
  for (const raw of list) {
    const s = readSong(raw);
    if (s && !byId.has(s.id)) { byId.set(s.id, s); songs.push(s); }
  }
  const rows = (Array.isArray(doc.hot?.rows) ? doc.hot.rows : [])
    .map((r) => ({ id: text(r?.id, 120), badges: (Array.isArray(r?.badges) ? r.badges : []).map((b) => ({ text: text(b?.text, 60) })).filter((b) => b.text).slice(0, 4) }))
    .filter((r) => byId.has(r.id));
  // The songs a cover can take: a hook and its clip. New hot first, in its order, then the rest as the feed lists them.
  const playable = (s) => Boolean(s.hook && s.clipLinks[0]);
  const hotIds = new Set(rows.map((r) => r.id));
  const picks = [...rows.map((r) => byId.get(r.id)), ...songs.filter((s) => !hotIds.has(s.id))].filter(playable).map((s) => ({
    id: s.id, artist: s.artist, title: s.title, hookStart: s.hook.start, hookEnd: s.hook.end, hookFile: `${PREFIX}${s.id}`, clipUrl: symphonyClipUrl(s.id),
    spotifyUrl: /^https:\/\/open\.spotify\.com\//.test(s.links.spotify || "") ? s.links.spotify : "",
    ...(Object.values(s.previewStart).some((v) => v != null) ? { previewStart: Object.fromEntries(Object.entries(s.previewStart).filter(([, v]) => v != null)) } : {}),
    ...(s.replayPeak != null ? { replayPeak: s.replayPeak } : {}),
  }));
  const expires = Date.parse(doc.linksExpireAt || "");
  return {
    updatedAt: text(doc.updatedAt, 40) || null, day: text(doc.day, 20) || null, linksExpireAt: Number.isFinite(expires) ? expires : null,
    hot: { date: text(doc.hot?.date, 20) || null, rows }, songs, byId, picks,
  };
}

// ---------- The connection and the cached feed ----------
const sym = () => store.settings.symphony || null;
export const symphonyConnected = () => Boolean(sym()?.code);

let feed = null; // { at, updatedAt, day, linksExpireAt, hot, songs, byId, picks }
let refreshing = null;
let lastError = null;
let lastTry = 0;
let generation = 0; // a read that started before a connect or disconnect is thrown away

async function fetchFeed(code) {
  let r;
  try {
    r = await fetch(`${SYMPHONY_URL}/feed`, { headers: { Authorization: `Bearer ${code}` }, signal: AbortSignal.timeout(20000) });
  } catch { throw new SymphonyError(OFFLINE, 502); }
  if (r.status === 401) throw new SymphonyError(REFUSED, 401);
  if (!r.ok) throw new SymphonyError(`Symphony answered ${r.status}. Try again later.`, 502);
  let doc;
  try { doc = await r.json(); } catch { throw new SymphonyError("Symphony's feed didn't read right. Try again later.", 502); }
  return readFeed(doc);
}

function revoke() {
  store.settings.symphony = { revoked: true, revokedAt: Date.now() };
  store.saveSettings();
  generation += 1;
  feed = null;
}

function refresh() {
  const code = sym()?.code;
  if (!code) return Promise.resolve(null);
  if (refreshing) return refreshing;
  const gen = generation;
  lastTry = Date.now();
  refreshing = (async () => {
    try {
      const next = await fetchFeed(code);
      if (gen === generation) { feed = { ...next, at: Date.now() }; lastError = null; }
    } catch (e) {
      if (gen === generation) {
        if (e.status === 401) revoke();
        lastError = e.status === 401 ? REVOKED : e.message;
      }
    } finally { refreshing = null; }
    return feed;
  })();
  return refreshing;
}

const fresh = (f) => Boolean(f) && Date.now() - f.at < FRESH_MS;
const linksExpiring = (f) => Boolean(f?.linksExpireAt) && Date.now() > f.linksExpireAt - LINK_MARGIN_MS;

/** The feed, read again first when it's older than 30 minutes (or always, with force). A failed read keeps the last one. */
async function ensureFresh({ force = false } = {}) {
  if (!symphonyConnected()) return null;
  if (force || !fresh(feed)) await refresh();
  return feed;
}

/** The feed as it is now, without waiting. A stale feed starts a read in the background. */
function currentFeed() {
  if (!symphonyConnected()) return null;
  if (!fresh(feed) && !refreshing && Date.now() - lastTry > (lastError ? RETRY_MS : 0)) refresh().catch(() => {});
  return feed;
}

/** Symphony's songs with a hook clip, in the songs folder's shape, for picks and matches. None when not connected. */
export function onlineSongs() {
  return currentFeed()?.picks || [];
}

/** True when the feed has this cover's Symphony clip right now. */
export function symphonyClipReady(file) {
  const id = symphonyId(file);
  return Boolean(id && currentFeed()?.byId.get(id)?.clipLinks[0]);
}

/** The clip's bytes, for Pollen. Throws with a plain reason when it can't get them. */
export async function symphonyClipBytes(file) {
  const id = symphonyId(file);
  let f = await ensureFresh();
  if (f && linksExpiring(f)) f = await ensureFresh({ force: true });
  const link = id ? f?.byId.get(id)?.clipLinks[0] : null;
  if (!link) throw new SymphonyError(MISSING_ONLINE_CLIP, 409);
  let r;
  try { r = await fetch(link, { signal: AbortSignal.timeout(60000) }); } catch { throw new SymphonyError(OFFLINE, 502); }
  if (!r.ok) throw new SymphonyError(`The song clip didn't download from Symphony (${r.status}). Try again.`, 502);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim();
  return { body: Buffer.from(await r.arrayBuffer()), type: /^audio\//.test(type) ? type : "audio/mp4" };
}

/** What the app shows: connected, how many songs, when. Never the code. */
export function symphonyStatus() {
  const p = sym();
  if (!p?.code) return { connected: false, revoked: Boolean(p?.revoked), ...(p?.revoked ? { message: REVOKED } : {}) };
  const f = currentFeed();
  return {
    connected: true, revoked: false, songs: f ? f.songs.length : null, withClips: f ? f.picks.length : null,
    updatedAt: f?.updatedAt || null, day: f?.day || null, checkedAt: f ? new Date(f.at).toISOString() : null,
    ...(lastError ? { message: lastError } : {}),
  };
}

/** Connects with a code (checked by reading the feed with it), or disconnects with null. Covers keep their songs. */
export async function connectSymphony(code) {
  if (code == null || String(code).trim() === "") {
    delete store.settings.symphony;
    store.saveSettings();
    generation += 1;
    feed = null; lastError = null;
    return { ok: true, ...symphonyStatus() };
  }
  const c = String(code).trim();
  if (c.length < 32 || c.length > 256 || /\s/.test(c)) throw new SymphonyError(REFUSED, 400);
  const next = await fetchFeed(c);
  generation += 1;
  store.settings.symphony = { code: c, connectedAt: Date.now() };
  store.saveSettings();
  feed = { ...next, at: Date.now() };
  lastError = null;
  return { ok: true, ...symphonyStatus() };
}

// One song as the page gets it: the feed's fields, and which parts have a clip at this app's own address.
function pageSong(s) {
  const { clipLinks, ...rest } = s;
  return { ...rest, clips: clipLinks.map(Boolean) };
}

export function registerSymphony(app) {
  app.get("/api/connectors/symphony", (_req, res) => res.json(symphonyStatus()));
  app.post("/api/connectors/symphony", async (req, res) => {
    try { res.json(await connectSymphony(req.body?.code)); } catch (e) { res.status(e.status || 400).json({ ok: false, error: e.message }); }
  });
  app.get("/api/symphony", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const f = await ensureFresh();
    const empty = { hot: { date: null, rows: [] }, songs: [] };
    if (!f) return res.json({ ...symphonyStatus(), ...empty });
    res.json({ ...symphonyStatus(), stale: !fresh(f), hot: f.hot, songs: f.songs.map(pageSong) });
  });
  // Where the page plays a clip from (1.13.2): here, the stable address below, which doesn't expire, so there's no
  // expiresAt. A ported space answers with an address its own host can play, with expiresAt when that address expires.
  // Found only when the feed has that part's clip. Never the code or a signed link.
  app.get("/api/symphony/clip-url", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const id = String(req.query.id || "");
    const part = Number.parseInt(String(req.query.part ?? "0"), 10);
    const missing = () => res.status(404).json({ found: false, url: "", error: "clip not found" });
    if (!ID.test(id) || !Number.isInteger(part) || part < 0 || part >= MAX_PARTS) return missing();
    const f = await ensureFresh();
    if (!f?.byId.get(id)?.clipLinks[part]) return missing();
    res.json({ found: true, url: symphonyClipUrl(id, part) });
  });
  // A stable address for a clip: it redirects to the signed link, read again first when the links are about to expire.
  app.get("/api/symphony/clips/:id", async (req, res) => {
    const id = String(req.params.id || "");
    const part = Number.parseInt(String(req.query.part ?? "0"), 10);
    if (!ID.test(id) || !Number.isInteger(part) || part < 0 || part >= MAX_PARTS) return res.status(404).json({ error: "clip not found" });
    let f = await ensureFresh();
    if (f && linksExpiring(f)) f = await ensureFresh({ force: true });
    const link = f?.byId.get(id)?.clipLinks[part];
    if (!link) return res.status(404).json({ error: "clip not found" });
    res.set("Cache-Control", "no-store");
    res.redirect(302, link);
  });
}

/** On start, a connected copy reads the feed in the background, so picks and clips are ready. */
export function startSymphony() {
  if (symphonyConnected()) refresh().catch(() => {});
}
