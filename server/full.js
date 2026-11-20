import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateCaption, loadQuotes } from "./services.js";
import { DATA_DIR, LIBRARY_DIR, store } from "./store.js";
import { nextOpacity } from "./styleRules.js";
import { canDraft, captionPrompt, captionState, draftProblems, needsDescription } from "./captionDrafts.js";
import { cleanCtas } from "./captionCtas.js";
import { downloadedSongs, matchSongClip } from "./songs.js";
import { overlayOf, quoteShown } from "../client/src/quoteOverlay.js";

// Full Cover Review feature set, ported from the Muse original.
// The original server/src/actions.ts (5,020 lines) maps onto these endpoints.
// Hatch-only parts are replaced as documented per section.

// The 11-color palette, Arjang's finalized names and hex values. No other colors.
export const PALETTE = [
  { name: "Cream", hex: "#FAFFB4" },
  { name: "Lemon Lime", hex: "#D7E310" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Spotify Green", hex: "#1ED760" },
  { name: "Yellow", hex: "#FBFA38" },
  { name: "Icy Aqua", hex: "#B8FFFF" },
  { name: "Pure Red", hex: "#FB0909" },
  { name: "Black", hex: "#000000" },
  { name: "Cherry Blossom", hex: "#FFB8CF" },
  { name: "Baby Blue Ice", hex: "#92AFFF" },
  { name: "Hot Fuchsia", hex: "#FE0956" },
];
export const FONTS = ["tiktok", "avenir", "serif", "condensed", "papyrus", "papyrus_condensed"];

export function styleDefaults() {
  return {
    textColor: "#FFFFFF", textFont: "tiktok", textAlign: "center",
    fontSize: 58, fontWeight: 400, opacity: 100, // v1.8: new text starts in TikTok Sans Regular
    horizontalPosition: 50, verticalPosition: 50, lineCount: 0,
    textWidth: 84, textHeight: 100, widthScale: 30, heightScale: 30, extraTexts: [],
    barColor: "#000000", textNegative: false,
  };
}

// ---------- v1.4 (Quill look): text box fields, her custom colors, image edits, why it matches ----------
const HEX = /^#[0-9A-Fa-f]{6}$/;
export const ALIGNS = ["left", "center", "right", "justify"];
export const CONTRASTS = ["normal", "high", "bw"];
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v)));
const isNum = (v) => v != null && v !== "" && Number.isFinite(Number(v));
// Ranges for the number fields a text box carries. Old fields keep their old (open) handling.
// v1.5: Lines has no real cap (99 is a sanity bound); widthScale and heightScale stretch the text, 30 is neutral.
const BOX_RANGES = { lineCount: [0, 99], textWidth: [20, 100], textHeight: [60, 200], widthScale: [10, 50], heightScale: [10, 50] };
const BOX_NUMBERS = ["fontSize", "fontWeight", "opacity", "horizontalPosition", "verticalPosition", "lineCount", "textWidth", "textHeight", "widthScale", "heightScale"];

// `stored` is the same text as saved now (the cover itself, or the text box in the same place), for the opacity rule.
function setNumbers(target, src, stored = target) {
  for (const k of BOX_NUMBERS) {
    if (!isNum(src[k])) continue;
    if (k === "opacity") { target.opacity = nextOpacity(src.opacity, stored?.opacity); continue; }
    target[k] = BOX_RANGES[k] ? clampNum(src[k], ...BOX_RANGES[k]) : Number(src[k]);
    if (k === "lineCount") target[k] = Math.round(target[k]);
  }
}

/** What a model is asked when it places a cover's quote (1.13.8, Quill #685): the original's rules, in plain words. */
export function placementPrompt(item) {
  const lines = Number(item.lineCount) > 0 ? `${Math.round(Number(item.lineCount))} lines` : "lines picked from its length";
  return [
    "Place the quote on this cover photo. First look at the photo: faces, heads and bodies, the main subject, busy detail,",
    "and real empty space such as sky, walls, or dark or even areas.",
    "- Put the text block in empty space first. Never cover a face or a head. Don't fight the main subject. Covering a torso or body is fine.",
    "- Align the text with the space it sits in: open space on the left means left align, on the right means right align,",
    "  and center only when the open space is centered. When there's room at a side, the side beats the center.",
    "- The whole block, not just its center, stays inside the safe area, in percent of the photo (left, top, width, height):",
    "  4:5 photos 5, 6, 90, 88. Square and 3:4 photos 6, 6, 88, 88. Landscape 5, 6, 90, 88, or 6, 8, 88, 84 when the photo is",
    "  1.7 or more times wider than tall. 9:16 photos 5, 15.625, 90, 62.5.",
    "- Even, easy lines: 1 to 8 lines, never more lines than words. Text size 8 to 110.",
    "- If the text already sits well (all inside the safe area, on no face or head, even lines, easy to read, not crammed",
    "  against an edge), answer needsChange false and change nothing.",
    'Answer with JSON only: {"needsChange": true or false, "horizontalPosition": 0 to 100, "verticalPosition": 0 to 100,',
    '"textAlign": "left", "center" or "right", "fontSize": 8 to 110, "lineCount": 1 to 8}. The positions are the center of',
    "the block, in percent of the photo's width and height.",
    `The quote: "${String(item.quote || "")}". Now its center sits ${Number(item.horizontalPosition ?? 50)}% across and`,
    `${Number(item.verticalPosition ?? 50)}% down, aligned ${item.textAlign || "center"}, size ${Number(item.fontSize ?? 58)}, ${lines}.`,
  ].join("\n");
}

