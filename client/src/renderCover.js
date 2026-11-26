// Draws a cover the way the review screen shows it: the photo, its image effects, and the text on top.
// The screen and the posted JPEG both go through drawCover, so what she approved is what posts.
// The photo comes from this app's own address (/api/items/:id/image), so a photo from Drive or
// another site never blocks the canvas export.
import { RANDOM_LAYOUTS, randomEditorialLayout } from "./reviewMath.js";

export const FONT_CSS = {
  tiktok: "'TikTok Sans', system-ui, sans-serif",
  avenir: "Avenir, 'Avenir Next', 'Segoe UI', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  condensed: "'Arial Narrow', 'Helvetica Neue Condensed', sans-serif",
  papyrus: "Papyrus, fantasy",
  papyrus_condensed: "Papyrus, fantasy",
};

/** What the font menu says for each font. */
export const FONT_LABELS = {
  tiktok: "TikTok Sans", // the plain TikTok Sans face; new text starts at Medium (1.28.0)
  avenir: "Avenir",
  serif: "Serif",
  condensed: "Condensed",
  papyrus: "Papyrus",
  papyrus_condensed: "Papyrus Condensed",
};

/**
 * Her own fonts (1.20.0, Big Edit item 4), from her data folder: each gets its own family name, so it never mixes with
 * a font of the same name on the device, and its faces are loaded from the app's own address, signed in.
 */
let fontsSeen = 0;
/** Goes up each time her fonts change, so a cover drawn before they arrived loads them and draws again. */
export const fontsVersion = () => fontsSeen;
export function registerFonts(list) {
  const rules = [];
  for (const f of Array.isArray(list) ? list : []) {
    if (!f?.id || !Array.isArray(f.faces)) continue;
    const family = `uBee ${f.id}`;
    FONT_CSS[f.id] = `"${family}", system-ui, sans-serif`;
    FONT_LABELS[f.id] = f.label || f.id;
    for (const face of f.faces) rules.push(`@font-face { font-family: "${family}"; src: url("${face.url}"); font-weight: ${Number(face.weight) || 400}; font-display: block; }`);
  }
  if (typeof document === "undefined") return;
  let tag = document.getElementById("ubeeCustomFonts");
  if (!tag) { tag = document.createElement("style"); tag.id = "ubeeCustomFonts"; document.head.appendChild(tag); }
  if (tag.textContent !== rules.join("\n")) { tag.textContent = rules.join("\n"); fontsSeen += 1; }
}

/**
 * The queue's look (1.20.0, Big Edit items 1 and 2): the font and the color she last picked on any queued cover, and
 * her default color until she picks one. Null for either means each cover draws its own, as before.
 */
export function lookOf() {
  // 1.26.0 (Arjang #1092, Quill #1140): the queue lock is gone. Each cover draws with its own font and color.
  return { textFont: null, textColor: null };
}
/** A queued cover as it draws: the queue's look on it and on every text box. A decided cover keeps its own. */
export function withLook(item, look) {
  if (!item || item.status !== "queue" || !look || (!look.textFont && !look.textColor)) return item;
  const put = (b) => ({ ...b, ...(look.textFont ? { textFont: look.textFont } : {}), ...(look.textColor ? { textColor: look.textColor } : {}) });
  return { ...put(item), extraTexts: (Array.isArray(item.extraTexts) ? item.extraTexts : []).map(put) };
}

// Two presets beside the 11 colors (1.8, Arjang #263, Quill #269). Each sets the color and the opacity together;
// they are not palette colors, so the palette stays 11 and a palette color picked after sets the color only.
export const HALF_PRESETS = [
  { name: "Black 50%", patch: { textColor: "#000000", opacity: 50 } },
  { name: "White 50%", patch: { textColor: "#FFFFFF", opacity: 50 } },
];
/** True when a text box carries exactly this preset's color and opacity. */
export const presetOn = (box, preset) =>
  String(box?.textColor || "").toUpperCase() === preset.patch.textColor && Number(box?.opacity) === preset.patch.opacity;
