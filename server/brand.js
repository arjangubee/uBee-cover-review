// Her look on the cover's text (1.20.0, Big Edit items 1, 2 and 4, Arjang Nov 23): the 11 colors and the fonts, her
// own colors shown first with one default, the queue's text lock, and her own fonts from her data folder. Her colors,
// her lock and her fonts live in her settings and her data folder, never in the repo.
import multer from "multer";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fontsDir, store } from "./store.js";
import { inSpace } from "./accounts.js";

// The 11-color palette, Arjang's finalized names and hex values. No other colors. (Moved here from full.js in 1.20.0.)
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
export const HEX = /^#[0-9A-Fa-f]{6}$/;
const MAX_BRAND = 12;

/** Her own colors, in her order, shown before the 11 (item 2). One of them may be her default color. */
export const brandColors = () => (Array.isArray(store.settings.brandColors) ? store.settings.brandColors : []);
const brandDefault = () => brandColors().find((c) => c.default)?.hex || null;

/** Her own fonts (item 4): [{ id, label, faces: [{ file, weight }] }], the files in her data folder's fonts/. */
export const customFonts = () => (Array.isArray(store.settings.customFonts) ? store.settings.customFonts : []);
/** True for a font the app can draw: one of the six, or one of hers. */
export const fontOk = (id) => FONTS.includes(id) || customFonts().some((f) => f.id === id);

/** The lock as she set it: a font and a color, each null until she picks one on a queued cover. */
function lockAsSet() {
  const s = store.settings.textLock || {};
  return { textFont: fontOk(s.textFont) ? s.textFont : null, textColor: HEX.test(String(s.textColor || "")) ? String(s.textColor) : null };
}
/**
 * The queue's text lock (item 1): one font and one color every queued cover's text draws with, in every text box. Each
 * is the last one she picked on any queued cover; the color is her default color until she picks one. Null for either
 * means each cover draws its own, as before 1.20.0.
 */
export function textLock() {
  const s = lockAsSet();
  return { textFont: s.textFont, textColor: s.textColor || brandDefault() };
}
/** A cover leaving the queue keeps the look it had there: the lock is written into it and into its text boxes. */
export function bakeLock(item) {
  const { textFont, textColor } = textLock();
  if (!textFont && !textColor) return;
  const put = (b) => ({ ...b, ...(textFont ? { textFont } : {}), ...(textColor ? { textColor } : {}) });
  Object.assign(item, put({}));
  item.extraTexts = (Array.isArray(item.extraTexts) ? item.extraTexts : []).map(put);
}

/** A custom color she used goes to the front of her custom colors, newest first, at most 24. Not the 11 or her own. */
export function rememberCustomColor(hex) {
  if (PALETTE.some((c) => c.hex.toUpperCase() === hex) || brandColors().some((c) => c.hex === hex)) return;
  const list = (store.settings.customColors || []).filter((c) => c !== hex);
  store.settings.customColors = [hex, ...list].slice(0, 24);
  store.saveSettings();
}

/** What the editor needs: the 11, the fonts, her custom colors, her own colors, the lock as she set it, her fonts. */
export function palettePayload() {
  return {
    palette: PALETTE,
    fonts: [...FONTS, ...customFonts().map((f) => f.id)],
    customColors: store.settings.customColors || [],
    brandColors: brandColors(),
    lock: lockAsSet(),
    customFonts: customFonts().map((f) => ({ id: f.id, label: f.label,
      faces: f.faces.map((x) => ({ weight: x.weight, url: `/api/fonts/${encodeURIComponent(x.file)}` })) })),
  };
}

// A font file is known by its first four bytes: TrueType, OpenType, Apple TrueType, WOFF or WOFF2.
const FONT_KINDS = [["00010000", "ttf"], ["4f54544f", "otf"], ["74727565", "ttf"], ["774f4646", "woff"], ["774f4632", "woff2"]];
const fontKind = (buf) => FONT_KINDS.find(([magic]) => buf.length > 4 && buf.subarray(0, 4).toString("hex") === magic)?.[1] || null;
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const fontUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

