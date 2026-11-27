// Sign-in by Instagram username (1.15.0, room #735, ruled in #742). No password: anyone who types a handle opens that
// account. That is fine for a closed test and is not real security; a password, a passkey or a code by DM can come later
// without changing the data.
//
// data/accounts.json holds the accounts (handle, when made, owner on one of them), the sessions (a hash of each token,
// never the token, the handle, when made, when last seen) and the sign-up switch. A session never expires: the server keeps
// it until logout, and the browser keeps it in a cookie that each visit renews, plus a copy in the page's storage that it
// sends as Authorization: Bearer where cookies don't get through. Her Muse signs in the same way.
//
// The owner is the account whose space is the data folder itself, where everything saved before 1.15.0 is: the handle in
// that data's Instagram connector, or else the first handle that signs in and says the old covers are hers. On a copy with
// nothing saved yet, the first sign-in is the owner.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, OWNER_SPACE, readJson, runIn, spaceDir, spaceFile, store, writeJson } from "./store.js";

const FILE = join(DATA_DIR, "accounts.json");
// Named for this copy's port, so two copies on one computer (a test copy next to hers) never share or overwrite it.
const COOKIE = `cr_session_${Number(process.env.PORT || 4173)}`;
const MAX_AGE = 400 * 24 * 60 * 60; // Chrome's cap on a cookie, so each visit renews it
const SEEN_SAVE_MS = 10 * 60 * 1000; // when a session was last seen is written at most this often
export const ONLY_OWNER = "Only this copy's owner can change that.";
const BAD_HANDLE = "That isn't an Instagram username. Use 1 to 30 letters, numbers, periods or underscores.";
const CLOSED = "This copy isn't taking new sign-ups. Ask its owner.";
const SIGN_IN_FIRST = "Sign in first, with your Instagram username.";

class AccountError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

let state = load();
function load() {
  const s = readJson(FILE, { accounts: [], sessions: [], restrictSignups: false });
  return { accounts: Array.isArray(s.accounts) ? s.accounts : [], sessions: Array.isArray(s.sessions) ? s.sessions : [], restrictSignups: s.restrictSignups === true };
}
const save = () => writeJson(FILE, state);
// Sessions that can't come back are let go (1.40.0), so accounts.json doesn't grow for ever and each request has less to
// look through: one not seen for as long as its cookie lasts, and all but an account's 40 most recently seen.
const MAX_SESSIONS = 40;
function prune() {
  const cutoff = Date.now() - MAX_AGE * 1000;
  const seen = (x) => Date.parse(x.lastSeenAt || x.createdAt || "") || 0;
  const live = state.sessions.filter((x) => seen(x) >= cutoff);
  const per = new Map();
  for (const x of [...live].sort((p, q) => seen(q) - seen(p))) {
    const mine = per.get(x.handle) || [];
    if (mine.length < MAX_SESSIONS) mine.push(x);
    per.set(x.handle, mine);
  }
  const keep = new Set([...per.values()].flat());
  const next = state.sessions.filter((x) => keep.has(x));
  const changed = next.length !== state.sessions.length;
  state.sessions = next;
  return changed;
}
if (prune()) save();
const hash = (token) => createHash("sha256").update(String(token)).digest("hex");

/** A handle as Instagram has it: no @, lower case, 1 to 30 letters, numbers, periods or underscores, no period at either
 * end and never two in a row. Else null. */
export function cleanHandle(raw) {
  const h = String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(h) || h.startsWith(".") || h.endsWith(".") || h.includes("..")) return null;
  return h;
}
const accountOf = (handle) => state.accounts.find((a) => a.handle === handle) || null;
export const ownerHandle = () => state.accounts.find((a) => a.owner === true)?.handle || null;
/** The space an account's data lives in: the data folder for the owner, its own folder for everyone else. */
export const spaceOf = (handle) => (handle === ownerHandle() ? OWNER_SPACE : handle);
export const accountCount = () => state.accounts.length;
export const isOwner = (req) => Boolean(req.account) && req.account === ownerHandle();

// What the copy saved before accounts, which the owner gets: its covers and her quotes.
function oldCounts() {
  return runIn(OWNER_SPACE, () => {
    let quotes = 0;
    try { quotes = readJson(spaceFile("quotes.json"), []).length || 0; } catch { /* none */ }
    return { photos: store.db.items.length, quotes };
  });
}

/** Signs a handle in, making its account on the first sign-in. Answers { needsClaim, counts } instead when the copy has
 * covers or quotes from before accounts, no owner yet and no connector handle: the page asks whether they're hers and
 * signs in again with claim true or false. */