/**
 * What picking a color does to a box (1.20.0, Big Edit item 8): a color picked after either 50% preset brings the text
 * back to 100%. Any other opacity, set by hand on the slider, stays.
 */
export const colorPatch = (box, hex) => (HALF_PRESETS.some((p) => presetOn(box, p)) ? { textColor: hex, opacity: 100 } : { textColor: hex });

// The deck's photo width on a computer screen. Text sizes are set against it, so a cover drawn wider
// scales them up by (cover width / this) and the quote covers the same share of the photo.
export const PREVIEW_WIDTH = 494;

/** Every text box style field, with the value a cover had before it existed. */
export const STYLE_DEFAULTS = {
  textColor: "#FFFFFF", textFont: "tiktok", textAlign: "center",
  fontSize: 58, fontWeight: 500, opacity: 100,
  horizontalPosition: 50, verticalPosition: 50, lineCount: 0,
  textWidth: 84, textHeight: 100, widthScale: 30, heightScale: 30,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (v == null || v === "" || !Number.isFinite(Number(v)) ? fallback : Number(v));

/** A text box with every style field filled in. */
export function withDefaults(box) {
  const out = { ...STYLE_DEFAULTS, ...box };
  for (const k of Object.keys(STYLE_DEFAULTS)) {
    if (typeof STYLE_DEFAULTS[k] === "number") out[k] = num(box?.[k], STYLE_DEFAULTS[k]);
    else if (out[k] == null || out[k] === "") out[k] = STYLE_DEFAULTS[k];
  }
  out.quote = String(box?.quote ?? "");
  return out;
}

/** The deck's text size for a box, before scaling: 55% of the size slider, never under 14px. */
export const previewFontPx = (item) => Math.max(14, Number(item.fontSize ?? 58) * 0.55);

/**
 * How many rows Lines on Auto draws (1.13.8, the original's estimatedLineCount, Quill #687 and #689): her typed line
 * count when she typed more than one line, otherwise the characters / 20, rounded. Never under 1 or over the words;
 * an empty quote has none. The words are then balanced across that many rows (balanceLines).
 */
export function estimatedLineCount(quote) {
  const text = String(quote ?? "").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const typed = text.split("\n").filter((l) => l.trim()).length;
  return Math.max(1, Math.min(words, typed > 1 ? typed : Math.round(text.length / 20)));
}

/** The column width (1.27.0, Quill #1145): text starts this wide, and a drag off center narrows it no further than
 * LANDSCAPE_MIN_WIDTH. Landscape only in 1.27.0, every ratio since 1.29.0 (Quill #1212). */
export const LANDSCAPE_WIDTH = 84, LANDSCAPE_MIN_WIDTH = 38;
/**
 * Lines on Auto. On a cover whose box is narrower than the 84% column (a drag off center re-wrapped it, or she set it
 * narrower), the words take more rows in the same ratio, so the text re-wraps into a taller column at about the same
 * size instead of shrinking. The 84% column itself is as before. Every ratio since 1.29.0 (Quill #1212).
 */
export function autoLines(s, width, height) {
  const n = estimatedLineCount(s.quote);
  const w = clamp(Number(s.textWidth) || LANDSCAPE_WIDTH, 20, 100);
  if (w >= LANDSCAPE_WIDTH || !n) return n;
  const words = String(s.quote ?? "").split(/\s+/).filter(Boolean).length;
  return Math.min(words, Math.ceil((n * LANDSCAPE_WIDTH) / w));
}
/**
 * The width a landscape drag re-wraps a box to (1.27.0, Quill #1145): when the center she's pulling to (cx, px) would
 * put the block's edge past the photo, the box narrows so the block fits around that center, down to 38%. half is the
 * block's half width at width w0. Answers null while the block still fits at w0, so its width stays hers.
 */
export function rewrapWidth(cx, half, w0, left, right) {
  const room = Math.min(cx - left, right - cx);
  if (!(half > 0) || room >= half) return null;
  return Math.max(LANDSCAPE_MIN_WIDTH, Math.min(w0, Math.floor((w0 * Math.max(0, room)) / half)));
}

/**
 * The Lines picker: the quote's words in exactly `count` rows (fewer when there are fewer words),
 * split so the widest row is as narrow as it can be. Her own line breaks become spaces here.
 */
export function balanceLines(text, count, measure) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const k = Math.min(Math.max(1, Math.round(count)), words.length);
  if (!words.length) return [];
  const n = words.length;
  const width = [];
  for (let i = 0; i < n; i++) {
    width[i] = [];
    for (let j = i; j < n; j++) width[i][j] = measure(words.slice(i, j + 1).join(" "));
  }
  // best[r][i]: the best way to set words i.. in r rows, as [widest row, sum of squared widths, first cut].
  const best = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(null));
  for (let i = 0; i < n; i++) best[1][i] = [width[i][n - 1], width[i][n - 1] ** 2, n];
  for (let r = 2; r <= k; r++) {
    for (let i = 0; i <= n - r; i++) {
      let pick = null;
      for (let cut = i + 1; cut <= n - r + 1; cut++) {
        const rest = best[r - 1][cut];
        if (!rest) continue;
        const w = width[i][cut - 1];
        const cand = [Math.max(w, rest[0]), w * w + rest[1], cut];
        if (!pick || cand[0] < pick[0] - 1e-9 || (Math.abs(cand[0] - pick[0]) <= 1e-9 && cand[1] < pick[1])) pick = cand;
      }
      best[r][i] = pick;
    }
  }
  const rows = [];
  for (let r = k, i = 0; r >= 1; r--) {
    const cut = best[r][i][2];
    rows.push(words.slice(i, cut).join(" "));
    i = cut;
  }
  return rows;
}

