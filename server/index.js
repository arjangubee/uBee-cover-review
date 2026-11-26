import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONNECTORS, createDriveFolders, drivePlan, sortLocalDump, spotifyAuthUrl } from "./connectors.js";
import { buildVoiceProfile, generateCaption, loadQuotes, loadTrending, saveTrending, suggestQuote, suggestSong } from "./services.js";
import { registerDm } from "./dm.js";
import { registerMusic } from "./music.js";
import { getImportStatus, registerFull } from "./full.js";
import { composePasses } from "../client/src/reviewMath.js";
import { ctaFor } from "./captionCtas.js";
import { pollenStatus, registerPollen, startPollenSync } from "./pollen.js";
import { registerRemix } from "./remix.js";
import { shuffleSong } from "./songPick.js";
import { registerBrand } from "./brand.js";
import { SONG_SOURCES, cleanHook, cleanSongFile, matchSongClip, registerSongs } from "./songs.js";
import { DATA_DIR, libraryDir, spaceFile, store, uploadsDir } from "./store.js";
import { accountCount, inSpace, isOwner, ownerOnly, registerAccounts, requireSession, sessionMiddleware } from "./accounts.js";
import { registerSymphony, startSymphony, symphonyStatus } from "./symphony.js";
import { createUpdater } from "./update.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOOT = randomUUID(); // changes on every start, so the page can tell the new version is up
const updater = createUpdater({ root: ROOT, dataDir: DATA_DIR });
const app = express();
app.use(express.json({ limit: "10mb" }));
// Accounts (1.15.0): who is signed in, and every request after this runs in that account's space. Personal calls and
// photos need a session; the session, the update status and a health check without personal data answer without one.
app.use(sessionMiddleware);
app.use(requireSession);
registerAccounts(app);

const multerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, uploadsDir(req.space)), // each account's photos in its own folder (1.15.0)
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]+/g, "_")}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});
// multer finishes the upload outside the request's space, so the route after it is handed back to the account's space.
const upload = { single: (f) => inSpace(multerUpload.single(f)), array: (f, n) => inSpace(multerUpload.array(f, n)) };

// ---------- Health + grievances: the creator's AI debugs from these ----------
// GET /api/health is the first thing their AI checks when something feels off.
// POST /api/grievances is the in-app "tell your AI what is wrong" box: the
// grievance lands in data/grievances.json with app context attached, and the
// creator's AI works it under the debugging protocol in AGENTS.md.
const grievancePath = () => spaceFile("grievances.json"); // each account's own (1.15.0)
function readGrievances() { try { return JSON.parse(readFileSync(grievancePath(), "utf8")); } catch { return []; } }
function saveGrievances(list) { writeFileSync(grievancePath(), JSON.stringify(list, null, 1)); }
// Signed out, health says only what the whole copy is (1.15.0): no covers, connectors or anything else of anyone's.
app.get("/api/health", (req, res) => {
  const v = updater.versionInfo();
  const copy = { ok: true, app: "ubee-cover-review", version: v.version, commit: v.commit, boot: BOOT, accounts: accountCount(), signedIn: Boolean(req.account) };
  if (!req.account) return res.json({ ...copy, signIn: "POST /api/session with { handle }, then send the token it answers as Authorization: Bearer <token>." });
  res.json({
    ...copy, account: req.account, owner: isOwner(req),
    items: { total: store.db.items.length, queue: store.db.items.filter((i) => i.status === "queue").length },
    connectors: store.settings.connectors, workspace: store.settings.workspace,
    pollen: (({ connected, revoked }) => ({ connected, revoked }))(pollenStatus()),
    symphony: (({ connected, revoked }) => ({ connected, revoked }))(symphonyStatus()),
    openGrievances: readGrievances().filter((g) => g.status === "open").length,
  });
});
app.get("/api/grievances", (_req, res) => res.json({ grievances: readGrievances() }));
app.post("/api/grievances", (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Say what is wrong, in your own words." });
  const list = readGrievances();
  // Receipt: the creator gets proof the report landed, not silence.
  // receivedAt is ISO so the client can show the time as received.
  const receivedAt = new Date().toISOString();
  const g = { id: list.length + 1, text, status: "open", createdAt: Date.now(), receivedAt, context: req.body.context || null, resolution: null };
  list.push(g);
  saveGrievances(list);
  res.json({ ok: true, grievance: g, receipt: { id: g.id, receivedAt } });
});
app.post("/api/grievances/:id/resolve", (req, res) => {
  const list = readGrievances();
  const g = list.find((x) => x.id === Number(req.params.id));
  if (!g) return res.status(404).json({ error: "grievance not found" });
  g.status = "resolved";
  g.resolution = String(req.body.resolution || "");
  g.resolvedAt = Date.now();
  saveGrievances(list);
  res.json({ ok: true, grievance: g });
});

