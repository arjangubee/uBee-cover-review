import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONNECTORS, createDriveFolders, drivePlan, sortLocalDump, spotifyAuthUrl } from "./connectors.js";
import { buildVoiceProfile, generateCaption, loadQuotes, loadTrending, saveTrending, suggestQuote, suggestSong } from "./services.js";
import { getImportStatus, registerFull } from "./full.js";
import { pollenStatus, registerPollen, startPollenSync } from "./pollen.js";
import { DATA_DIR, LIBRARY_DIR, UPLOAD_DIR, store } from "./store.js";
import { createUpdater } from "./update.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOOT = randomUUID(); // changes on every start, so the page can tell the new version is up
const updater = createUpdater({ root: ROOT, dataDir: DATA_DIR });
const app = express();
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]+/g, "_")}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ---------- Health + grievances: the creator's AI debugs from these ----------
// GET /api/health is the first thing their AI checks when something feels off.
// POST /api/grievances is the in-app "tell your AI what is wrong" box: the
// grievance lands in data/grievances.json with app context attached, and the
// creator's AI works it under the debugging protocol in AGENTS.md.
const GRIEVANCE_PATH = join(DATA_DIR, "grievances.json");
function readGrievances() { try { return JSON.parse(readFileSync(GRIEVANCE_PATH, "utf8")); } catch { return []; } }
function saveGrievances(list) { writeFileSync(GRIEVANCE_PATH, JSON.stringify(list, null, 1)); }
app.get("/api/health", (_req, res) => {
  const v = updater.versionInfo();
  res.json({
    ok: true, app: "ubee-cover-review", version: v.version, commit: v.commit, boot: BOOT,
    items: { total: store.db.items.length, queue: store.db.items.filter((i) => i.status === "queue").length },
    connectors: store.settings.connectors, workspace: store.settings.workspace,
    pollen: (({ connected, revoked }) => ({ connected, revoked }))(pollenStatus()),
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
    },
    voiceProfile: store.settings.voiceProfile,
    setupComplete: store.settings.setupComplete,
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
  store.settings.spotifyLibrary = tracks.filter((t) => t && t.title).map((t) => ({ title: String(t.title), artist: String(t.artist || "") }));
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
  res.json({ items: store.db.items.filter((i) => i.status === status) });
});
app.post("/api/items/upload", upload.array("photos", 200), (req, res) => {
  const quotes = loadQuotes();
  const created = (req.files || []).map((f) => {
    const item = store.addItem({ title: f.originalname, imageUrl: `/uploads/${f.filename}`, source: "upload" });
    item.quote = suggestQuote(item, quotes);
    Object.assign(item, suggestSong(item));
    item.caption = generateCaption(item, store.settings.voiceProfile);
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
  if (rating != null) item.rating = Math.max(1, Math.min(10, Number(rating)));
  if (note != null) item.note = String(note);
  store.saveDb();
  res.json({ item });
});
app.post("/api/items/:id/edit", (req, res) => {
  const item = store.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  for (const key of ["quote", "song", "caption", "note"]) if (req.body[key] != null) item[key] = String(req.body[key]);
  if (req.body.regenerateCaption) item.caption = generateCaption(item, store.settings.voiceProfile);
  if (req.body.shuffleSong) Object.assign(item, suggestSong({ ...item, id: item.id + Math.floor(Math.random() * 7) + 1 }));
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
registerFull(app, upload);

// ---------- Pollen: approved covers go out through uBee's publisher (uBee clients only) ----------
registerPollen(app);
startPollenSync();

// ---------- Updates: check on start and every 2 minutes, UPDATE NOW applies ----------
app.get("/api/update", (_req, res) => res.json(updater.status()));
app.post("/api/update/check", async (_req, res) => res.json(await updater.check()));
app.post("/api/update/apply", (_req, res) => {
  const s = updater.status();
  if (s.state === "updating" || s.state === "restarting") return res.json({ ok: true, state: s.state });
  updater.apply().catch((e) => console.error("update failed:", e));
  res.json({ ok: true, state: "updating" });
});
if (process.env.COVER_REVIEW_NO_UPDATE_LOOP !== "1") updater.start();

// ---------- Static: uploads, library, brand, built client ----------
app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/api/library", express.static(LIBRARY_DIR));
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