/**
 * Where a text box goes on a cover of width x height. measureAt(px) returns a function that measures a
 * string at that text size. Like the original, the block fits inside the photo less 2 px and its center is clamped.
 * With safe (1.13.8, the deck's constrainToSafeZone for a box she hasn't dragged this session), the block fits and
 * clamps inside the safe rectangle instead, the same way.
 */
export function coverLayout(box, width, height, measureAt, { safe = false } = {}) {
  const s = withDefaults(box);
  const boxW = (width * clamp(s.textWidth, 20, 100)) / 100;
  let fontPx = previewFontPx(s) * (width / PREVIEW_WIDTH);
  const lineCount = clamp(Math.round(s.lineCount), 0, 99); // no cap: the balancer stops at the word count
  // Lines picks the rows (on Auto, the original's estimate, 1.13.8); the size gives way so the widest row fits the box.
  const lines = balanceLines(s.quote, lineCount > 0 ? lineCount : autoLines(s, width, height), measureAt(fontPx));
  for (let pass = 0; pass < 3 && lines.length; pass++) {
    const m = measureAt(fontPx);
    const widest = Math.max(...lines.map((l) => m(l)));
    if (widest <= boxW + 1e-9) break;
    fontPx *= boxW / widest;
  }
  const measure = measureAt(fontPx);
  const lineHeight = (fontPx * clamp(s.textHeight, 60, 200)) / 100;

  // Fit and place like the original (SafeQuote fitInsideSafeZone): measured unstretched on the column, the whole
  // block shrinks (never grows) until the stretched block fits inside the photo less a 2 px inset, its center is
  // clamped by the stretched half-extents, and only then is it stretched. Runs at 30/30 too, where it shrinks an
  // oversized block and pulls a center near an edge in. Text width and Text height are the stretch (30 = none).
  const sx = clamp(Number(s.widthScale) || 30, 10, 50) / 30;
  const sy = clamp(Number(s.heightScale) || 30, 10, 50) / 30;
  // The photo keeps a 2 px inset; the safe rectangle (1.13.8) is already in from the edges, so a held block's edge can sit
  // right on it, where a drag's crossing lock puts it too.
  const area = safe ? safeZoneFor(width, height) : { left: 0, top: 0, right: width, bottom: height };
  const inset = safe ? 0 : (2 * width) / PREVIEW_WIDTH;
  const naturalW = Math.max(boxW, ...lines.map((l) => measure(l)));
  const naturalH = lines.length * lineHeight;
  const fit = lines.length ? Math.min(1, (area.right - area.left - 2 * inset) / (naturalW * sx), (area.bottom - area.top - 2 * inset) / (naturalH * sy)) : 1;
  const halfW = (naturalW * fit * sx) / 2, halfH = (naturalH * fit * sy) / 2;
  const cx = clamp((width * s.horizontalPosition) / 100, area.left + inset + halfW, area.right - inset - halfW);
  const cy = clamp((height * s.verticalPosition) / 100, area.top + inset + halfH, area.bottom - inset - halfH);
  const justify = s.textAlign === "justify";
  const align = justify ? "left" : ["left", "right"].includes(s.textAlign) ? s.textAlign : "center";
  const boxLeft = cx - boxW / 2;
  const top = cy - naturalH / 2;

  // Every row of two or more words is stretched edge to edge, the last row too (1.20.0, Big Edit item 11: the last word
  // touches the right edge). A row of one word has nothing to spread, so it starts at the left edge.
  const rows = lines.map((text, i) => {
    const w = measure(text);
    const y = top + (i + 0.5) * lineHeight;
    if (justify) {
      const words = text.split(" ").filter(Boolean);
      if (words.length > 1) {
        const gap = (boxW - words.reduce((sum, wd) => sum + measure(wd), 0)) / (words.length - 1);
        let x = boxLeft;
        const placed = words.map((wd) => { const at = x; x += measure(wd) + gap; return { text: wd, x: at }; });
        return { text, y, x: boxLeft, left: boxLeft, width: boxW, words: placed };
      }
      let x = boxLeft;
      const placed = words.map((wd) => { const at = x; x += measure(wd) + measure(" "); return { text: wd, x: at }; });
      return { text, y, x: boxLeft, left: boxLeft, width: w, words: placed };
    }
    const x = align === "left" ? boxLeft : align === "right" ? boxLeft + boxW : boxLeft + boxW / 2;
    const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    return { text, y, x, left, width: w };
  });

  const x = align === "left" ? boxLeft : align === "right" ? boxLeft + boxW : boxLeft + boxW / 2;
  // drawCover scales the rows by (kx, ky) around the clamped center; the tap box is the same block, as drawn.
  const kx = fit * sx, ky = fit * sy, anchorX = cx, anchorY = cy;
  const rawLeft = rows.length ? Math.min(...rows.map((r) => r.left)) : boxLeft;
  const rawRight = rows.length ? Math.max(...rows.map((r) => r.left + r.width)) : boxLeft + boxW;
  const bounds = {
    left: anchorX + (rawLeft - anchorX) * kx, right: anchorX + (rawRight - anchorX) * kx,
    top: anchorY + (top - anchorY) * ky, bottom: anchorY + (top + naturalH - anchorY) * ky,
  };
  return { fontPx, lines, rows, x, top, lineHeight, align, justify, boxLeft, boxW, alpha: clamp(s.opacity, 0, 100) / 100,
    color: s.textColor, font: s.textFont, weight: s.fontWeight, sx, sy, fit, kx, ky, anchorX, anchorY, bounds, halfW, halfH, naturalW, naturalH };
}