export function signIn(raw, claim) {
  const handle = cleanHandle(raw);
  if (!handle) throw new AccountError(BAD_HANDLE, 400);
  let acct = accountOf(handle);
  if (!acct) {
    if (state.restrictSignups) throw new AccountError(CLOSED, 403);
    let owner = false;
    if (!ownerHandle()) {
      const connector = cleanHandle(store.shared.connectors?.instagram?.handle);
      if (connector) owner = handle === connector;
      else {
        const counts = oldCounts();
        if (counts.photos || counts.quotes) {
          if (claim === undefined || claim === null) return { signedIn: false, needsClaim: true, handle, counts };
          owner = claim === true;
        } else owner = true;
      }
    }
    acct = { handle, createdAt: new Date().toISOString(), ...(owner ? { owner: true } : {}) };
    state.accounts.push(acct);
    if (!owner) mkdirSync(spaceDir(handle), { recursive: true });
  }
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  state.sessions.push({ tokenHash: hash(token), handle, createdAt: now, lastSeenAt: now });
  prune();
  save();
  return { ...view(handle), token };
}

const view = (handle) => ({ signedIn: true, handle, owner: handle === ownerHandle(), restrictSignups: state.restrictSignups });

// The tokens a request carries: the page's copy first, then the cookie.
function tokensOf(req) {
  const out = [];
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
  if (m) out.push(m[1]);
  for (const part of String(req.headers.cookie || "").split(/;\s*/)) {
    // Taken as it is: a token is base64url, so it never needs decoding, and a broken cookie can't stop the page.
    if (part.startsWith(`${COOKIE}=`)) { const t = part.slice(COOKIE.length + 1).trim(); if (t) out.push(t); }
  }
  return out;
}
const seenSaved = new Map();
function sessionOf(req) {
  for (const token of tokensOf(req)) {
    const h = hash(token);
    const s = state.sessions.find((x) => x.tokenHash === h);
    if (s && accountOf(s.handle)) {
      s.lastSeenAt = new Date().toISOString();
      if (Date.now() - (seenSaved.get(h) || 0) > SEEN_SAVE_MS) { seenSaved.set(h, Date.now()); save(); }
      return { session: s, token };
    }
  }
  return null;
}

function setCookie(req, res, token) {
  const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  res.append("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
}
const clearCookie = (res) => res.append("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);

/** Who is signed in, and the space the rest of the request runs in. */
export function sessionMiddleware(req, res, next) {
  const s = sessionOf(req);
  if (s) { req.account = s.session.handle; req.space = spaceOf(s.session.handle); req.sessionToken = s.token; }
  runIn(req.space ?? OWNER_SPACE, next);
}

// What answers without a session: the session itself, the update status and the page's activity, and a health check that
// says nothing personal. Everything else under /api and every photo needs one.
const OPEN = new Set(["GET /api/session", "POST /api/session", "DELETE /api/session", "GET /api/update", "POST /api/activity", "GET /api/health"]);
export function requireSession(req, res, next) {
  const p = req.path;
  const guarded = p.startsWith("/api/") || p === "/uploads" || p.startsWith("/uploads/");
  if (!guarded || req.account || OPEN.has(`${req.method} ${p}`)) return next();
  res.status(401).json({ error: SIGN_IN_FIRST, signedIn: false });
}
/** For the copy's shared things: Symphony, the songs folder, the sign-up switch. */
export function ownerOnly(req, res, next) {
  if (isOwner(req)) return next();
  res.status(403).json({ ok: false, error: ONLY_OWNER });
}
/** A middleware that finishes outside the request's space (multer does) hands the rest of the request back to it. */
export const inSpace = (mw) => (req, res, next) => mw(req, res, (err) => runIn(req.space ?? OWNER_SPACE, () => next(err)));

export function registerAccounts(app) {
  // Each visit renews the cookie, so a session that's used never runs out.
  app.get("/api/session", (req, res) => {
    if (!req.account) return res.json({ signedIn: false });
    setCookie(req, res, req.sessionToken);
    res.json(view(req.account));
  });
  app.post("/api/session", (req, res) => {
    try {
      const r = signIn(req.body?.handle, req.body?.claim);
      if (r.token) setCookie(req, res, r.token);
      res.json(r);
    } catch (e) { res.status(e.status || 400).json({ signedIn: false, error: e.message }); }
  });
  // Logout ends the session here and in the browser. Nothing of hers is deleted.
  app.delete("/api/session", (req, res) => {
    const gone = new Set(tokensOf(req).map(hash));
    if (gone.size) { state.sessions = state.sessions.filter((s) => !gone.has(s.tokenHash)); save(); }
    clearCookie(res);
    res.json({ signedIn: false });
  });
  // Off by default (Arjang #739): with it on, only handles this copy already knows can sign in.
  app.post("/api/accounts/signups", ownerOnly, (req, res) => {
    state.restrictSignups = req.body?.restrict === true;
    save();
    res.json(view(req.account));
  });
}