// ---------- Setup status: photos are the ONLY hard requirement ----------
app.get("/api/setup/status", (_req, res) => {
  const photoCount = store.db.items.length;
  res.json({
    readyToReview: photoCount > 0,
    photoCount,
    requirements: {
      photos: { required: true, satisfied: photoCount > 0, how: "Upload photos, or drop them in DUMP and sort." },
      google_drive: { required: false, status: store.settings.connectors.google_drive.status },
      spotify: { required: false, status: store.settings.connectors.spotify.status },
      instagram: { required: false, status: store.settings.connectors.instagram.status },
      pollen: { required: false, status: pollenStatus().connected ? "connected" : "not_connected", note: "uBee clients only" },
      symphony: { required: false, status: symphonyStatus().connected ? "connected" : "not_connected", note: "uBee clients only" },
    },
    voiceProfile: store.settings.voiceProfile,
    setupComplete: store.settings.setupComplete,
    counts: Object.fromEntries(["queue", "approved", "rejected"].map((st) => [st, store.db.items.filter((i) => i.status === st).length])),
    import: getImportStatus(),
  });
});
app.post("/api/setup/complete", (_req, res) => { store.settings.setupComplete = true; store.saveSettings(); res.json({ ok: true }); });

// ---------- Connectors ----------
app.get("/api/connectors", (_req, res) => res.json({ connectors: CONNECTORS, state: store.settings.connectors }));
app.get("/api/connectors/spotify/auth-url", (_req, res) => {
  const url = spotifyAuthUrl();
  if (!url) return res.status(400).json({ error: "SPOTIFY_CLIENT_ID is not set in .env yet. The creator's Muse sets this during Spotify setup." });
  res.json({ url });
});
app.post("/api/connectors/spotify/sync-library", (req, res) => {
  const tracks = Array.isArray(req.body.tracks) ? req.body.tracks : [];
  store.settings.spotifyLibrary = tracks.filter((t) => t && t.title).map((t) => ({ title: String(t.title), artist: String(t.artist || ""), previewUrl: String(t.previewUrl || ""), spotifyUrl: String(t.spotifyUrl || "") }));
  store.settings.connectors.spotify.status = "connected";
  store.saveSettings();
  res.json({ ok: true, count: store.settings.spotifyLibrary.length });
});
app.post("/api/connectors/instagram/consent", (req, res) => {
  store.settings.connectors.instagram.captionConsent = Boolean(req.body.captionConsent);
  if (req.body.handle) { store.settings.connectors.instagram.handle = String(req.body.handle); store.settings.connectors.instagram.status = "connected"; }
  store.saveSettings();
  res.json({ ok: true, instagram: store.settings.connectors.instagram });
});

// ---------- Drive folders + DUMP ----------
app.get("/api/drive/plan", (_req, res) => res.json(drivePlan()));
app.post("/api/drive/folders", async (_req, res) => {
  try { res.json(await createDriveFolders()); } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});
app.post("/api/drive/folders/confirm", (req, res) => {
  store.settings.connectors.google_drive = { status: "connected", rootFolderId: req.body.rootFolderId || null, folders: req.body.folders || {} };
  store.saveSettings();
  res.json({ ok: true });
});
app.post("/api/dump/sort", (_req, res) => {
  const moved = sortLocalDump();
  res.json({ ok: true, moved, message: moved.length ? "DUMP sorted. Images entered the review queue." : "DUMP was empty. Nothing to sort." });
});