/** How many rows Lines on Auto draws for this box. The stepper shows it, and its first tap starts from it. */
export function autoLineCount(box, measureAt) {
  const words = String(box.quote || "").split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const L = coverLayout({ ...box, lineCount: 0 }, PREVIEW_WIDTH, PREVIEW_WIDTH * 1.25, measureAt);
  return Math.max(1, Math.min(words, L.rows.length));
}

/** True for a text box on the cover itself; a box with a slide sits on that carousel photo (1.20.0, Big Edit item 3). */
export const onCoverPhoto = (box) => box?.slide === undefined || box?.slide === null;
/**
 * The text boxes a photo draws. The cover (slideAt null): the quote when it's on, then her extra boxes on the cover.
 * A carousel photo (slideAt, its place in the cover's slides): only the boxes she put on it.
 */
export function textBoxes(item, quoteOn, slideAt = null) {
  const boxes = [];
  if (slideAt === null && quoteOn && String(item.quote || "").trim()) boxes.push({ ...withDefaults(item), quote: String(item.quote), main: true });
  (Array.isArray(item.extraTexts) ? item.extraTexts : []).forEach((extra, extraIndex) => {
    const here = slideAt === null ? onCoverPhoto(extra) : extra?.slide === slideAt;
    if (extra && here && String(extra.quote || "").trim()) boxes.push({ ...withDefaults(extra), extraIndex });
  });
  return boxes;
}

