// The app's guard rails (1.40.0, from the Nov 27 audit). Nothing here changes what a creator sees when things go right.
// - catchAsync: a route that fails after an await answers with an error. Before, Express 4 never saw that failure,
//   Node stopped the whole app on it, and scripts/run.mjs only restarts on an update's exit code.
// - errorHandler: every failure answers JSON in plain words, never a stack trace with this computer's folder paths.
// - baseHeaders and photoHeaders: a file she uploaded is only ever treated as a photo, a video or a download.
// - uploadFilter: uploads are photos and videos.
// - fetchPhoto: a photo kept at another address is fetched only from the public internet, never from this computer
//   or its private network.
// - signInLimit: a cap on sign-ins per address, so nobody can fill accounts.json from outside.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extname } from "node:path";

const METHODS = ["get", "post", "put", "patch", "delete"];

/** Wraps every route added after this call, so a rejected promise or a throw goes to the error handler. */
export function catchAsync(app) {
  const wrap = (h) => (typeof h !== "function" || h.length >= 4 ? h : function guarded(req, res, next) {
    try {
      const out = h(req, res, next);
      if (out && typeof out.catch === "function") out.catch(next);
    } catch (e) { next(e); }
  });
  for (const m of METHODS) {
    const add = app[m].bind(app);
    app[m] = (path, ...handlers) => (handlers.length ? add(path, ...handlers.map(wrap)) : add(path)); // app.get("setting") stays a getter
  }
  return app;
}

const PLAIN = {
  "entity.parse.failed": [400, "That request didn't read as JSON."],
  "entity.too.large": [413, "That request is too big."],
  "request.aborted": [400, "The request was cut off. Try again."],
  LIMIT_FILE_SIZE: [413, "That file is too big."],
  LIMIT_FILE_COUNT: [413, "That's too many files at once."],
  LIMIT_UNEXPECTED_FILE: [400, "That file came in under a name this app doesn't take."],
};

/** The last stop for a failed request: JSON, in plain words. What went wrong goes to the server log only. */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const known = PLAIN[err?.type] || PLAIN[err?.code];
  if (known) return res.status(known[0]).json({ ok: false, error: known[1] });
  if (err instanceof UploadRefused) return res.status(400).json({ ok: false, error: err.message });
  if (err instanceof URIError) return res.status(400).json({ ok: false, error: "That address has a broken % code in it." });
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500) return res.status(status).json({ ok: false, error: "That request didn't go through. Check it and try again." });
  console.error(`Cover Review: ${req.method} ${req.path} failed:`, err);
  res.status(500).json({ ok: false, error: "Something went wrong on the app's side. Try again, and tell your Muse if it keeps happening." });
}

/** An /api address that isn't there answers JSON like the rest, not an HTML page. */
export const apiNotFound = (_req, res) => res.status(404).json({ ok: false, error: "There's nothing at that address." });

/** A failure outside any request (a timer, a background sync) is logged and the app keeps running. */
export function keepRunning() {
  process.on("unhandledRejection", (e) => console.error("Cover Review: a background task failed:", e));
}

export function baseHeaders(_req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  next();
}

// What the browser may show from her uploads and her library: photos, videos and audio. Anything else downloads.
const INLINE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".heif", ".bmp", ".mp4", ".mov", ".m4v", ".webm",
  ".m4a", ".mp3", ".aac", ".wav", ".ogg", ".opus"]);
/** Headers for a folder of files people upload: never a page, never a script, even opened straight from its address. */
export function photoHeaders(req, res, next) {
  res.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  let ext = "";
  try { ext = extname(decodeURIComponent(req.path)).toLowerCase(); } catch { /* a broken address finds no file anyway */ }
  if (!INLINE.has(ext)) res.set("Content-Disposition", "attachment");
  next();
}

export class UploadRefused extends Error {}
const UPLOADS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".heif", ".bmp", ".mp4", ".mov", ".m4v", ".webm"]);
/** multer's fileFilter: a photo or a video, by what the browser says it is or by its name. */
export function uploadFilter(_req, file, cb) {
  const type = String(file.mimetype || "").toLowerCase();
  const ext = extname(String(file.originalname || "")).toLowerCase();
  const media = type.startsWith("image/") || type.startsWith("video/");
  // A photo named like a page or a script is refused whatever it claims to be: its name is what the browser would go by.
  const risky = /^\.(x?html?|svg|xml|js|mjs|css|php|pdf|swf)$/.test(ext);
  if (risky || !(media || UPLOADS.has(ext))) return cb(new UploadRefused("That isn't a photo or a video. Pick a JPEG, PNG, HEIC, WebP, GIF, MP4 or MOV."));
  cb(null, true);
}
/** A file name safe to keep on disk: the original's letters, at most 120 of them, with its ending kept. */
export function safeName(original) {
  const clean = String(original || "file").replace(/[^\w.\-]+/g, "_");
  const ext = extname(clean).slice(0, 12);
  return clean.length > 120 ? `${clean.slice(0, 120 - ext.length)}${ext}` : clean;
}

// ---------- Photos kept at another address ----------
function v4Private(a) {
  const p = a.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [x, y] = p;
  return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31)
    || (x === 192 && y === 168) || (x === 192 && y === 0) || (x === 198 && (y === 18 || y === 19)) || x >= 224;
}
/** True for an address on this computer or a private network: loopback, link-local, private ranges, and the like. */
export function privateAddress(addr) {
  const a = String(addr || "").toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (isIP(a) === 4) return v4Private(a);
  if (isIP(a) !== 6) return true;
  if (a === "::" || a === "::1") return true;
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  if (a.startsWith("::ffff:")) return true; // an IPv4 address written in hex: refuse instead of decoding
  return /^(fc|fd|fe[89ab]|ff)/.test(a) || a.startsWith("64:ff9b:");
}
// A Muse that serves photos from this computer on purpose names that address here, like "http://127.0.0.1:8080"
// (several with commas). Only those exact origins are let through.
const trusted = (u) => String(process.env.COVER_REVIEW_PHOTO_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean).includes(u.origin);

async function publicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (trusted(u)) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return privateAddress(host) ? null : u;
  let found;
  try { found = await lookup(host, { all: true }); } catch { return null; }
  return found.length && found.every((f) => !privateAddress(f.address)) ? u : null;
}

/**
 * Fetches a photo from the public internet. Answers the Response, or null when the address isn't a public http(s)
 * address or redirects somewhere that isn't. Each redirect is checked the same way, at most 3 of them.
 */
export async function fetchPhoto(raw, { timeoutMs = 30000 } = {}) {
  let url = await publicUrl(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; url && hop <= 3; hop += 1) {
    const r = await fetch(url, { signal, redirect: "manual" });
    if (r.status < 300 || r.status >= 400) return r;
    const to = r.headers.get("location");
    try { await r.body?.cancel(); } catch { /* nothing to let go of */ }
    url = to ? await publicUrl(new URL(to, url)) : null;
  }
  return null;
}

// ---------- Sign-ins per address ----------
/** At most `max` calls per `windowMs` from one address. In-memory: a restart starts the count over. */
export function signInLimit({ max = Number(process.env.COVER_REVIEW_SIGNIN_LIMIT || 60), windowMs = 60 * 1000 } = {}) {
  const hits = new Map();
  return function limit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ signedIn: false, error: "Too many sign-ins from here in a minute. Wait a minute and try again." });
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}
