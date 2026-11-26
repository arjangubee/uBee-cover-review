// Cover Review x Pollen. The app never talks to Pollen directly. It hands each approved cover to the
// Bee Hive (ubeeofm.com); Pollen picks it up from there whenever the Mac is awake, books it on an empty
// image day about a week out, and reports the date back. The creator's Pollen code lives only in
// data/settings.json on her computer and never comes back out of any endpoint.
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captionProblems } from "./captionRules.js";
import { postedCaption } from "./captionCtas.js";
import { MISSING_CLIP, clipPath, clipType, songMeta } from "./songs.js";
import { inSpace } from "./accounts.js";
import { currentSpace, knownSpaces, libraryDir, rendersDir, runIn, store, uploadsDir } from "./store.js";
import { MISSING_ONLINE_CLIP, isSymphonyFile, symphonyClipBytes, symphonyClipReady } from "./symphony.js";

export const BEE_HIVE_URL = process.env.COVER_REVIEW_BEE_HIVE_URL || "https://ubeeofm.com/api/public/cover-review";
const SYNC_MS = Number(process.env.COVER_REVIEW_POLLEN_SYNC_MS || 30000);
const BOOKED_SYNC_MS = 10 * 60 * 1000; // a booked cover only changes if Pollen moves or posts it
const HELLO_FRESH_MS = 60 * 1000;
const PENDING = ["waiting", "leased"];
const ACTIVE = ["waiting", "leased", "booked"];
export const LOCKED = ["waiting", "leased", "booked", "posted"]; // these can't be scheduled again
const REVOKED = "That Pollen code doesn't work anymore. Ask uBee for a new one.";
const REFUSED = "That Pollen code didn't work. Check it with uBee.";
const OFFLINE = "Can't reach uBee right now. Check the internet and try again.";

class HiveError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const pollen = () => store.settings.pollen || null;
// 1.11: the Bee Hive says in hello whether it takes a song with a cover. Until it does, covers go out as before.
const takesSongs = () => Boolean(pollen()?.features?.songs);
// 1.21.0 (Big Edit item 28): and whether Pollen posts a cover right away. Until it does, every cover is scheduled.
const postsNow = () => Boolean(pollen()?.features?.post_now);
const NOT_NOW = "Pollen can't post right away yet. Leave Schedule on and Pollen books the first free day.";
// 1.38.0 (Arjang Nov 26, Schedule Post): and whether Pollen posts at the day and time she picks, takes a reel made from
// the cover and its song, and takes a carousel's photos. Until it does, Schedule Post says so and sends nothing.
const takesTime = () => Boolean(pollen()?.features?.schedule_at);
const takesReels = () => Boolean(pollen()?.features?.reels);
const takesSlides = () => Boolean(pollen()?.features?.slides);
const NO_TIME = "Pollen can't post at a time you pick yet. It needs an update from uBee first.";
const NO_REELS = "Pollen can't make reels from a cover yet. It needs an update from uBee first.";
const MIN_LEAD_MS = 5 * 60 * 1000;
const MAX_AHEAD_MS = 120 * 24 * 60 * 60 * 1000;
const FORMATS = { post: "pollen", reel: "pollenReel" }; // each format's Pollen request lives on its own field of the cover

/** How a cover's downloaded song fares with Pollen: does it have a clip, will the clip go, and any problem. */
export function songCheck(item) {
  const hasSongClip = Boolean(item?.songFile);
  // 1.12: a Symphony clip goes when Symphony's feed has it right now; Pollen gets its bytes from Symphony.
  if (hasSongClip && isSymphonyFile(item.songFile)) {
    const ready = symphonyClipReady(item.songFile);
    return { hasSongClip, songGoes: ready && takesSongs(), clip: null, symphony: ready, problem: takesSongs() && !ready ? MISSING_ONLINE_CLIP : null };
  }
  const clip = hasSongClip ? clipPath(item.songFile) : null;
  const goes = Boolean(clip) && takesSongs();
  return { hasSongClip, songGoes: goes, clip, problem: hasSongClip && takesSongs() && !clip ? MISSING_CLIP : null };
}