/** One pixel through the Image contrast setting: normal, high (more contrast) or bw (black and white). */
export function contrastPixel(r, g, b, mode) {
  if (mode === "bw") {
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    return [l, l, l];
  }
  if (mode === "high") return [r, g, b].map((v) => clamp(Math.round((v - 128) * 1.35 + 128), 0, 255));
  return [r, g, b];
}

export const CONTRAST_MODES = [
  { id: "normal", label: "Normal color" },
  { id: "high", label: "More contrast" },
  { id: "bw", label: "Black and white" },
];

/** Face mosaic boxes (percent of the photo) as whole pixels inside a width x height cover. Broken ones are dropped. */
export function mosaicRects(list, width, height) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r) continue;
    const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(Number);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    const px = Math.round((clamp(x, 0, 100) * width) / 100);
    const py = Math.round((clamp(y, 0, 100) * height) / 100);
    const pw = Math.min(Math.round((w * width) / 100), width - px);
    const ph = Math.min(Math.round((h * height) / 100), height - py);
    if (pw > 0 && ph > 0) out.push({ x: px, y: py, w: pw, h: ph });
  }
  return out;
}

const fontString = (box, px) => `${box.fontWeight || 500} ${px}px ${FONT_CSS[box.textFont] || FONT_CSS.tiktok}`;

let measureCtx = null;
/** Measures a box's font at any size on one shared canvas (the editor's Lines estimate). Null without a DOM. */
export function canvasMeasureAt(box) {
  if (typeof document === "undefined") return null;
  measureCtx ||= document.createElement("canvas").getContext("2d");
  return (px) => { measureCtx.font = fontString(box, px); return (t) => measureCtx.measureText(t).width; };
}

// Whether a font really has a face at a weight (1.20.0, Big Edit item 5): a font with no Light face draws Light as
// Regular, so the editor greys Light out for it. Found by drawing a sample at both weights; kept per font and weight.
const faces = new Map();
/** Resolves true when this font draws differently at `weight` than at Regular (400), false when it's the same face. */
export function hasFace(fontId, weight) {
  const key = `${fontId}|${weight}`;
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve(true);
  if (!faces.has(key)) {
    const family = FONT_CSS[fontId] || FONT_CSS.tiktok;
    faces.set(key, Promise.all([weight, 400].map((w) => document.fonts.load(`${w} 40px ${family}`).catch(() => null))).then(() => {
      const c = document.createElement("canvas");
      c.width = 460; c.height = 64;
      const x = c.getContext("2d", { willReadFrequently: true });
      const ink = (w) => {
        x.clearRect(0, 0, c.width, c.height);
        x.font = `${w} 40px ${family}`;
        x.fillText("Hamburgefonstiv", 4, 46);
        let s = 0;
        const d = x.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) s += d[i];
        return s;
      };
      return Math.abs(ink(weight) - ink(400)) >= 1;
    }).catch(() => true));
  }
  return faces.get(key);
}