/** A custom color she used goes to the front of her custom colors, newest first, at most 24. */
function rememberCustomColor(hex) {
  if (PALETTE.some((c) => c.hex.toUpperCase() === hex)) return;
  const list = (store.settings.customColors || []).filter((c) => c !== hex);
  store.settings.customColors = [hex, ...list].slice(0, 24);
  store.saveSettings();
}

/** Her extra text boxes, cleaned: at most 5, text up to 300 characters, only known style fields. */
export function cleanTextBoxes(list, stored = []) {
  return (Array.isArray(list) ? list : []).slice(0, 5).filter((b) => b && typeof b === "object").map((b, i) => {
    const box = { ...styleDefaults(), quote: String(b.quote ?? "").slice(0, 300) };
    delete box.extraTexts; delete box.barColor; delete box.textNegative;
    if (typeof b.textColor === "string" && HEX.test(b.textColor)) box.textColor = b.textColor.toUpperCase();
    if (FONTS.includes(b.textFont)) box.textFont = b.textFont;
    if (ALIGNS.includes(b.textAlign)) box.textAlign = b.textAlign;
    setNumbers(box, b, (Array.isArray(stored) ? stored : [])[i]);
    return box;
  });
}

/** "Why it matches", as her Muse records it. Null when there is no text. */
export function cleanWhy(w) {
  const text = String(w?.text ?? "").trim().slice(0, 1200);
  if (!text) return null;
  const tags = (Array.isArray(w.tags) ? w.tags : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 8);
  return { text, tags, audience: String(w.audience ?? "").trim().slice(0, 200), source: String(w.source ?? "").trim().slice(0, 200), recordedAt: Date.now() };
}

function cleanMosaics(list) {
  return (Array.isArray(list) ? list : []).filter((r) => r && ["x", "y", "w", "h"].every((k) => isNum(r[k])))
    .map((r) => ({ x: clampNum(r.x, 0, 100), y: clampNum(r.y, 0, 100), w: clampNum(r.w, 0, 100), h: clampNum(r.h, 0, 100) }))
    .filter((r) => r.w > 0 && r.h > 0).slice(0, 12);
}

// ---------- Drive import progress + in-flight guard ----------
// In-memory only: this is progress state, never creator data, and it must
// not persist a creator's photos or Drive ids to disk.
// A fresh batch sets importStartedAt and state "loading", then "ready" once
// its items are created. The guard only blocks an exact repeat of the same
// batch: same Drive ids, within 30 seconds, returns { inFlight: true,
// started: false } and creates nothing, so repeat taps can never pile
// duplicate jobs on top of each other. A different batch, like the next chunk
// of a large import, always goes through, even inside the window.
// Dedupe by driveId also applies after the window: a driveId already in
// the queue is never enqueued a second time.
export const IMPORT_WINDOW_MS = 30_000;
const importState = { state: "idle", startedAt: null, lastBatchAt: 0, lastBatchSize: 0, totalEnqueued: 0, lastBatchDriveIds: [] };
function sameBatchDriveIds(entries) {
  const ids = entries.map((e) => e.driveId).filter(Boolean).sort();
  if (!ids.length || ids.length !== importState.lastBatchDriveIds.length) return false;
  return ids.every((id, i) => id === importState.lastBatchDriveIds[i]);
}
export function getImportStatus() {
  return {
    importState: importState.state,
    importStartedAt: importState.startedAt,
    lastBatchSize: importState.lastBatchSize,
    totalEnqueued: importState.totalEnqueued,
    // Queue length is the pending-style count: photos enqueued, not yet decided.
    importPending: store.db.items.filter((i) => i.status === "queue").length,
  };
}

function mustItem(req, res) {
  const item = store.getItem(req.params.id);
  if (!item) res.status(404).json({ error: "item not found" });
  return item;
}

function loadSongPool() {
  const p = join(DATA_DIR, "song-pool.json");
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}