export function registerBrand(app) {
  app.get("/api/palette", (_req, res) => res.json(palettePayload()));

  // Remove one of her custom colors (1.9.1, Arjang's yes to #282). Covers that use it keep it; only the shortcut goes.
  app.post("/api/palette/custom-colors/remove", (req, res) => {
    const hex = String(req.body?.hex ?? "").toUpperCase();
    if (!HEX.test(hex)) return res.status(400).json({ error: "Send the color as #RRGGBB." });
    const list = store.settings.customColors || [];
    if (list.includes(hex)) { store.settings.customColors = list.filter((c) => c !== hex); store.saveSettings(); }
    res.json(palettePayload());
  });

  // Her own colors (item 2), set by her Muse: up to 12, each a name and a #RRGGBB, in the order she wants them, and at
  // most one marked default. An empty list takes them away.
  app.post("/api/palette/brand", (req, res) => {
    const list = req.body?.colors;
    if (!Array.isArray(list) || list.length > MAX_BRAND) return res.status(400).json({ error: `Send colors as a list of up to ${MAX_BRAND}.` });
    const colors = [];
    for (const c of list) {
      const name = String(c?.name ?? "").trim().slice(0, 40), hex = String(c?.hex ?? "").toUpperCase();
      if (!name || !HEX.test(hex)) return res.status(400).json({ error: "Each color needs a name and a #RRGGBB hex." });
      colors.push({ name, hex, ...(c.default === true ? { default: true } : {}) });
    }
    if (colors.filter((c) => c.default).length > 1) return res.status(400).json({ error: "Only one color can be the default." });
    store.settings.brandColors = colors;
    store.saveSettings();
    res.json(palettePayload());
  });

  // The queue's text lock (item 1): the page sends the font or the color she picked on a queued cover, or null to take
  // one back (undo does that). Only the fields sent change.
  app.post("/api/text-lock", (req, res) => {
    const b = req.body || {};
    const next = { ...lockAsSet() };
    if ("textFont" in b) {
      if (b.textFont !== null && !fontOk(b.textFont)) return res.status(400).json({ error: "That font isn't one of the fonts." });
      next.textFont = b.textFont;
    }
    if ("textColor" in b) {
      const hex = b.textColor === null ? null : String(b.textColor).toUpperCase();
      if (hex !== null && !HEX.test(hex)) return res.status(400).json({ error: "Send the color as #RRGGBB." });
      next.textColor = hex;
      if (hex) rememberCustomColor(hex);
    }
    store.settings.textLock = next;
    store.saveSettings();
    res.json(palettePayload());
  });

  // Her own fonts (item 4), added by her Muse: a font file (TTF, OTF, WOFF or WOFF2, up to 8 MB), its name in the font
  // menu, and its weight (100 to 900). The same name with another weight adds a face; the same weight replaces it.
  app.post("/api/fonts", inSpace(fontUpload.single("font")), (req, res) => {
    const label = String(req.body?.label ?? "").trim().slice(0, 40);
    const weight = Number(req.body?.weight);
    const kind = req.file ? fontKind(req.file.buffer) : null;
    if (!kind) return res.status(400).json({ error: "Send a font file: TTF, OTF, WOFF or WOFF2." });
    if (!label || !slug(label)) return res.status(400).json({ error: "Give the font a name for the font menu." });
    if (!Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100) return res.status(400).json({ error: "The weight is 100, 200 and so on up to 900." });
    const id = `custom-${slug(label)}`;
    const file = `${slug(label)}-${weight}.${kind}`;
    writeFileSync(join(fontsDir(), file), req.file.buffer);
    const fonts = customFonts().filter((f) => f.id !== id);
    const was = customFonts().find((f) => f.id === id);
    const faces = [...(was?.faces || []).filter((x) => x.weight !== weight), { file, weight }].sort((a, c) => a.weight - c.weight);
    store.settings.customFonts = [...fonts, { id, label, faces }];
    store.saveSettings();
    res.json(palettePayload());
  });
  // Her font files open only signed in, in her own space, like her photos.
  app.get("/api/fonts/:file", (req, res) => {
    const known = customFonts().some((f) => f.faces.some((x) => x.file === req.params.file));
    const path = join(fontsDir(), req.params.file);
    if (!known || !existsSync(path)) return res.status(404).json({ error: "font not found" });
    res.sendFile(path, { headers: { "Cache-Control": "private, max-age=86400" } });
  });
}