// ---------- Review queue ----------
app.get("/api/items", (req, res) => {
  const status = req.query.status || "queue";
  if (status !== "queue") return res.json({ items: store.db.items.filter((i) => i.status === status) });
  // The queue reads in review order (1.20.1): a Drive batch sits at the front, in the order it was sent. A cover leads
  // only once its compose check passes (1.25.0, Arjang #1104): the rest wait behind, in their own order. The deck checks
  // the cover she's on and the next one ahead of time (1.21.0), and a rule change rechecks saved checks (1.13.9).
  // A skipped cover (1.32.0) sits after all of them, literally last, skips in the order they were made.
  const queue = store.queueInOrder(), skipped = queue.filter((i) => i.skippedAt), rest = queue.filter((i) => !i.skippedAt);
  res.json({ items: [...rest.filter((i) => composePasses(i.beacons)), ...rest.filter((i) => !composePasses(i.beacons)), ...skipped] });
});
// Skip (1.32.0, room #1248, Quill #1249, the original's skipCover): a queued cover goes to the very end of the queue. Only
// its place moves: skippedAt marks it and its review time goes after every queued cover's. A decision clears the mark.
app.post("/api/items/:id/skip", (req, res) => {
  const item = store.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  if (item.status !== "queue") return res.status(409).json({ error: "Only a cover in the queue can be skipped." });
  const times = store.db.items.filter((i) => i.status === "queue" && typeof i.reviewOrderAt === "number").map((i) => i.reviewOrderAt);
  item.reviewOrderAt = Math.max(Date.now(), ...times) + 1;
  item.skippedAt = Date.now();
  store.saveDb();
  res.json({ item });
});
app.post("/api/items/upload", upload.array("photos", 200), (req, res) => {
  const quotes = loadQuotes();
  const created = (req.files || []).map((f) => {
    const item = store.addItem({ title: f.originalname, imageUrl: `/uploads/${f.filename}`, source: "upload" });
    item.quote = suggestQuote(item, quotes);
    Object.assign(item, suggestSong(item));
    item.caption = generateCaption(item, store.settings.voiceProfile);
    item.captionSource = "placeholder"; // the offline draft; a model may replace it (1.9)
    store.saveDb();
    return item;
  });
  res.json({ ok: true, created });
});
app.post("/api/items/:id/decide", (req, res) => {
  const item = store.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  const { decision, rating, note } = req.body || {};
  if (!["approved", "rejected", "queue"].includes(decision)) return res.status(400).json({ error: "decision must be approved, rejected or queue" });
  item.status = decision;
  item.decidedAt = decision === "queue" ? null : Date.now();
  delete item.skippedAt; // a decided cover, or one sent back to the queue, isn't skipped any more (1.32.0)
  if (rating != null) item.rating = Math.max(1, Math.min(10, Number(rating)));
  if (note != null) item.note = String(note);
  store.saveDb();
  res.json({ item });
});
app.post("/api/items/:id/edit", (req, res) => {
  const item = store.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  // Checked before anything changes, so a refused switch leaves the whole edit undone.
  const cta = req.body.cta == null || req.body.cta === "" ? null : ctaFor({ cta: req.body.cta }, store.settings.captionCtas || []);
  if (req.body.cta != null && req.body.cta !== "" && !cta) return res.status(400).json({ error: "That comment CTA isn't on your list. Ask your Muse to add it." });
  // A song clip sent back with a song (undo does this, 1.11) has to be a clip path in the songs folder, or a Symphony
  // clip ("symphony:<id>", 1.12, which Use on this cover sends too), with its hook.
  const clipSent = req.body.song != null && Object.prototype.hasOwnProperty.call(req.body, "songFile");
  const clip = clipSent && req.body.songFile != null ? cleanSongFile(req.body.songFile) : null;
  const hook = clip ? cleanHook(req.body.songHook) : null;
  if (clipSent && req.body.songFile != null && (!clip || !hook)) return res.status(400).json({ error: "That song clip isn't a clip in the songs folder or in Symphony." });
  for (const key of ["quote", "song", "caption", "note"]) if (req.body[key] != null) item[key] = String(req.body[key]);
  // A typed caption is hers and is never redrafted (1.9). Undo sends the source back with the words: one of the three
  // sources, or null for a row saved before sources existed.
  if (req.body.caption != null) {
    const src = req.body.captionSource;
    if (src === null) delete item.captionSource;
    else item.captionSource = ["placeholder", "model", "human"].includes(src) ? src : "human";
  }
  // A typed song has no preview and no Spotify link unless they come with it. Her Muse can attach a link on its own (v1.6).
  if (req.body.song != null) {
    item.songPreviewUrl = String(req.body.songPreviewUrl || ""); item.songSpotifyUrl = String(req.body.songSpotifyUrl || "");
    // 1.11: a song on the downloaded list gets its hook clip, any other song drops it. Undo sends the clip back as it was.
    if (clipSent) Object.assign(item, { songFile: clip, songHook: hook });
    else matchSongClip(item);
    if (SONG_SOURCES.includes(req.body.songSource)) item.songSource = req.body.songSource;
  } else if (req.body.songSpotifyUrl != null) item.songSpotifyUrl = String(req.body.songSpotifyUrl);
  if (req.body.regenerateCaption) { item.caption = generateCaption(item, store.settings.voiceProfile); item.captionSource = "placeholder"; }
  // The Comment CTA switch (1.10, renamed in 1.10.1): a keyword on the space's list turns it on, null turns it off.
  if (req.body.cta !== undefined) { if (cta) item.cta = cta.keyword; else delete item.cta; }
  // Shuffle (1.27.0, Quill #1119, Arjang #1092): a song matched to what the cover says, never one the cover has had.
  if (req.body.shuffleSong) {
    const s = shuffleSong(item);
    if (s.error) { store.saveDb(); return res.status(409).json({ error: s.error }); }
    Object.assign(item, s.fields);
  }
  if (req.body.shuffleQuote) item.quote = suggestQuote({ ...item, id: item.id + Math.floor(Math.random() * 13) + 1 }, loadQuotes());
  store.saveDb();
  res.json({ item });
});