async function hive(action, body = {}, code = pollen()?.code) {
  let r;
  try {
    r = await fetch(BEE_HIVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${code}` },
      body: JSON.stringify({ action, ...body }),
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new HiveError(OFFLINE, 0); }
  let data = {};
  try { data = await r.json(); } catch { /* not JSON */ }
  if (r.status === 401) throw new HiveError(data.error || REVOKED, 401);
  if (!r.ok || data.ok === false) throw new HiveError(data.error || `uBee answered ${r.status}. Try again.`, r.status);
  return data;
}

// Channels that take a photo post, a reel, or both (1.38.0). YouTube takes reels only. Before 1.38.0 the Bee Hive
// said nothing of reels, so every channel it listed was a photo channel, and that still holds.
const channelList = (list) => (list || []).filter((c) => c.photo || c.video)
  .map(({ id, platform, handle, ready, default_on, photo, video, trial }) => ({ id, platform, handle, ready, default_on,
    photo: Boolean(photo), video: Boolean(video), trial: Boolean(trial) }));
const photoChannels = (list) => channelList(list).filter((c) => c.photo);

function revoke() {
  store.settings.pollen = { revoked: true, creator: pollen()?.creator || null, revokedAt: Date.now() };
  store.saveSettings();
}

/** What the app shows: connected, who, and her channels. Never the code. */
export function pollenStatus() {
  const p = pollen();
  if (!p?.code) return { connected: false, revoked: Boolean(p?.revoked), ...(p?.revoked ? { message: REVOKED } : {}) };
  return { connected: true, revoked: false, creator: p.creator, channels: channelList(p.channels), checkedAt: p.checkedAt, postNow: postsNow(),
    features: { scheduleAt: takesTime(), reels: takesReels(), slides: takesSlides(), songs: takesSongs() }, prefs: pollenPrefs() };
}

// What she last picked in Schedule Post (1.38.0): channels she switched on (an off-by-default one, like Substack) or off,
// Trial, Post and Reel, and each format's time of day. Saved the moment she changes one, so the sheet opens the way she
// left it.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function pollenPrefs() {
  const p = store.settings.pollenPrefs || {};
  const bool = (v) => (typeof v === "boolean" ? v : null);
  const ids = (v) => (Array.isArray(v) ? v.map(String).slice(0, 100) : []);
  return { on: ids(p.on), off: ids(p.off), trial: bool(p.trial), post: bool(p.post), reel: bool(p.reel),
    postTime: HHMM.test(p.postTime) ? p.postTime : null, reelTime: HHMM.test(p.reelTime) ? p.reelTime : null };
}
function savePollenPrefs(body = {}) {
  const now = pollenPrefs();
  for (const k of ["on", "off"]) if (Array.isArray(body[k])) now[k] = [...new Set(body[k].map(String))].slice(0, 100);
  for (const k of ["trial", "post", "reel"]) if (typeof body[k] === "boolean") now[k] = body[k];
  for (const k of ["postTime", "reelTime"]) if (HHMM.test(String(body[k] ?? ""))) now[k] = body[k];
  store.settings.pollenPrefs = now;
  store.saveSettings();
  return now;
}

export async function connect(code) {
  const c = String(code || "").trim();
  if (c.length < 32 || c.length > 256) throw new HiveError(REFUSED, 400);
  let hello;
  try { hello = await hive("hello", {}, c); } catch (e) { throw e.status === 401 ? new HiveError(REFUSED, 401) : e; }
  store.settings.pollen = { code: c, creator: hello.creator, channels: hello.channels, features: hello.features || {}, connectedAt: Date.now(), checkedAt: Date.now() };
  store.saveSettings();
  return { ok: true, creator: hello.creator, channels: channelList(hello.channels) };
}

export async function channels({ refresh = false } = {}) {
  const p = pollen();
  if (!p?.code) return pollenStatus();
  if (refresh || !p.checkedAt || Date.now() - p.checkedAt > HELLO_FRESH_MS) {
    try {
      const hello = await hive("hello");
      Object.assign(p, { creator: hello.creator, channels: hello.channels, features: hello.features || {}, checkedAt: Date.now() });
      store.saveSettings();
    } catch (e) {
      if (e.status === 401) { revoke(); return pollenStatus(); }
      return { ...pollenStatus(), stale: true, message: e.message };
    }
  }
  return pollenStatus();
}

/** (width, height) from a JPEG's frame header, or null if it isn't a JPEG. */
export function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function saveRender(item, buf) {
  const size = jpegSize(buf);
  if (!size || !size.width || !size.height) throw new HiveError("The cover has to be a JPEG.", 400);
  const RENDER_DIR = rendersDir(); // the signed-in account's own renders (1.15.0)
  const file = `${item.id}.jpg`;
  writeFileSync(join(RENDER_DIR, `${file}.tmp`), buf);
  renameSync(join(RENDER_DIR, `${file}.tmp`), join(RENDER_DIR, file));
  item.pollenRender = { file, width: size.width, height: size.height, bytes: buf.length, at: Date.now() };
  store.saveDb();
  return item.pollenRender;
}

async function scheduleOne(id, picked, now = false) {
  const item = store.getItem(id);
  if (!item) return { itemId: id, status: "refused", error: "That cover is gone." };
  if (item.status !== "approved") return { itemId: id, status: "refused", error: "Only approved covers can be scheduled." };
  if (item.pollen && LOCKED.includes(item.pollen.status)) {
    return { itemId: id, status: item.pollen.status, bookedDay: item.pollen.bookedDay || null };
  }
  const caption = postedCaption(item, store.settings.captionCtas); // off: the plain caption; on: her comment CTA once, then the caption (1.10.1)
  const problems = captionProblems(caption);
  if (problems.length) return { itemId: id, status: "refused", error: problems.join(" ") };
  const render = item.pollenRender;
  const RENDER_DIR = rendersDir();
  if (!render || !existsSync(join(RENDER_DIR, render.file))) return { itemId: id, status: "refused", error: "Render the cover first." };
  const song = songCheck(item);
  if (song.problem) return { itemId: id, status: "refused", error: song.problem };
  if (!pollen()?.code) return { itemId: id, status: "not_sent", error: REVOKED };

  // A cover that never made it keeps its key, so a retry can't land twice. One Pollen refused gets a new key.
  const clientKey = (item.pollen?.status === "not_sent" && item.pollen.clientKey) || `cr-${randomUUID()}`;
  item.pollen = { requestId: null, clientKey, status: "not_sent", channels: picked, bookedDay: null, posts: [], error: null,
    submittedAt: Date.now(), updatedAt: Date.now() };
  store.saveDb();
  try {
    const up = await hive("upload_url", { client_key: clientKey });
    let put;
    try {
      put = await fetch(up.signed_url, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
        body: readFileSync(join(RENDER_DIR, render.file)), signal: AbortSignal.timeout(120000) });
    } catch { throw new HiveError(OFFLINE, 0); }
    if (!put.ok) throw new HiveError(`The cover didn't upload (${put.status}). Try again.`, put.status);
    // 1.11: a cover with a downloaded song sends that exact hook clip too, with its name and hook times.
    let songBody = {};
    if (song.songGoes) {
      let clip;
      if (song.symphony) {
        try { clip = await symphonyClipBytes(item.songFile); } catch (e) { throw new HiveError(e.message, 0); } // never Pollen's 401
      } else clip = { body: readFileSync(song.clip), type: clipType(song.clip) };
      const type = clip.type;
      const upSong = await hive("upload_url", { client_key: clientKey, kind: "song", content_type: type });
      let putSong;
      try {
        putSong = await fetch(upSong.signed_url, { method: "PUT", headers: { "Content-Type": type, "x-upsert": "true" },
          body: clip.body, signal: AbortSignal.timeout(120000) });
      } catch { throw new HiveError(OFFLINE, 0); }
      if (!putSong.ok) throw new HiveError(`The song clip didn't upload (${putSong.status}). Try again.`, putSong.status);
      songBody = { song: { path: upSong.path, ...songMeta(item), content_type: type } };
    }
    const sub = await hive("submit", { client_key: clientKey, caption: caption || "", image_path: up.path,
      width: render.width, height: render.height, channel_ids: picked, has_slides: (item.slides || []).some((s) => !s.deletedAt), ...songBody,
      ...(now ? { post_now: true } : {}) }); // 1.21.0: Post now
    Object.assign(item.pollen, { requestId: sub.request.id, status: sub.request.status, updatedAt: Date.now() });
    store.saveDb();
    return { itemId: id, status: item.pollen.status };
  } catch (e) {
    if (e.status === 401) revoke();
    Object.assign(item.pollen, { status: "not_sent", error: e.message, updatedAt: Date.now() });
    store.saveDb();
    return { itemId: id, status: "not_sent", error: e.message };
  }
}

export async function schedule(itemIds, channelIds, { now = false } = {}) {
  const p = pollen();
  if (!p?.code) throw new HiveError(p?.revoked ? REVOKED : "Connect Pollen first.", p?.revoked ? 401 : 400);
  const allowed = new Set(photoChannels(p.channels).map((c) => c.id));
  const picked = [...new Set((channelIds || []).map(String))].filter((id) => allowed.has(id));
  if (!picked.length) throw new HiveError("Pick at least one channel.", 400);
  if (now && !postsNow()) throw new HiveError(NOT_NOW, 400);
  const results = [];
  for (const id of [...new Set((itemIds || []).map(Number))]) results.push(await scheduleOne(id, picked, now));
  return { ok: true, results };
}

// ---------- Schedule Post (1.38.0, Arjang Nov 26) ----------
// One cover, as a Post, a Reel or both, each at the day and time she picked, on the channels she left on. Pressing it is
// her final approval: a cover not approved yet is approved first. The post carries the cover and, once Pollen takes
// them, its carousel photos. The reel carries the cover, its photos and its song clip, which Pollen turns into a video.
// A photo post can't carry a song: no posting API takes one.

/** A carousel photo, drawn as it shows (its own text included), kept for Pollen like the cover's render. */
function saveSlideRender(item, at, buf) {
  const size = jpegSize(buf);
  if (!size || !size.width || !size.height) throw new HiveError("The photo has to be a JPEG.", 400);
  const slide = (item.slides || [])[at];
  if (!slide || slide.deletedAt) throw new HiveError("That photo isn't in this carousel.", 404);
  if (slide.mediaType === "video") throw new HiveError("A video in a carousel goes as it is, not drawn.", 400);
  const RENDER_DIR = rendersDir();
  const file = `${item.id}-slide-${at}.jpg`;
  writeFileSync(join(RENDER_DIR, `${file}.tmp`), buf);
  renameSync(join(RENDER_DIR, `${file}.tmp`), join(RENDER_DIR, file));
  item.pollenSlides = { ...(item.pollenSlides || {}), [at]: { file, width: size.width, height: size.height, bytes: buf.length, mediaUrl: slide.mediaUrl, at: Date.now() } };
  store.saveDb();
  return item.pollenSlides[at];
}

function timeProblem(at) {
  const t = Date.parse(String(at ?? ""));
  if (!Number.isFinite(t)) return "Pick a day and a time.";
  if (t < Date.now() + MIN_LEAD_MS) return "Pick a time at least 5 minutes from now.";
  if (t > Date.now() + MAX_AHEAD_MS) return "Pick a time within the next 120 days.";
  return null;
}

async function putFile(clientKey, extra, body, type) {
  const up = await hive("upload_url", { client_key: clientKey, ...extra, ...(extra.kind ? { content_type: type } : {}) });
  let put;
  try {
    put = await fetch(up.signed_url, { method: "PUT", headers: { "Content-Type": type, "x-upsert": "true" }, body, signal: AbortSignal.timeout(120000) });
  } catch { throw new HiveError(OFFLINE, 0); }
  if (!put.ok) throw new HiveError(`A file didn't upload (${put.status}). Try again.`, put.status);
  return up.path;
}

/** Sends one format of one cover to the Bee Hive. Everything was checked first. Answers { status, error? }. */
async function submitFormat(item, format, { at, trial, picked, slides, song }) {
  const field = FORMATS[format];
  const RENDER_DIR = rendersDir();
  const render = item.pollenRender;
  const caption = postedCaption(item, store.settings.captionCtas);
  // A request that never made it keeps its key, so a retry can't land twice. One Pollen refused gets a new key.
  const prev = item[field];
  const clientKey = (prev?.status === "not_sent" && prev.clientKey) || `cr-${randomUUID()}`;
  item[field] = { requestId: null, clientKey, status: "not_sent", format, scheduledAt: new Date(at).toISOString(),
    trial: format === "reel" ? Boolean(trial) : null, channels: picked, slides: slides.length, bookedDay: null, posts: [], error: null,
    submittedAt: Date.now(), updatedAt: Date.now() };
  store.saveDb();
  try {
    const imagePath = await putFile(clientKey, {}, readFileSync(join(RENDER_DIR, render.file)), "image/jpeg");
    const slidePaths = [];
    for (const [index, s] of slides.entries()) {
      slidePaths.push({ path: await putFile(clientKey, { kind: "slide", index }, readFileSync(join(RENDER_DIR, s.file)), "image/jpeg"), width: s.width, height: s.height });
    }
    let songBody = {};
    if (song) {
      let clip;
      if (song.symphony) {
        try { clip = await symphonyClipBytes(item.songFile); } catch (e) { throw new HiveError(e.message, 0); } // never Pollen's 401
      } else clip = { body: readFileSync(song.clip), type: clipType(song.clip) };
      songBody = { song: { path: await putFile(clientKey, { kind: "song" }, clip.body, clip.type), ...songMeta(item), content_type: clip.type } };
    }
    const sub = await hive("submit", { client_key: clientKey, format, scheduled_at: item[field].scheduledAt,
      ...(format === "reel" ? { trial: Boolean(trial) } : {}), caption: caption || "", image_path: imagePath, width: render.width, height: render.height,
      channel_ids: picked, has_slides: slides.length > 0, ...(slidePaths.length ? { slides: slidePaths } : {}), ...songBody });
    Object.assign(item[field], { requestId: sub.request.id, status: sub.request.status, updatedAt: Date.now() });
    store.saveDb();
    return { status: item[field].status };
  } catch (e) {
    if (e.status === 401) revoke();
    Object.assign(item[field], { status: "not_sent", error: e.message, updatedAt: Date.now() });
    store.saveDb();
    return { status: "not_sent", error: e.message };
  }
}

/**
 * Schedule Post: { channelIds, post: { at } | null, reel: { at, trial } | null }. Every check runs before anything is
 * sent or approved, and a problem names its format. Answers the cover and each format's { status, error? }.
 */
export async function schedulePost(itemId, body = {}) {
  const p = pollen();
  if (!p?.code) throw new HiveError(p?.revoked ? REVOKED : "Connect Pollen first.", p?.revoked ? 401 : 400);
  if (!takesTime()) throw new HiveError(NO_TIME, 409);
  const item = store.getItem(itemId);
  if (!item) throw new HiveError("That cover is gone.", 404);
  const want = { post: body.post ? { at: body.post.at } : null, reel: body.reel ? { at: body.reel.at, trial: body.reel.trial === true } : null };
  if (!want.post && !want.reel) throw new HiveError("Pick Post, Reel or both.", 400);
  if (want.reel && !takesReels()) throw new HiveError(NO_REELS, 409);
  const caption = postedCaption(item, store.settings.captionCtas);
  const captionBad = captionProblems(caption);
  if (captionBad.length) throw new HiveError(`Fix the caption first: ${captionBad.join(" ")}`, 400);
  const render = item.pollenRender;
  if (!render || !existsSync(join(rendersDir(), render.file))) throw new HiveError("The cover wasn't drawn yet. Try again.", 409);
  const all = channelList(p.channels);
  const chosen = new Set((Array.isArray(body.channelIds) ? body.channelIds : []).map(String));
  // The carousel's photos in their order, each drawn just now. A video in a carousel isn't sent yet.
  const active = (item.slides || []).map((s, at) => ({ ...s, at })).filter((s) => !s.deletedAt).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const photos = active.filter((s) => s.mediaType !== "video");
  const drawn = photos.map((s) => item.pollenSlides?.[s.at]);
  const slidesReady = drawn.every((d, i) => d && d.mediaUrl === photos[i].mediaUrl && existsSync(join(rendersDir(), d.file)));
  const plan = {};
  for (const format of ["post", "reel"]) {
    const w = want[format];
    if (!w) continue;
    const Name = format === "post" ? "The post" : "The reel";
    const field = FORMATS[format];
    if (item[field] && LOCKED.includes(item[field].status)) throw new HiveError(`${Name} is already with Pollen. Cancel it in Pollen to move it.`, 409);
    const t = timeProblem(w.at);
    if (t) throw new HiveError(`${Name}: ${t}`, 400);
    const picked = all.filter((c) => chosen.has(c.id) && c.ready && (format === "post" ? c.photo : c.video)).map((c) => c.id);
    if (!picked.length) throw new HiveError(`${Name}: turn on at least one channel that takes ${format === "post" ? "a photo post" : "a reel"}.`, 400);
    const sendSlides = (format === "reel" || takesSlides()) && photos.length > 0;
    if (sendSlides && !slidesReady) throw new HiveError("The carousel's photos weren't drawn yet. Try again.", 409);
    let song = null;
    if (format === "reel") {
      const sc = songCheck(item);
      if (!sc.hasSongClip) throw new HiveError("The reel needs the song's clip, and this cover's song has none. Pick a song with a clip, or schedule the post alone.", 400);
      if (sc.problem) throw new HiveError(`The reel: ${sc.problem}`, 400);
      song = sc;
    }
    plan[format] = { at: w.at, trial: w.trial, picked, slides: sendSlides ? drawn : [], song };
  }
  // Every check passed: this is her final approval.
  const approved = item.status !== "approved";
  if (approved) { item.status = "approved"; item.decidedAt = Date.now(); delete item.skippedAt; store.saveDb(); }
  const results = {};
  for (const format of Object.keys(plan)) results[format] = await submitFormat(item, format, plan[format]);
  return { ok: true, approved, item, results };
}

// Each account syncs with its own Pollen connection (1.15.0).
const syncing = new Set();
const lastSync = new Map();
/** Ask the Bee Hive how each sent cover is doing and keep the newest answer on the item. */
export async function sync() {
  const me = currentSpace();
  if (!pollen()?.code || syncing.has(me)) return { ok: false, changed: 0 };
  syncing.add(me);
  lastSync.set(me, Date.now());
  try {
    // Every live request, a cover's post and its reel each on its own (1.38.0).
    const live = [];
    for (const i of store.db.items) for (const f of Object.values(FORMATS)) if (i[f]?.requestId && ACTIVE.includes(i[f].status)) live.push(i[f]);
    let changed = 0;
    for (let k = 0; k < live.length; k += 100) {
      const batch = live.slice(k, k + 100);
      let data;
      try { data = await hive("status", { ids: batch.map((r) => r.requestId) }); } catch (e) {
        if (e.status === 401) revoke();
        return { ok: false, changed, error: e.message };
      }
      for (const r of data.requests || []) {
        const req = batch.find((x) => x.requestId === r.id);
        if (!req) continue;
        const next = { status: r.status, bookedDay: r.booked_day || null, posts: Array.isArray(r.posts) ? r.posts : [], error: r.error || null };
        const now = { status: req.status, bookedDay: req.bookedDay, posts: req.posts, error: req.error };
        if (JSON.stringify(next) !== JSON.stringify(now)) { Object.assign(req, next, { updatedAt: Date.now() }); changed++; }
      }
    }
    if (changed) store.saveDb();
    return { ok: true, changed };
  } finally { syncing.delete(me); }
}

/** Every 30 seconds while a cover waits for Pollen; every 10 minutes while covers sit booked. */
export function startPollenSync() {
  const t = setInterval(() => {
    for (const space of knownSpaces()) runIn(space, () => {
      if (!pollen()?.code) return;
      const live = store.db.items.flatMap((i) => Object.values(FORMATS).map((f) => i[f]).filter((r) => r?.requestId));
      const pending = live.some((r) => PENDING.includes(r.status));
      const booked = live.some((r) => r.status === "booked");
      if (pending || (booked && Date.now() - (lastSync.get(space) || 0) > BOOKED_SYNC_MS)) sync().catch(() => {});
    });
  }, SYNC_MS);
  t.unref?.();
}

// The cover's photo from this app's own address, so the browser can draw it onto a canvas
// (a photo straight from Drive or another site would block the canvas export).
async function sendImage(item, res) {
  const url = String(item.imageUrl || "");
  const local = (prefix, root) => res.sendFile(decodeURIComponent(url.slice(prefix.length)), { root, dotfiles: "deny" }, (e) => {
    if (e && !res.headersSent) res.status(404).json({ error: "photo not found" });
  });
  if (url.startsWith("/uploads/")) return local("/uploads/", uploadsDir());
  if (url.startsWith("/api/library/")) return local("/api/library/", libraryDir());
  const data = url.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (data) return res.type(data[1]).send(Buffer.from(data[2], "base64"));
  if (!/^https?:\/\//i.test(url)) return res.status(404).json({ error: "photo not found" });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const type = r.headers.get("content-type") || "";
    if (Number(r.headers.get("content-length") || 0) > 40 * 1024 * 1024) return res.status(502).json({ error: "that photo is too big" });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || !type.startsWith("image/") || buf.length > 40 * 1024 * 1024) return res.status(502).json({ error: "couldn't load the photo" });
    res.type(type).set("Cache-Control", "private, max-age=300").send(buf);
  } catch {
    if (!res.headersSent) res.status(502).json({ error: "couldn't load the photo" });
  }
}