// Compose verification gate, same three beacons as the original:
// QUOTE_IN_STOCK, SONG_IN_POOL, STEPS_VERIFIED.
// One deliberate change from the original (1.5.2, Quill's ruling): a cover with its quote off draws no quote, so
// QUOTE_IN_STOCK reads null (not applicable) and the steps rest on the image and the song. In the original the
// quote field only ever held stock quotes; here a quote-off cover can hold caption-like text that was never a quote.
// 1.13.9 (Quill #706, #707 and #719): each check is stamped with the rule it was made under. A saved check with no stamp
// was made before 1.13.9, when every post started with its quote off; the one-time recheck brings it up to date.
export const BEACONS_VERSION = 1;
// The quote lock (1.13.9, Quill #725): until she connects quotes or keeps one from the quiz, the page draws no quote on any
// cover, so the server reads none as shown either. Unlocked, global hide, then each post's own choice (quoteOverlay.js).
function quotesUnlocked() {
  return Boolean(store.settings.quotesUnlocked) || creatorQuotes().length > 0;
}
function quoteDrawn(item) {
  return quotesUnlocked() && quoteShown(item, store.settings.quoteOverlay);
}
export function verifyItem(item) {
  const quotes = loadQuotes().map((q) => q.text.toLowerCase());
  const quoteInStock = quoteDrawn(item) ? Boolean(item.quote) && quotes.includes(item.quote.trim().toLowerCase()) : null;
  const pool = loadSongPool().map((s) => `${s.artist} - ${s.title}`.toLowerCase());
  const spotify = (store.settings.spotifyLibrary || []).map((s) => `${s.artist} - ${s.title}`.toLowerCase());
  const downloaded = downloadedSongs().map((s) => `${s.artist} - ${s.title}`.toLowerCase()); // 1.11: the songs folder's list
  const songInPool = Boolean(item.song) && (pool.includes(item.song.trim().toLowerCase()) || spotify.includes(item.song.trim().toLowerCase())
    || downloaded.includes(item.song.trim().replace(/\s+/g, " ").toLowerCase()) || item.songSource === "trending");
  const beacons = { QUOTE_IN_STOCK: quoteInStock, SONG_IN_POOL: songInPool, STEPS_VERIFIED: quoteInStock !== false && songInPool && Boolean(item.imageUrl) };
  item.beacons = beacons;
  item.composeAttestedAt = beacons.STEPS_VERIFIED ? Date.now() : null;
  item.beaconsVersion = BEACONS_VERSION;
  return beacons;
}

// A saved check, checked again under the rule in force, the 1.13.3 switch's way (Quill #707): beacons only, never
// showQuote or any other choice of hers, and a cover that stays verified keeps when it was. Answers the beacons that changed.
function recheckSaved(item) {
  const was = item.beacons || {}, when = item.composeAttestedAt;
  const now = verifyItem(item);
  if (was.STEPS_VERIFIED && now.STEPS_VERIFIED && when) item.composeAttestedAt = when;
  return Object.keys(now).filter((k) => was[k] !== now[k]);
}
// Every checked cover, checked again after what shows changed on all of them. Answers the covers whose check changed.
function recheckChecked() {
  const items = [];
  for (const i of store.db.items) if (i.beacons && recheckSaved(i).length) items.push(i);
  if (items.length) store.saveDb();
  return items;
}

// ---------- Quotes: toggle, connect, and the quote quiz ----------
// Quote over image is locked at first: no cover draws a quote. It unlocks only
// when the creator connects their own quotes, or takes the quote quiz and steals
// generalized quotes from the uBee pack for themselves. Then each post shows its
// quote unless she turned it off there (1.13.9). The quiz pool is
// data/quiz-quotes.json: the default pack with every Arjang-specific quote
// filtered out (name, rugs, modeling, agency story, return arc). Generalized
// only, so what a creator steals reads as theirs, never as Arjang's story.
const CREATOR_QUOTES_PATH = join(DATA_DIR, "quotes.json");
function creatorQuotes() {
  if (!existsSync(CREATOR_QUOTES_PATH)) return [];
  try { const raw = JSON.parse(readFileSync(CREATOR_QUOTES_PATH, "utf8")); return raw.map((q) => (typeof q === "string" ? q : q.text)).filter(Boolean); } catch { return []; }
}
function saveCreatorQuotes(texts) {
  writeFileSync(CREATOR_QUOTES_PATH, JSON.stringify(texts.map((text) => ({ text, source: store.settings.quotesSource })), null, 1));
}
function quizPool() {
  try { return JSON.parse(readFileSync(join(DATA_DIR, "quiz-quotes.json"), "utf8")); } catch { return []; }
}
export function quotesStatus() {
  const kept = creatorQuotes();
  return {
    unlocked: quotesUnlocked(),
    source: store.settings.quotesSource,
    creatorQuoteCount: kept.length,
    quizPoolSize: quizPool().length,
    quizRemaining: quizPool().filter((q) => !store.settings.quizDecisions[q.text]).length,
    quoteOverlay: overlayOf(store.settings.quoteOverlay), // 1.13.3: the one switch for every cover, or null when it isn't set
  };
}