// ---------- Quotes, songs, trending ----------
app.get("/api/quotes", (_req, res) => res.json({ quotes: loadQuotes(), defaultSource: "uBee default pack (Arjang Copy 2 stock), replace with data/quotes.json for a creator's own list" }));
app.get("/api/trending", (_req, res) => res.json(loadTrending()));
app.post("/api/trending/refresh", (req, res) => res.json({ ok: true, trending: saveTrending(req.body || {}) }));

// ---------- Voice profile ----------
app.post("/api/voice/samples", (req, res) => {
  if (!store.settings.connectors.instagram.captionConsent && req.body.source === "instagram") {
    return res.status(403).json({ error: "Caption consent is not recorded. Ask the creator first, then POST /api/connectors/instagram/consent." });
  }
  const samples = Array.isArray(req.body.samples) ? req.body.samples : [];
  store.db.voiceSamples.push(...samples.map(String));
  store.settings.voiceProfile = buildVoiceProfile(store.db.voiceSamples);
  store.saveDb(); store.saveSettings();
  res.json({ ok: true, voiceProfile: store.settings.voiceProfile });
});
app.get("/api/voice/profile", (_req, res) => res.json({ voiceProfile: store.settings.voiceProfile, sampleCount: store.db.voiceSamples.length }));

// ---------- Full feature set (editor, slides, story, ratings, verification) ----------
registerBrand(app); // her colors, the queue's text lock and her fonts (1.20.0)
registerFull(app, upload);
registerRemix(app); // the remix menu (1.17.0)

// ---------- Downloaded songs: Symphony's folder of hook clips (1.11) ----------
app.post("/api/songs/folder", ownerOnly); // the copy's shared music library: only its owner changes it (1.15.0)
registerMusic(app); // her own Save and Hide on top of it (1.15.0)
registerSongs(app);

// ---------- Symphony online: its songs and hook clips with a Symphony code (1.12) ----------
app.post("/api/connectors/symphony", ownerOnly);
registerSymphony(app);
startSymphony();

// ---------- Chats: the DM reply simulator. Her Muse drafts and sends (1.14) ----------
registerDm(app);

// ---------- Pollen: approved covers go out through uBee's publisher (uBee clients only) ----------
registerPollen(app);
startPollenSync();

// ---------- Updates: check on start and every 2 minutes; apply at a quiet moment (1.13.10) or on UPDATE NOW ----------
app.get("/api/update", (_req, res) => res.json({ ...updater.status(), boot: BOOT })); // boot: a page sees the app restart (1.13.10)
// The page's word on her (1.13.10): busy while an editor, a sheet or a text box is open, and how long since her last tap,
// key, scroll or wheel. The updater waits for a quiet minute before it updates on its own. Odd values only delay it.
app.post("/api/activity", (req, res) => {
  const b = req.body || {};
  updater.noteActivity({ busy: b.busy === true, idleMs: Number.isFinite(b.idleMs) ? b.idleMs : 0 });
  res.json({ ok: true });
});
app.post("/api/update/check", async (_req, res) => res.json(await updater.check()));
app.post("/api/update/apply", (_req, res) => {
  const s = updater.status();
  if (s.state === "updating" || s.state === "restarting") return res.json({ ok: true, state: s.state });
  updater.apply().catch((e) => console.error("update failed:", e));
  res.json({ ok: true, state: "updating" });
});
if (process.env.COVER_REVIEW_NO_UPDATE_LOOP !== "1") updater.start();

// ---------- Static: uploads, library, brand, built client ----------
// A photo's address opens only in its own account's space (1.15.0): the same file name in another account isn't there.
const statics = new Map();
const staticIn = (dir) => { if (!statics.has(dir)) statics.set(dir, express.static(dir)); return statics.get(dir); };
app.use("/uploads", (req, res, next) => staticIn(uploadsDir(req.space))(req, res, next));
app.use("/api/library", (req, res, next) => staticIn(libraryDir(req.space))(req, res, next));
app.use("/brand", express.static(join(ROOT, "public", "brand")));
const clientDist = join(ROOT, "client", "dist");
if (existsSync(clientDist)) app.use(express.static(clientDist));

// After an update the new copy starts while the old one is still letting go of the port.
const port = Number(process.env.PORT || 4173);
function listen(attempt = 0) {
  const server = app.listen(port, () => console.log(`uBee Cover Review running at http://localhost:${port}`));
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && attempt < 40) setTimeout(() => listen(attempt + 1), 500);
    else throw e;
  });
}
listen();