export function registerPollen(app) {
  const renderUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
  const fail = (res, e) => res.status(e.status && e.status >= 400 ? e.status : 502).json({ ok: false, error: e.message });

  app.post("/api/connectors/pollen", async (req, res) => {
    try { res.json(await connect(req.body?.code)); } catch (e) { fail(res, e); }
  });
  app.delete("/api/connectors/pollen", (_req, res) => {
    store.settings.pollen = null;
    store.saveSettings();
    res.json({ ok: true });
  });
  app.get("/api/pollen/channels", async (req, res) => res.json(await channels({ refresh: req.query.refresh === "1" })));
  app.post("/api/items/:id/render", inSpace(renderUpload.single("image")), (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "item not found" });
    if (!req.file) return res.status(400).json({ ok: false, error: "send the cover as the image field" });
    try { res.json({ ok: true, render: saveRender(item, req.file.buffer) }); } catch (e) { fail(res, e); }
  });
  app.post("/api/pollen/check", (req, res) => {
    const ids = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(Number) : [];
    res.json({ items: ids.map((id) => {
      const item = store.getItem(id);
      const caption = item ? postedCaption(item, store.settings.captionCtas) : "";
      const song = songCheck(item);
      return { itemId: id, caption, problems: item ? [...captionProblems(caption), ...(song.problem ? [song.problem] : [])] : ["That cover is gone."],
        hasSlides: Boolean(item && (item.slides || []).some((s) => !s.deletedAt)), hasSongClip: song.hasSongClip, songGoes: song.songGoes,
        pollen: item?.pollen || null };
    }) });
  });
  app.post("/api/pollen/schedule", async (req, res) => {
    try { res.json(await schedule(req.body?.itemIds, req.body?.channelIds, { now: req.body?.now === true })); } catch (e) { fail(res, e); }
  });
  app.post("/api/pollen/sync", async (_req, res) => res.json(await sync()));
  // Schedule Post (1.38.0): her saved choices, each carousel photo drawn as it shows, and the send itself.
  app.get("/api/pollen/prefs", (_req, res) => res.json(pollenPrefs()));
  app.post("/api/pollen/prefs", (req, res) => res.json(savePollenPrefs(req.body || {})));
  app.post("/api/items/:id/render-slide/:at", inSpace(renderUpload.single("image")), (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "item not found" });
    if (!req.file) return res.status(400).json({ ok: false, error: "send the photo as the image field" });
    try { res.json({ ok: true, render: saveSlideRender(item, Number(req.params.at), req.file.buffer) }); } catch (e) { fail(res, e); }
  });
  app.post("/api/pollen/schedule-post", async (req, res) => {
    try { res.json(await schedulePost(Number(req.body?.itemId), req.body || {})); } catch (e) { fail(res, e); }
  });
  app.get("/api/items/:id/image", async (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: "item not found" });
    await sendImage(item, res);
  });
}