export function registerFull(app, upload) {
  app.get("/api/quotes/status", (_req, res) => res.json(quotesStatus()));

  // Connect your own quotes: unlocks the overlay toggle. By default they join her list; with replace: true
  // (v1.5.1) her list becomes exactly the quotes sent. Quiz verdicts stay. An empty list is refused either way.
  app.post("/api/quotes/connect", (req, res) => {
    const texts = (Array.isArray(req.body.quotes) ? req.body.quotes : []).map(String).map((s) => s.trim()).filter(Boolean);
    if (!texts.length) return res.status(400).json({ error: "quotes array is empty" });
    const replace = [true, "true"].includes(req.body.replace);
    const wasLocked = !quotesUnlocked();
    store.settings.quotesSource = "connected";
    saveCreatorQuotes([...new Set(replace ? texts : [...creatorQuotes(), ...texts])]);
    store.settings.quotesUnlocked = true;
    store.saveSettings();
    if (wasLocked) recheckChecked(); // quotes show now: every checked cover is checked again, beacons only (1.13.9)
    res.json({ ok: true, ...quotesStatus() });
  });

  // The quote quiz: rate generalized quotes, steal the ones that sound like you.
  app.get("/api/quiz/quotes", (_req, res) => {
    const decided = store.settings.quizDecisions || {};
    res.json({ quotes: quizPool().filter((q) => !decided[q.text]), total: quizPool().length });
  });
  app.post("/api/quiz/decide", (req, res) => {
    const text = String(req.body.text || "");
    const keep = Boolean(req.body.keep);
    if (!quizPool().some((q) => q.text === text)) return res.status(400).json({ error: "quote is not in the generalized quiz pool" });
    const wasLocked = !quotesUnlocked();
    store.settings.quizDecisions[text] = keep ? "kept" : "skipped";
    if (keep) {
      store.settings.quotesSource = store.settings.quotesSource === "connected" ? "connected" : "quiz";
      saveCreatorQuotes([...new Set([...creatorQuotes(), text])]);
      store.settings.quotesUnlocked = true;
    }
    store.saveSettings();
    if (wasLocked && keep) recheckChecked(); // her first kept quote unlocks them: every checked cover is checked again (1.13.9)
    res.json({ ok: true, ...quotesStatus() });
  });

  // The toggle itself. Turning it ON while locked is refused, with the reason.
  // 1.13 (Arjang via Rose #559 and #567, Quill #562 and #569): her last choice on the Quote on the cover switch carries
  // over to covers she hasn't set. from "switch" is her own switch (undo and redo too) and becomes the default. Any
  // explicit toggle marks the cover as set, so it keeps its choice. from "default" applies the default to a cover that
  // isn't set yet: it only ever turns a quote on, since a new cover starts with it off.
  // A post's own quote, from the T icon (1.13.9, Quill #695): showQuote with the mark that she chose it. Undo can take
  // the mark back off with set: false, so the post shows its quote by default again. 1.13.0's carry-over (from
  // "default" or "switch") is gone; an old page's carry-over call changes nothing.
  app.post("/api/items/:id/quote-toggle", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (req.body.from === "default") return res.json({ item, applied: false });
    const want = Boolean(req.body.showQuote);
    if (want && !quotesStatus().unlocked) {
      return res.status(403).json({ error: "Quote overlay is locked. Connect your quotes, or take the quote quiz and steal quotes that sound like you first." });
    }
    item.showQuote = want;
    item.showQuoteSet = req.body.set !== false;
    if (item.beacons) verifyItem(item); // a checked cover stays truthful: the quote check depends on what shows (1.5.2)
    store.saveDb();
    res.json({ item });
  });

  // 1.13.3's one setting for every cover, which 1.13.9 reads as global hide (Quill #696): false hides every quote, and
  // null (unset) hands each post its own choice again. True is still taken but no longer forces quotes on. It never
  // rewrites a cover's own choice. A cover that was checked is checked again so its quote check stays truthful, and only
  // a cover whose check comes out different is saved and sent back (a cover still verified keeps when it was).
  app.post("/api/settings/quote-overlay", (req, res) => {
    const on = req.body?.on;
    if (!(on === true || on === false || on === null)) return res.status(400).json({ error: "on must be true, false or null." });
    if (on === true && !quotesStatus().unlocked) {
      return res.status(403).json({ error: "Quote overlay is locked. Connect your quotes, or take the quote quiz and steal quotes that sound like you first." });
    }
    if (on === null) delete store.settings.quoteOverlay; else store.settings.quoteOverlay = on;
    store.saveSettings();
    const items = recheckChecked();
    res.json({ ...quotesStatus(), items });
  });

  // 1.13.9's one-time recheck (Quill #706, #707 and #719). Every cover with a saved check made before 1.13.9 (no stamp)
  // is checked once more, whatever its status. The page runs it: idle, one cover at a time, the one on screen last.
  // The tally counts the covers rechecked, the covers whose check changed and the beacon values that changed.
  const wantsRecheck = (i) => Boolean(i.beacons) && !(Number(i.beaconsVersion || 0) >= BEACONS_VERSION);
  const recheckTally = () => ({ rechecked: 0, coversChanged: 0, valuesChanged: 0, ...(store.settings.beaconRecheck || {}) });
  app.get("/api/beacons/wanted", (_req, res) => {
    res.json({ ids: store.db.items.filter(wantsRecheck).sort((a, b) => a.id - b.id).map((i) => i.id), recheck: recheckTally() });
  });
  app.post("/api/items/:id/recheck", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (!wantsRecheck(item)) return res.json({ rechecked: false, reason: "done", item });
    const changed = recheckSaved(item);
    const t = recheckTally();
    store.settings.beaconRecheck = { rechecked: t.rechecked + 1, coversChanged: t.coversChanged + (changed.length ? 1 : 0), valuesChanged: t.valuesChanged + changed.length };
    store.saveDb();
    store.saveSettings();
    res.json({ rechecked: true, changed, item });
  });

  // ---------- Workspace: own Drive by default, uBee shared Drive for clients ----------
  app.post("/api/workspace/configure", (req, res) => {
    const mode = req.body.mode === "ubee_shared" ? "ubee_shared" : "own_drive";
    store.settings.workspace = { mode, clientName: req.body.clientName ? String(req.body.clientName) : null };
    store.saveSettings();
    res.json({ ok: true, workspace: store.settings.workspace });
  });
  app.get("/api/workspace", (_req, res) => res.json({ workspace: store.settings.workspace }));

  app.get("/api/palette", (_req, res) => res.json({ palette: PALETTE, fonts: FONTS, customColors: store.settings.customColors || [] }));
  // Remove one of her custom colors (1.9.1, Arjang's yes to #282). Covers that use it keep it; only the shortcut goes.
  app.post("/api/palette/custom-colors/remove", (req, res) => {
    const hex = String(req.body?.hex ?? "").toUpperCase();
    if (!HEX.test(hex)) return res.status(400).json({ error: "Send the color as #RRGGBB." });
    const list = store.settings.customColors || [];
    if (list.includes(hex)) { store.settings.customColors = list.filter((c) => c !== hex); store.saveSettings(); }
    res.json({ palette: PALETTE, fonts: FONTS, customColors: store.settings.customColors || [] });
  });

  // Style editor: updatecoverstyle + updatebarcolor in the original.
  app.post("/api/items/:id/style", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const b = req.body || {};
    // The 11 palette colors come first; since v1.4 any #RRGGBB works and joins her custom colors.
    if (typeof b.textColor === "string" && HEX.test(b.textColor)) {
      item.textColor = b.textColor.toUpperCase();
      rememberCustomColor(item.textColor);
    }
    if (b.textFont && FONTS.includes(b.textFont)) item.textFont = b.textFont;
    if (ALIGNS.includes(b.textAlign)) item.textAlign = b.textAlign;
    setNumbers(item, b);
    if (b.extraTexts !== undefined) item.extraTexts = cleanTextBoxes(b.extraTexts, item.extraTexts);
    if (["#FFFFFF", "#000000"].includes(b.barColor)) item.barColor = b.barColor;
    if (b.textNegative != null) item.textNegative = Boolean(b.textNegative);
    store.saveDb();
    res.json({ item });
  });

  // Per-part ratings: ratecover in the original (quality / song / quote separately).
  app.post("/api/items/:id/rate", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    for (const k of ["qualityRating", "songRating", "quoteRating"]) {
      if (req.body[k] === null) item[k] = null; // v1.4: undo can take back a first rating
      else if (req.body[k] != null) item[k] = Math.max(1, Math.min(10, Number(req.body[k])));
    }
    item.ratingUpdatedAt = Date.now();
    store.saveDb();
    res.json({ item });
  });

  // Swap photo: keep quote, song and styling, change only the image.
  // Original: swapcoverphoto + usesearchedphoto.
  app.post("/api/items/:id/swap-photo", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (!req.body.imageUrl) return res.status(400).json({ error: "imageUrl is required" });
    item.originalImageUrl = item.originalImageUrl || item.imageUrl;
    item.imageUrl = String(req.body.imageUrl);
    if (req.body.title) item.title = String(req.body.title);
    store.saveDb();
    res.json({ item });
  });
  app.post("/api/items/:id/restore-original", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (item.originalImageUrl) item.imageUrl = item.originalImageUrl;
    store.saveDb();
    res.json({ item });
  });

  // Save image edit notes/adjustments: saveimageedit in the original.
  app.post("/api/items/:id/image-edit", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const body = { ...(req.body || {}) };
    const prev = item.imageEdit || {};
    // v1.4: Image contrast and Face mosaic live here too, kept clean; other notes merge as before.
    if ("contrast" in body) body.contrast = CONTRASTS.includes(body.contrast) ? body.contrast : (prev.contrast || "normal");
    if ("mosaics" in body) body.mosaics = cleanMosaics(body.mosaics);
    item.imageEdit = { ...prev, ...body, savedAt: Date.now() };
    store.saveDb();
    res.json({ item });
  });

  // A new revision is its own cover: a deep copy (so slides and image edits never change both), with no
  // Pollen booking and no compose check carried over from the cover it came from. v1.4.
  function revisionOf(src) {
    const { id, status, decidedAt, pollen, pollenRender, beacons, composeAttestedAt, beaconsVersion, ...rest } = structuredClone(src);
    return rest;
  }

  // Remix: duplicate as a new revision in the queue. Original: remixcover.
  app.post("/api/items/:id/remix", (req, res) => {
    const src = mustItem(req, res); if (!src) return;
    const copy = store.addItem({ ...revisionOf(src), status: "queue", parentId: src.id, revision: (src.revision || 1) + 1, title: `${src.title} (remix)` });
    res.json({ item: copy });
  });

  // Reject and revise: sends the cover back as a fresh queue revision with a note.
  app.post("/api/items/:id/reject-revise", (req, res) => {
    const src = mustItem(req, res); if (!src) return;
    src.status = "rejected"; src.decidedAt = Date.now(); store.saveDb();
    const copy = store.addItem({ ...revisionOf(src), status: "queue", parentId: src.id, revision: (src.revision || 1) + 1, note: String(req.body?.note || src.note || "") });
    res.json({ item: copy });
  });

  // Carousel slides: addcarouselslide, removecarouselslide (soft delete),
  // restorecarouselslide, setcarouselorder in the original.
  app.post("/api/items/:id/slides", upload.single("slide"), (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    item.slides = item.slides || [];
    const slide = req.file
      ? { mediaUrl: `/uploads/${req.file.filename}`, mediaType: req.file.mimetype.startsWith("video") ? "video" : "image", title: req.file.originalname }
      : { mediaUrl: String(req.body?.mediaUrl || ""), mediaType: "image", title: String(req.body?.title || "slide") };
    if (!slide.mediaUrl) return res.status(400).json({ error: "slide file or mediaUrl is required" });
    slide.position = item.slides.filter((s) => !s.deletedAt).length;
    slide.deletedAt = null;
    item.slides.push(slide);
    store.saveDb();
    res.json({ item });
  });
  app.post("/api/items/:id/slides/:index/remove", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const slide = (item.slides || [])[Number(req.params.index)];
    if (!slide) return res.status(404).json({ error: "slide not found" });
    slide.deletedAt = Date.now();
    store.saveDb();
    res.json({ item });
  });
  app.post("/api/items/:id/slides/:index/restore", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const slide = (item.slides || [])[Number(req.params.index)];
    if (!slide) return res.status(404).json({ error: "slide not found" });
    slide.deletedAt = null;
    store.saveDb();
    res.json({ item });
  });
  app.post("/api/items/:id/slides/order", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const order = Array.isArray(req.body.order) ? req.body.order.map(Number) : [];
    const active = (item.slides || []).filter((s) => !s.deletedAt);
    order.forEach((from, to) => { if (active[from]) active[from].position = to; });
    store.saveDb();
    res.json({ item });
  });

  // Story framing: savestoryframing in the original. 9:16 lives only in Story view.
  app.post("/api/items/:id/story-framing", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    item.storyPanX = Number(req.body.storyPanX ?? item.storyPanX ?? 50);
    item.storyPanY = Number(req.body.storyPanY ?? item.storyPanY ?? 50);
    store.saveDb();
    res.json({ item });
  });

  // Caption: generateinstagramcaption in the original. Here it is the offline draft, a placeholder (1.9).
  app.post("/api/items/:id/caption", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    item.caption = generateCaption(item, store.settings.voiceProfile);
    item.captionSource = "placeholder";
    store.saveDb();
    res.json({ item });
  });

  // ---------- v1.9: captions drafted by a model, in the space's own voice (Quill #269, #276, #284, #292) ----------
  // This server has no model. A space with one maps caption-fill to its model call, with captionPrompt, draftProblems
  // and the unchanged-since-drafting check below. A model outside the server can use caption-prompt and caption-draft.
  if (store.settings.captionFillFrom == null) { store.settings.captionFillFrom = Date.now(); store.saveSettings(); }
  const draftOpts = (item) => ({ offlineDraft: generateCaption(item, store.settings.voiceProfile), fillFrom: store.settings.captionFillFrom });
  const captionVoice = () => String(store.settings.captionVoice || "");
  const voiceState = () => ({ voice: captionVoice(), fillFrom: store.settings.captionFillFrom });

  // The covers whose captions a model may draft: queue first, then approved.
  app.get("/api/captions/wanted", (_req, res) => {
    const order = { queue: 0, approved: 1 };
    const ids = store.db.items.filter((i) => canDraft(i, draftOpts(i))).sort((a, b) => order[a.status] - order[b.status] || a.id - b.id).map((i) => i.id);
    res.json({ ids });
  });
  app.get("/api/items/:id/caption-prompt", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    res.json({ prompt: captionPrompt({ ...item, showQuote: quoteDrawn(item) }, captionVoice()), voice: Boolean(captionVoice().trim()), basedOn: String(item.caption ?? ""), canDraft: canDraft(item, draftOpts(item)),
      imageUrl: item.imageUrl, description: String(item.description ?? ""), needsDescription: needsDescription(item, captionVoice()) });
  });
  // What the photo shows, in plain words, recorded by her Muse (1.9.2). A voiced caption on a cover with no text is
  // about the photo, so it needs this first.
  app.post("/api/items/:id/description", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    item.description = String(req.body?.text ?? "").trim().slice(0, 1000);
    store.saveDb();
    res.json({ item });
  });
  // A model's draft lands only while the caption is still what it was when drafting began, so a typed caption wins.
  app.post("/api/items/:id/caption-draft", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const draft = String(req.body?.caption ?? "").trim();
    if (!canDraft(item, draftOpts(item))) return res.json({ saved: false, reason: "locked", item });
    if (String(item.caption ?? "") !== String(req.body?.basedOn ?? "")) return res.json({ saved: false, reason: "changed", item });
    if (needsDescription(item, captionVoice())) return res.json({ saved: false, reason: "no-description", item }); // say what the photo shows first (1.9.2)
    const problems = draftProblems(draft, { voice: captionVoice(), ctas: store.settings.captionCtas || [] });
    if (problems.length) return res.json({ saved: false, reason: "rules", problems, item });
    item.caption = draft;
    item.captionSource = "model";
    store.saveDb();
    res.json({ saved: true, item });
  });
  // The client's fill loop asks here for each cover it may draft. A blank caption gets the offline placeholder;
  // anything else needs a model, which this server doesn't have.
  app.post("/api/items/:id/caption-fill", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (!canDraft(item, draftOpts(item))) return res.json({ drafted: false, reason: "locked", item });
    if (captionState(item, draftOpts(item).offlineDraft) === "blank") {
      item.caption = generateCaption(item, store.settings.voiceProfile);
      item.captionSource = "placeholder";
      store.saveDb();
      return res.json({ drafted: true, reason: "offline", item });
    }
    res.json({ drafted: false, reason: "no-model", item });
  });
  // ---------- v1.13.8: default text placement (Arjang #559 item 6, Quill #685 and #687) ----------
  // The original's placement pass: once per queue cover, a model looks at the photo and moves the quote into empty
  // space, never onto a face or a head. This server has no model. A space with one maps placement-fill to its model
  // call with placementPrompt; a model outside the server can read placement-prompt. The client fits the answer with
  // the real text sizes (normalizePlacement) and saves it here, which stamps the cover. A missing stamp reads as 0.
  const PLACEMENT_VERSION = 1;
  const wantsPlacement = (i) => i.status === "queue" && !(Number(i.textPlacementVersion || 0) >= PLACEMENT_VERSION);
  app.get("/api/placements/wanted", (_req, res) => {
    res.json({ ids: store.db.items.filter(wantsPlacement).sort((a, b) => a.id - b.id).map((i) => i.id) });
  });
  app.get("/api/items/:id/placement-prompt", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    res.json({ prompt: placementPrompt(item), imageUrl: item.imageUrl, wanted: wantsPlacement(item) });
  });
  // A space with a model answers { reason: "answer", answer: { needsChange, horizontalPosition, verticalPosition,
  // textAlign, fontSize, lineCount }, item } from its model call. This one has no model.
  app.post("/api/items/:id/placement-fill", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (!wantsPlacement(item)) return res.json({ placed: false, reason: "done", item });
    res.json({ placed: false, reason: "no-model", item });
  });
  // The pass's answer, already fitted by the client. Only the center, the alignment, the size and the line count ever
  // change; color, font, quote and everything else stay hers. No fields means the text was ready: only the stamp moves.
  app.post("/api/items/:id/placement", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    if (!wantsPlacement(item)) return res.json({ saved: false, reason: "done", item });
    const f = req.body?.fields;
    let changed = false;
    if (f && typeof f === "object") {
      const next = {};
      if (isNum(f.horizontalPosition)) next.horizontalPosition = clampNum(f.horizontalPosition, 0, 100);
      if (isNum(f.verticalPosition)) next.verticalPosition = clampNum(f.verticalPosition, 0, 100);
      if (f.textAlign !== undefined) next.textAlign = ALIGNS.includes(f.textAlign) ? f.textAlign : "center";
      if (isNum(f.fontSize)) next.fontSize = clampNum(f.fontSize, 8, 110);
      if (isNum(f.lineCount)) next.lineCount = Math.round(clampNum(f.lineCount, 1, 8));
      for (const [k, v] of Object.entries(next)) if (item[k] !== v) { item[k] = v; changed = true; }
    }
    item.textPlacementVersion = PLACEMENT_VERSION;
    store.saveDb();
    res.json({ saved: true, changed, item });
  });

  // The space's caption voice: her Muse sets it, it stays in this copy's data. Empty means none. Backfill lets a
  // model redraft placeholders on covers made before drafting started; that is the owner's call.
  app.get("/api/settings/caption-voice", (_req, res) => res.json(voiceState()));
  app.post("/api/settings/caption-voice", (req, res) => {
    const b = req.body || {};
    if (b.voice != null) store.settings.captionVoice = String(b.voice).trim().slice(0, 20000);
    if (b.backfill === true) store.settings.captionFillFrom = 0;
    store.saveSettings();
    res.json(voiceState());
  });
  // The space's comment CTAs (1.10, Arjang #435): her Muse sets them, they stay in this copy's data. Upstream has
  // none. Each cover's switch under the caption picks one, off by default; an empty list clears them.
  app.get("/api/settings/caption-ctas", (_req, res) => res.json({ ctas: store.settings.captionCtas || [] }));
  app.post("/api/settings/caption-ctas", (req, res) => {
    const { ctas, error } = cleanCtas(req.body?.ctas);
    if (error) return res.status(400).json({ error });
    store.settings.captionCtas = ctas;
    store.saveSettings();
    res.json({ ctas });
  });

  // Why it matches: her Muse records why the photo, quote and song belong together. v1.4.
  app.post("/api/items/:id/why", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const why = cleanWhy(req.body);
    if (!why) return res.status(400).json({ error: "Say why it matches, in a sentence or two." });
    item.why = why;
    store.saveDb();
    res.json({ item });
  });

  // Verification: verifycover + attestcomposesteps in the original.
  app.post("/api/items/:id/verify", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    const beacons = verifyItem(item);
    store.saveDb();
    res.json({ item, beacons });
  });

  // Drive enqueue: enqueuefromdrive + enqueuebatch in the original.
  // Portable replacement: the creator's Muse mirrors Drive files in, or posts
  // drive ids with public image URLs. Textless covers never enter the queue:
  // a stock quote is assigned on the way in, per the original queue rule.
  app.post("/api/items/enqueue", (req, res) => {
    const entries = Array.isArray(req.body.items) ? req.body.items : [];
    // In-flight guard: only an exact repeat of the same batch, inside the
    // window, is blocked. A different batch (next chunk) goes through.
    if (importState.lastBatchAt && Date.now() - importState.lastBatchAt < IMPORT_WINDOW_MS && sameBatchDriveIds(entries)) {
      return res.json({ ok: true, inFlight: true, started: false, created: [], ...getImportStatus() });
    }
    const quotes = loadQuotes();
    const seenDriveIds = new Set(store.db.items.map((i) => i.driveId).filter(Boolean));
    const created = [];
    importState.state = "loading";
    importState.startedAt = new Date().toISOString();
    for (const e of entries) {
      if (!e.imageUrl) continue;
      // Dedupe by driveId when present: never a second item for one Drive file.
      if (e.driveId && seenDriveIds.has(e.driveId)) continue;
      if (e.driveId) seenDriveIds.add(e.driveId);
      if (e.imageQualityStatus === "quarantined") {
        created.push(store.addItem({ title: e.title || e.driveId || "drive photo", imageUrl: e.imageUrl, source: "drive", driveId: e.driveId || null, imageQualityStatus: "quarantined", status: "rejected" }));
        continue;
      }
      const item = store.addItem({ title: e.title || e.driveId || "drive photo", imageUrl: e.imageUrl, source: "drive", driveId: e.driveId || null, imageQualityStatus: "passed", ...styleDefaults() });
      item.quote = e.quote || quotes[item.id % Math.max(quotes.length, 1)]?.text || "";
      item.song = e.song || "";
      matchSongClip(item); // 1.11: a song on the downloaded list comes with its hook clip
      if (e.why) item.why = cleanWhy(e.why);
      item.caption = generateCaption(item, store.settings.voiceProfile);
      item.captionSource = "placeholder"; // the offline draft (1.9)
      created.push(item);
    }
    importState.lastBatchAt = Date.now();
    importState.lastBatchSize = created.length;
    importState.lastBatchDriveIds = entries.map((e) => e.driveId).filter(Boolean).sort();
    importState.totalEnqueued += created.length;
    importState.state = "ready";
    store.saveDb();
    res.json({ ok: true, inFlight: false, started: true, created, ...getImportStatus() });
  });

  // Import progress for the client / the creator's AI to poll.
  app.get("/api/import/status", (_req, res) => res.json(getImportStatus()));

  // Photo search across the sorted library and the queue: searchphotos in the original.
  app.get("/api/photos/search", (req, res) => {
    const q = String(req.query.q || "").toLowerCase();
    const results = [];
    try {
      const imagesDir = join(LIBRARY_DIR, "Images");
      if (existsSync(imagesDir)) for (const name of readdirSync(imagesDir)) {
        if (!q || name.toLowerCase().includes(q)) results.push({ title: name, imageUrl: `/api/library/Images/${encodeURIComponent(name)}`, source: "library" });
      }
    } catch { /* library empty */ }
    for (const item of store.db.items) {
      if (!q || item.title.toLowerCase().includes(q)) results.push({ title: item.title, imageUrl: item.imageUrl, source: "queue", itemId: item.id });
    }
    res.json({ results: results.slice(0, 100) });
  });

  // Quality feedback + cleanup: listqualityfeedback + cleanuptextlessqueue.
  app.get("/api/quality/feedback", (_req, res) => {
    res.json({ items: store.db.items.filter((i) => i.imageQualityStatus === "quarantined" || (i.qualityRating != null && i.qualityRating <= 4)) });
  });
  app.post("/api/quality/cleanup-textless", (_req, res) => {
    let fixed = 0;
    const quotes = loadQuotes();
    for (const item of store.db.items) {
      if (item.status === "queue" && !item.quote) { item.quote = quotes[item.id % Math.max(quotes.length, 1)]?.text || ""; fixed++; }
    }
    store.saveDb();
    res.json({ ok: true, fixed, rule: "Textless covers never sit in the queue. Each one got a stock quote, matching the original app rule." });
  });

  // Embedded text detection is a vision job. In Muse that was an app action;
  // portably, the creator's Muse looks at the photo and records the result here.
  app.post("/api/items/:id/embedded-text", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    item.embeddedText = { hasText: Boolean(req.body.hasText), text: String(req.body.text || ""), checkedAt: Date.now(), checkedBy: "claude-vision" };
    store.saveDb();
    res.json({ item });
  });

  // Image repair flow: completeimagerepair in the original.
  app.post("/api/items/:id/repair", (req, res) => {
    const item = mustItem(req, res); if (!item) return;
    item.repairStatus = String(req.body.status || "ready");
    if (req.body.imageUrl) item.imageUrl = String(req.body.imageUrl);
    if (item.repairStatus === "ready") item.imageQualityStatus = "passed";
    store.saveDb();
    res.json({ item });
  });
}
