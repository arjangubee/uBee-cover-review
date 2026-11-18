// Cover Review x Pollen. The app never talks to Pollen directly. It hands each approved cover to the
// Bee Hive (ubeeofm.com); Pollen picks it up from there whenever the Mac is awake, books it on an empty
// image day about a week out, and reports the date back. The creator's Pollen code lives only in
// data/settings.json on her computer and never comes back out of any endpoint.
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captionProblems } from "./captionRules.js";
import { DATA_DIR, LIBRARY_DIR, UPLOAD_DIR, store } from "./store.js";

export const BEE_HIVE_URL = process.env.COVER_REVIEW_BEE_HIVE_URL || "https://ubeeofm.com/api/public/cover-review";
export const RENDER_DIR = join(DATA_DIR, "renders");
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

// Photo channels only: YouTube can't take a photo post, so it never shows.
const channelList = (list) => (list || []).filter((c) => c.photo)
  .map(({ id, platform, handle, ready, default_on }) => ({ id, platform, handle, ready, default_on }));

function revoke() {
  store.settings.pollen = { revoked: true, creator: pollen()?.creator || null, revokedAt: Date.now() };
  store.saveSettings();
}

/** What the app shows: connected, who, and her channels. Never the code. */
export function pollenStatus() {
  const p = pollen();
  if (!p?.code) return { connected: false, revoked: Boolean(p?.revoked), ...(p?.revoked ? { message: REVOKED } : {}) };
  return { connected: true, revoked: false, creator: p.creator, channels: channelList(p.channels), checkedAt: p.checkedAt };
}

export async function connect(code) {
  const c = String(code || "").trim();
  if (c.length < 32 || c.length > 256) throw new HiveError(REFUSED, 400);
  let hello;
  try { hello = await hive("hello", {}, c); } catch (e) { throw e.status === 401 ? new HiveError(REFUSED, 401) : e; }
  store.settings.pollen = { code: c, creator: hello.creator, channels: hello.channels, connectedAt: Date.now(), checkedAt: Date.now() };
  store.saveSettings();
  return { ok: true, creator: hello.creator, channels: channelList(hello.channels) };
}

