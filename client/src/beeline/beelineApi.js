// Talking to the Beeline (1.16) straight from this page, with a device key Arjang makes on his Beeline page.
// The key lives only in this browser's storage. It never goes to this app's server, its data files or either repo.
// Photos and videos load through links Beeline signs for an hour or two, so no key ever sits in a link.

export const BEELINE_URL = import.meta.env?.VITE_BEELINE_URL || "https://evmqkvnclbqcijlyezrr.supabase.co/functions/v1/beeline";
// One saved device per account signed in on this browser (1.15.0 accounts): another account there never gets the key.
const store = (handle) => (handle ? `beeline.device:${handle}` : null);
const KEY_RE = /^bld_[a-f0-9]{64}$/;

export const cleanKey = (s) => String(s || "").replace(/\s+/g, "").trim();
export const looksLikeKey = (s) => KEY_RE.test(cleanKey(s));

export function savedDevice(handle) {
  if (!store(handle)) return null;
  try {
    const d = JSON.parse(localStorage.getItem(store(handle)) || "null");
    return d && KEY_RE.test(d.key || "") ? d : null;
  } catch {
    return null;
  }
}
export function saveDevice(d, handle) {
  if (!store(handle)) return;
  try { localStorage.setItem(store(handle), JSON.stringify(d)); } catch { /* storage off: it works until the page closes */ }
}
export function forgetDevice(handle) {
  if (!store(handle)) return;
  try { localStorage.removeItem(store(handle)); } catch { /* nothing saved */ }
}
// Whether the call cards are folded away on this browser (1.19). Nothing secret, so every account here shares it.
const FOLD = "beeline.callsFolded";
export function callsFolded() {
  try { return localStorage.getItem(FOLD) === "1"; } catch { return false; }
}
export function setCallsFolded(on) {
  try { localStorage.setItem(FOLD, on ? "1" : "0"); } catch { /* storage off: it holds until the page closes */ }
}

export class BeelineError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(key, path, options = {}) {
  let res;
  try {
    res = await fetch(BEELINE_URL + "/app/" + path, { ...options, headers: { ...(options.headers || {}), "x-beeline-key": key } });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new BeelineError("Can't reach the Beeline. Check the internet.", 0);
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) throw new BeelineError("bad_key", 401);
  if (!res.ok || !body || body.ok === false) throw new BeelineError((body && body.error) || "Beeline answered " + res.status + ".", res.status);
  return body;
}
const postJson = (key, path, data) => call(key, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data || {}) });

export const me = (key) => call(key, "me");

// The room since `after`, and reactions since `r`. With `v` and `wait`, Beeline holds the call until something on the
// screen changes (up to 25 s) and answers { same: true } if nothing did.
export function feed(key, { after = 0, r = 0, v = "", wait = 0 } = {}, signal) {
  const q = new URLSearchParams({ after: String(after), r: String(r) });
  if (v) q.set("v", v);
  if (wait) q.set("wait", String(wait));
  return call(key, "feed?" + q, { signal });
}

export const send = (key, text) => postJson(key, "send", { text });
export const react = (key, id, on) => postJson(key, "react", { id, on });
export const poke = (key, agent, force) => postJson(key, "poke", { key: agent, force: !!force });
export const closeAsk = (key, n) => postJson(key, "ask/close", { n });
// His answer to call n (1.19): approved, rejected, or edited with his own words. Beeline posts it in the room as him and
// pokes the agent that opened the call.
export const decide = (key, n, outcome, text) => postJson(key, "ask/decide", { n, outcome, text: text == null ? null : String(text) });

// Up to 10 photos in one message, each already a JPEG of 3 MB or less.
export function sendPhotos(key, photos, text) {
  const form = new FormData();
  for (const p of photos) form.append("file", p.blob, p.name);
  form.append("text", text || "");
  return call(key, "send", { method: "POST", body: form });
}

const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// One video or file per message, up to 50 MB. Beeline takes location data off videos.
export function upload(key, file, text, dims) {
  const q = new URLSearchParams();
  if (dims && dims.w && dims.h) { q.set("w", String(dims.w)); q.set("h", String(dims.h)); }
  if (dims && dims.ms) q.set("ms", String(dims.ms));
  return call(key, "upload" + (q.toString() ? "?" + q : ""), {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-beeline-mime": file.type || "application/octet-stream",
      "x-beeline-name": b64(String(file.name || "file").slice(0, 120)),
      "x-beeline-text": b64(text || ""),
    },
    body: file,
  });
}

export const poster = (key, id, jpeg) => call(key, "poster?id=" + Number(id), { method: "POST", headers: { "content-type": "image/jpeg" }, body: jpeg });

// A signed link to file `id` in `room`, or its small preview.
export function fileUrl(room, ft, id, thumb) {
  if (!room || !ft) return "";
  const q = new URLSearchParams({ r: room, t: ft });
  if (thumb) q.set("thumb", "1");
  return BEELINE_URL + "/app/file/" + Number(id) + "?" + q;
}
