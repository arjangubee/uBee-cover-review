import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// COVER_REVIEW_DATA_DIR lets tests (and a second workspace) keep data somewhere else.
export const DATA_DIR = process.env.COVER_REVIEW_DATA_DIR ? resolve(process.env.COVER_REVIEW_DATA_DIR) : join(root, "data");
export const UPLOAD_DIR = join(DATA_DIR, "uploads");
export const DUMP_DIR = join(DATA_DIR, "dump");
export const LIBRARY_DIR = join(DATA_DIR, "library");
for (const d of [DATA_DIR, UPLOAD_DIR, DUMP_DIR, LIBRARY_DIR]) mkdirSync(d, { recursive: true });

const DB_PATH = join(DATA_DIR, "db.json");
const SETTINGS_PATH = join(DATA_DIR, "settings.json");

function readJson(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return structuredClone(fallback); }
}
function writeJson(path, value) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(value, null, 1));
  renameSync(tmp, path);
}

const defaultDb = { items: [], voiceSamples: [], nextId: 1 };
const defaultSettings = {
  setupComplete: false,
  connectors: {
    google_drive: { status: "not_connected", rootFolderId: null, folders: {} },
    spotify: { status: "not_connected" },
    instagram: { status: "not_connected", handle: null, captionConsent: false, trendingConsent: true },
  },
  voiceProfile: null,
  quotesUnlocked: false, // quote overlay stays locked until quotes connect or the quiz is taken
  quotesSource: "locked", // locked | connected | quiz
  quizDecisions: {}, // quiz quote text -> "kept" | "skipped"
  workspace: { mode: "own_drive", clientName: null }, // ubee_shared for uBee clients
};

export const store = {
  db: readJson(DB_PATH, defaultDb),
  settings: readJson(SETTINGS_PATH, defaultSettings),
  saveDb() { writeJson(DB_PATH, this.db); },
  saveSettings() { writeJson(SETTINGS_PATH, this.settings); },
  addItem(partial) {
    const item = {
      id: this.db.nextId++,
      status: "queue", // queue | approved | rejected
      rating: null,
      note: "",
      quote: "",
      song: "",
      songSource: "", // spotify | trending | none
      caption: "",
      showQuote: false, // quote over image is a toggle, OFF by default
      // Full editor defaults (ported from the original covers schema)
      textColor: "#FFFFFF", textFont: "tiktok", textAlign: "center",
      fontSize: 58, fontWeight: 500, opacity: 100,
      horizontalPosition: 50, verticalPosition: 50, lineCount: 0,
      textWidth: 84, textHeight: 100, extraTexts: [], // v1.4: wrap box %, line spacing %, her own text boxes
      widthScale: 30, heightScale: 30, // v1.5: Text width and Text height stretch the text (30 = none)
      barColor: "#000000", textNegative: false,
      qualityRating: null, songRating: null, quoteRating: null, ratingUpdatedAt: null,
      slides: [], storyPanX: 50, storyPanY: 50,
      revision: 1, parentId: null, driveId: null,
      imageQualityStatus: "passed", repairStatus: "ready",
      originalImageUrl: null, beacons: null, composeAttestedAt: null, embeddedText: null, imageEdit: null,
      why: null, songPreviewUrl: "", // v1.4: "why it matches" from her Muse, a song preview when the pool has one
      songSpotifyUrl: "", // v1.6: the song's Spotify link; the play button opens Spotify's own player for it
      createdAt: Date.now(),
      decidedAt: null,
      ...partial,
    };
    this.db.items.push(item);
    this.saveDb();
    return item;
  },
  getItem(id) { return this.db.items.find((i) => i.id === Number(id)) || null; },
};