export async function channels({ refresh = false } = {}) {
  const p = pollen();
  if (!p?.code) return pollenStatus();
  if (refresh || !p.checkedAt || Date.now() - p.checkedAt > HELLO_FRESH_MS) {
    try {
      const hello = await hive("hello");
      Object.assign(p, { creator: hello.creator, channels: hello.channels, checkedAt: Date.now() });
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
  mkdirSync(RENDER_DIR, { recursive: true });
  const file = `${item.id}.jpg`;
  writeFileSync(join(RENDER_DIR, `${file}.tmp`), buf);
  renameSync(join(RENDER_DIR, `${file}.tmp`), join(RENDER_DIR, file));
  item.pollenRender = { file, width: size.width, height: size.height, bytes: buf.length, at: Date.now() };
  store.saveDb();
  return item.pollenRender;
}

async function scheduleOne(id, picked) {
  const item = store.getItem(id);
  if (!item) return { itemId: id, status: "refused", error: "That cover is gone." };
  if (item.status !== "approved") return { itemId: id, status: "refused", error: "Only approved covers can be scheduled." };
  if (item.pollen && LOCKED.includes(item.pollen.status)) {
    return { itemId: id, status: item.pollen.status, bookedDay: item.pollen.bookedDay || null };
  }
  const problems = captionProblems(item.caption);
  if (problems.length) return { itemId: id, status: "refused", error: problems.join(" ") };
  const render = item.pollenRender;
  if (!render || !existsSync(join(RENDER_DIR, render.file))) return { itemId: id, status: "refused", error: "Render the cover first." };
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
    const sub = await hive("submit", { client_key: clientKey, caption: item.caption || "", image_path: up.path,
      width: render.width, height: render.height, channel_ids: picked, has_slides: (item.slides || []).some((s) => !s.deletedAt) });
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

export async function schedule(itemIds, channelIds) {
  const p = pollen();
  if (!p?.code) throw new HiveError(p?.revoked ? REVOKED : "Connect Pollen first.", p?.revoked ? 401 : 400);
  const allowed = new Set(channelList(p.channels).map((c) => c.id));
  const picked = [...new Set((channelIds || []).map(String))].filter((id) => allowed.has(id));
  if (!picked.length) throw new HiveError("Pick at least one channel.", 400);
  const results = [];
  for (const id of [...new Set((itemIds || []).map(Number))]) results.push(await scheduleOne(id, picked));
  return { ok: true, results };
}

let syncing = false;
let lastSync = 0;
/** Ask the Bee Hive how each sent cover is doing and keep the newest answer on the item. */
export async function sync() {
  if (!pollen()?.code || syncing) return { ok: false, changed: 0 };
  syncing = true;
  lastSync = Date.now();
  try {
    const items = store.db.items.filter((i) => i.pollen?.requestId && ACTIVE.includes(i.pollen.status));
    let changed = 0;
    for (let k = 0; k < items.length; k += 100) {
      const batch = items.slice(k, k + 100);
      let data;
      try { data = await hive("status", { ids: batch.map((i) => i.pollen.requestId) }); } catch (e) {
        if (e.status === 401) revoke();
        return { ok: false, changed, error: e.message };
      }
      for (const r of data.requests || []) {
        const item = batch.find((i) => i.pollen.requestId === r.id);
        if (!item) continue;
        const next = { status: r.status, bookedDay: r.booked_day || null, posts: Array.isArray(r.posts) ? r.posts : [], error: r.error || null };
        const now = { status: item.pollen.status, bookedDay: item.pollen.bookedDay, posts: item.pollen.posts, error: item.pollen.error };
        if (JSON.stringify(next) !== JSON.stringify(now)) { Object.assign(item.pollen, next, { updatedAt: Date.now() }); changed++; }
      }
    }
    if (changed) store.saveDb();
    return { ok: true, changed };
  } finally { syncing = false; }
}

/** Every 30 seconds while a cover waits for Pollen; every 10 minutes while covers sit booked. */
export function startPollenSync() {
  const t = setInterval(() => {
    const live = store.db.items.filter((i) => i.pollen?.requestId);
    const pending = live.some((i) => PENDING.includes(i.pollen.status));
    const booked = live.some((i) => i.pollen.status === "booked");
    if (pending || (booked && Date.now() - lastSync > BOOKED_SYNC_MS)) sync().catch(() => {});
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
  if (url.startsWith("/uploads/")) return local("/uploads/", UPLOAD_DIR);
  if (url.startsWith("/api/library/")) return local("/api/library/", LIBRARY_DIR);
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
  app.post("/api/items/:id/render", renderUpload.single("image"), (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "item not found" });
    if (!req.file) return res.status(400).json({ ok: false, error: "send the cover as the image field" });
    try { res.json({ ok: true, render: saveRender(item, req.file.buffer) }); } catch (e) { fail(res, e); }
  });
  app.post("/api/pollen/check", (req, res) => {
    const ids = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(Number) : [];
    res.json({ items: ids.map((id) => {
      const item = store.getItem(id);
      return { itemId: id, problems: item ? captionProblems(item.caption) : ["That cover is gone."],
        hasSlides: Boolean(item && (item.slides || []).some((s) => !s.deletedAt)), pollen: item?.pollen || null };
    }) });
  });
  app.post("/api/pollen/schedule", async (req, res) => {
    try { res.json(await schedule(req.body?.itemIds, req.body?.channelIds)); } catch (e) { fail(res, e); }
  });
  app.post("/api/pollen/sync", async (_req, res) => res.json(await sync()));
  app.get("/api/items/:id/image", async (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: "item not found" });
    await sendImage(item, res);
  });
}