/** Loads every font the cover's text uses, so canvas measures and draws with the real face. */
export async function ensureFonts(item, quoteOn = true) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const slides = [...new Set((item.extraTexts || []).filter((b) => !onCoverPhoto(b)).map((b) => b.slide))];
  const boxes = [...textBoxes(item, quoteOn), ...slides.flatMap((at) => textBoxes(item, false, at))]; // the carousel photos' text too (1.20.0)
  await Promise.all(boxes.map((b) => document.fonts.load(fontString(b, 40), b.quote).catch(() => null)));
}

/**
 * Draws the cover into ctx at width x height: the photo (src rect optional, for the 9:16 story frame),
 * Image contrast, face mosaic, then the text. Returns { effectsSkipped } when the photo's pixels
 * couldn't be read (a photo from another site), so the screen can say so.
 */
export function drawCover(ctx, item, img, width, height, { quoteOn = Boolean(item.showQuote), src = null, safe = false, free = null, slideAt = null } = {}) {
  let effectsSkipped = false;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (img) {
    if (src) ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, width, height);
    else ctx.drawImage(img, 0, 0, width, height);
  }
  const edit = (slideAt === null && item.imageEdit) || {}; // contrast and mosaics belong to the cover photo
  if (img && edit.contrast && edit.contrast !== "normal") {
    try {
      const data = ctx.getImageData(0, 0, width, height);
      const p = data.data;
      for (let i = 0; i < p.length; i += 4) {
        const [r, g, b] = contrastPixel(p[i], p[i + 1], p[i + 2], edit.contrast);
        p[i] = r; p[i + 1] = g; p[i + 2] = b;
      }
      ctx.putImageData(data, 0, 0);
    } catch { effectsSkipped = true; }
  }
  if (img) {
    const block = Math.max(4, Math.round(Math.min(width, height) / 48));
    for (const r of mosaicRects(edit.mosaics, width, height)) {
      const tw = Math.max(1, Math.ceil(r.w / block)), th = Math.max(1, Math.ceil(r.h / block));
      const tiny = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(tw, th) : Object.assign(document.createElement("canvas"), { width: tw, height: th });
      const t = tiny.getContext("2d");
      t.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, tw, th, r.x, r.y, r.w, r.h);
      ctx.imageSmoothingEnabled = true;
    }
  }
  for (const box of textBoxes(item, quoteOn, slideAt)) {
    const L = coverLayout(box, width, height, (px) => { ctx.font = fontString(box, px); return (t) => ctx.measureText(t).width; }, { safe: held(box, safe, free) });
    ctx.font = fontString(box, L.fontPx);
    ctx.fillStyle = box.textColor || "#FFFFFF";
    ctx.globalAlpha = L.alpha;
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.translate(L.anchorX, L.anchorY);
    ctx.scale(L.kx, L.ky);
    ctx.translate(-L.anchorX, -L.anchorY);
    for (const row of L.rows) {
      if (row.words) {
        ctx.textAlign = "left";
        for (const w of row.words) ctx.fillText(w.text, w.x, row.y);
      } else {
        ctx.textAlign = L.align;
        ctx.fillText(row.text, row.x, row.y);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return { effectsSkipped };
}

/**
 * The deck holds a box inside the safe rectangle until she drags it (1.13.8, Quill #687 and #689). free is the set of
 * boxes she dragged on this cover this session, by index (-1 is the quote, 0 and up her own boxes), like the
 * original's positionedTextIds: never saved, so a reload holds them again until she drags them.
 */
const held = (box, safe, free) => Boolean(safe) && !free?.has(box.main ? -1 : box.extraIndex);

/** Where each text box sits on a width x height cover, for tapping the text to edit it, with the drawing's own hold. */
export function textHitBoxes(item, width, height, measureCtx, quoteOn = Boolean(item.showQuote), { safe = false, free = null, slideAt = null } = {}) {
  return textBoxes(item, quoteOn, slideAt).map((box) => {
    const L = coverLayout(box, width, height, (px) => { measureCtx.font = fontString(box, px); return (t) => measureCtx.measureText(t).width; }, { safe: held(box, safe, free) });
    return { index: box.main ? -1 : box.extraIndex, ...L.bounds, centerX: L.anchorX, centerY: L.anchorY, halfW: L.halfW, halfH: L.halfH,
      textWidth: clamp(withDefaults(box).textWidth, 20, 100) }; // a landscape drag re-wraps from it (1.27.0)
  });
}

/**
 * The cover as a JPEG Blob, longest side at most maxLong. quoteOn follows the deck: the toggle, and quotes unlocked.
 * It draws what the deck shows (1.13.8): boxes held in the safe rectangle, except any in free (dragged this session).
 */
export async function renderCover(item, { maxLong = 2160, quoteOn = Boolean(item.showQuote), free = null, slideAt = null } = {}) {
  // slideAt (1.31.1): one of her carousel photos, with its own text only, the way the deck draws it.
  const slide = slideAt === null ? null : (item.slides || [])[slideAt] || null;
  if (slideAt !== null && (!slide || slide.mediaType === "video")) throw new Error("That slide isn't a photo.");
  const img = new Image();
  img.decoding = "async";
  img.src = slide ? slide.mediaUrl : `/api/items/${item.id}/image?v=${encodeURIComponent(String(item.imageUrl || "").slice(-80))}`;
  await img.decode();
  const s = Math.min(1, maxLong / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  await ensureFonts(item, quoteOn);
  drawCover(canvas.getContext("2d"), slide ? { ...item, imageEdit: null } : item, img, w, h, { quoteOn, safe: true, free, slideAt });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the cover image."))), "image/jpeg", 0.92));
}

// ---------- Randomize layout (1.8): the original's six layouts, kept inside the original's safe zone ----------
// The safe zone in % of the photo itself, per shape (the original's safeBoundsFor). A portrait or square cover takes the
// profile whose shape is nearest its own: 9:16, 3:4, 4:5 or square.
const SAFE_ZONES = [
  { aspect: 9 / 16, left: 5, top: 300 / 19.2, width: 90, height: 1200 / 19.2 },
  { aspect: 3 / 4, left: 6, top: 6, width: 88, height: 88 },
  { aspect: 4 / 5, left: 5, top: 6, width: 90, height: 88 },
  { aspect: 1, left: 6, top: 6, width: 88, height: 88 },
];
/**
 * A landscape cover (any shape wider than square) has no inset since 1.24.0 (Arjang #1087, Quill #1090): its safe zone
 * is the whole photo, so the fit, the safe-edge locks and Randomize all meet the photo's own edges. Text still stays on
 * the photo. Portrait and square shapes keep their insets.
 */
function landscapeZone() {
  return { left: 0, top: 0, width: 100, height: 100 };
}
/** The safe zone of a width x height cover, in pixels. */
export function safeZoneFor(width, height) {
  const a = width / height;
  const z = a > 1 ? landscapeZone() : SAFE_ZONES.reduce((best, p) => (Math.abs(Math.log(p.aspect / a)) < Math.abs(Math.log(best.aspect / a)) ? p : best));
  return { left: (width * z.left) / 100, top: (height * z.top) / 100, right: (width * (z.left + z.width)) / 100, bottom: (height * (z.top + z.height)) / 100 };
}
/** True when the whole drawn block (its fit and stretch included) sits inside the safe zone, 2 px in. */
export function insideSafeZone(box, width, height, measureAt) {
  const b = coverLayout(box, width, height, measureAt).bounds, z = safeZoneFor(width, height), inset = (2 * width) / PREVIEW_WIDTH, e = 1e-6;
  return b.left >= z.left + inset - e && b.right <= z.right - inset + e && b.top >= z.top + inset - e && b.bottom <= z.bottom - inset + e;
}
/**
 * Randomize layout, Quill's spec on the original: one of the six layouts, drawn again up to `tries` times until the
 * whole block fits the safe zone. If none does, the centered hero keeps its draw and only its size shrinks until it
 * fits. Returns layout fields only (align, size, Lines, position): never the color, the font or the weight.
 */
export function randomizeLayout(box, aspect, measureAt, rand = Math.random, { tries = 10 } = {}) {
  const width = PREVIEW_WIDTH, height = PREVIEW_WIDTH / (aspect || 0.8);
  const fits = (p) => insideSafeZone({ ...box, ...p }, width, height, measureAt);
  for (let i = 0; i < tries; i++) {
    const p = randomEditorialLayout(rand, box.quote);
    if (fits(p)) return p;
  }
  const p = randomEditorialLayout(rand, box.quote, RANDOM_LAYOUTS[0]);
  while (p.fontSize > 6 && !fits(p)) p.fontSize -= 2;
  return p;
}

/**
 * The placement pass's answer, made ready (1.13.8, Quill #685 and #687, the original's normalizeQueuedTextPlacement).
 * Ready means leave it alone: when the answer says nothing needs to change and the deck's safe hold wouldn't move or
 * shrink the block, this returns null and only the stamp moves. Otherwise it takes the center, the alignment, the size
 * and the line count from the answer (the box's own where the answer has none) and nothing else. Lines are 1 to 8 and
 * never more than the words: an explicit count wins exactly, and with none on the answer or the box, the estimate is
 * written. The size is 8 to 110. Then the whole block goes inside the safe rectangle: the size scaled down (never up)
 * until the block is short enough, and the center clamped by the block's half extents. Positions keep one decimal.
 */
const PASS_ALIGNS = ["left", "center", "right"];
export function normalizePlacement(box, aspect, measureAt, answer) {
  const width = PREVIEW_WIDTH, height = PREVIEW_WIDTH / (aspect || 0.8);
  const s = withDefaults(box);
  const same = (a, b) => Math.abs(a.anchorX - b.anchorX) < 1e-6 && Math.abs(a.anchorY - b.anchorY) < 1e-6 && Math.abs(a.fit - b.fit) < 1e-9;
  if (!answer?.needsChange && same(coverLayout(s, width, height, measureAt), coverLayout(s, width, height, measureAt, { safe: true }))) return null;
  const a = answer || {};
  const words = s.quote.split(/\s+/).filter(Boolean).length;
  const asked = num(a.lineCount, 0) > 0 ? Math.round(num(a.lineCount, 0)) : s.lineCount > 0 ? Math.round(s.lineCount) : estimatedLineCount(s.quote);
  const next = {
    horizontalPosition: clamp(num(a.horizontalPosition, s.horizontalPosition), 0, 100),
    verticalPosition: clamp(num(a.verticalPosition, s.verticalPosition), 0, 100),
    textAlign: PASS_ALIGNS.includes(a.textAlign) ? a.textAlign : s.textAlign,
    fontSize: clamp(num(a.fontSize, s.fontSize), 8, 110),
    lineCount: clamp(asked, 1, Math.max(1, Math.min(8, words))),
  };
  const z = safeZoneFor(width, height), roomH = z.bottom - z.top;
  for (let pass = 0; pass < 6 && next.fontSize > 8 && next.fontSize * 0.55 > 14; pass++) {
    const L = coverLayout({ ...s, ...next }, width, height, measureAt);
    const tall = L.naturalH * L.sy;
    if (tall <= roomH + 1e-6) break;
    next.fontSize = Math.max(8, Math.floor((next.fontSize * roomH) / tall));
  }
  const L = coverLayout({ ...s, ...next }, width, height, measureAt, { safe: true });
  next.horizontalPosition = Math.round((L.anchorX / width) * 1000) / 10;
  next.verticalPosition = Math.round((L.anchorY / height) * 1000) / 10;
  return next;
}
