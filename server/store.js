import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// COVER_REVIEW_DATA_DIR lets tests (and a second workspace) keep data somewhere else.
export const DATA_DIR = process.env.COVER_REVIEW_DATA_DIR ? resolve(process.env.COVER_REVIEW_DATA_DIR) : join(root, "data");

// Accounts (1.15.0, room #735 and #742). Each account's personal data lives in its own space: the copy's owner in the
// data folder itself, where everything saved before accounts already is, so no row is rewritten, and every other account
// in data/accounts/<handle>/, with the same files and folders. A request runs inside its account's space, so every read
// and write of personal data below goes to that account only. Work outside a request (start-up, timers) runs in the
// owner's space unless it asks for another one. What the whole copy shares (Symphony, the songs folder, the trending
// list, the quote pack and quiz pool, the updater, the 1.13.9 recheck tally) stays in the data folder for everyone.
export const OWNER_SPACE = "";
export const ACCOUNTS_DIR = join(DATA_DIR, "accounts");
const scope = new AsyncLocalStorage();

/** The folder a space keeps its personal data in. */
export function spaceDir(space = currentSpace()) {
  return space ? join(ACCOUNTS_DIR, space) : DATA_DIR;
}
/** The space this code runs in: the signed-in account's, or the owner's. */
export function currentSpace() {
  const s = scope.getStore();
  return typeof s === "string" ? s : OWNER_SPACE;
}
/** Runs fn in a space, and everything it starts (awaits, timers) stays in it. */
export function runIn(space, fn) {
  return scope.run(String(space || ""), fn);
}
/** Every space with data on this copy: the owner's, then each account folder. */
export function knownSpaces() {
  let names = [];
  try { names = readdirSync(ACCOUNTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { /* none yet */ }
  return [OWNER_SPACE, ...names];
}

// A space's own files and folders.
export const spaceFile = (name, space = currentSpace()) => join(spaceDir(space), name);
const made = new Set();
const folder = (name, space) => {
  const d = join(spaceDir(space), name);
  if (!made.has(d)) { mkdirSync(d, { recursive: true }); made.add(d); }
  return d;
};
export const uploadsDir = (space = currentSpace()) => folder("uploads", space);
export const dumpDir = (space = currentSpace()) => folder("dump", space);
export const libraryDir = (space = currentSpace()) => folder("library", space);
export const rendersDir = (space = currentSpace()) => folder("renders", space);
for (const d of [DATA_DIR, uploadsDir(OWNER_SPACE), dumpDir(OWNER_SPACE), libraryDir(OWNER_SPACE)]) mkdirSync(d, { recursive: true });

export function readJson(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return structuredClone(fallback); }
}
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
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

// Each space's db and settings, read once and kept in memory, written back on save.
const spaces = new Map();
function space(name = currentSpace()) {
  let s = spaces.get(name);
  if (!s) {
    const dir = spaceDir(name);
    s = { db: readJson(join(dir, "db.json"), defaultDb), settings: readJson(join(dir, "settings.json"), defaultSettings) };
    spaces.set(name, s);
  }
  return s;
}

export const store = {
  /** The signed-in account's covers, voice samples and Chats items. */
  get db() { return space().db; },
  set db(v) { space().db = v; },
  /** The signed-in account's own settings. */
  get settings() { return space().settings; },
  set settings(v) { space().settings = v; },
  /** What the whole copy shares, kept with the owner's settings where it always was: the same object in the owner's space. */
  get shared() { return space(OWNER_SPACE).settings; },
  saveDb() { writeJson(spaceFile("db.json"), space().db); },
  saveSettings() { writeJson(spaceFile("settings.json"), space().settings); },
  saveShared() { writeJson(spaceFile("settings.json", OWNER_SPACE), space(OWNER_SPACE).settings); },
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
      fontSize: 58, fontWeight: 400, opacity: 100, // v1.8: new covers start in TikTok Sans Regular
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
      description: "", // v1.9.2: what the photo shows, from her Muse; a voiced caption on a cover with no text is about it
      textPlacementVersion: 0, // v1.13.8: the default placement pass stamps 1 once it has placed this cover's text
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
