// Draws a cover the way the review screen shows it: the photo, its image effects, and the text on top.
// The screen and the posted JPEG both go through drawCover, so what she approved is what posts.
// The photo comes from this app's own address (/api/items/:id/image), so a photo from Drive or
// another site never blocks the canvas export.

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
  tiktok: "TikTok Sans Classic",
  avenir: "Avenir",
  serif: "Serif",
  condensed: "Condensed",
  papyrus: "Papyrus",
  papyrus_condensed: "Papyrus Condensed",
};

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

/** Lines the way the deck wraps them: at spaces, inside long words when one doesn't fit, her line breaks kept. */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line === "" ? word : `${line} ${word}`;
      if (measure(next) <= maxWidth) { line = next; continue; }
      if (line !== "") lines.push(line);
      let rest = word;
      while (rest.length > 1 && measure(rest) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
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
 */
export function coverLayout(box, width, height, measureAt) {
  const s = withDefaults(box);
  const boxW = (width * clamp(s.textWidth, 20, 100)) / 100;
  let fontPx = previewFontPx(s) * (width / PREVIEW_WIDTH);
  let lines;
  const lineCount = clamp(Math.round(s.lineCount), 0, 99); // no cap: the balancer stops at the word count
  if (lineCount > 0) {
    lines = balanceLines(s.quote, lineCount, measureAt(fontPx));
    // Lines picks the rows; the size gives way so the widest row fits the box.
    for (let pass = 0; pass < 3 && lines.length; pass++) {
      const m = measureAt(fontPx);
      const widest = Math.max(...lines.map((l) => m(l)));
      if (widest <= boxW + 1e-9) break;
      fontPx *= boxW / widest;
    }
  } else {
    lines = wrapText(s.quote, boxW, measureAt(fontPx));
  }
  const measure = measureAt(fontPx);
  const lineHeight = (fontPx * clamp(s.textHeight, 60, 200)) / 100;

  // Fit and place like the original (SafeQuote fitInsideSafeZone): measured unstretched on the column, the whole
  // block shrinks (never grows) until the stretched block fits inside the photo less a 2 px inset, its center is
  // clamped by the stretched half-extents, and only then is it stretched. Runs at 30/30 too, where it shrinks an
  // oversized block and pulls a center near an edge in. Text width and Text height are the stretch (30 = none).
  const sx = clamp(Number(s.widthScale) || 30, 10, 50) / 30;
  const sy = clamp(Number(s.heightScale) || 30, 10, 50) / 30;
  const inset = (2 * width) / PREVIEW_WIDTH;
  const naturalW = Math.max(boxW, ...lines.map((l) => measure(l)));
  const naturalH = lines.length * lineHeight;
  const fit = lines.length ? Math.min(1, (width - 2 * inset) / (naturalW * sx), (height - 2 * inset) / (naturalH * sy)) : 1;
  const halfW = (naturalW * fit * sx) / 2, halfH = (naturalH * fit * sy) / 2;
  const cx = clamp((width * s.horizontalPosition) / 100, inset + halfW, width - inset - halfW);
  const cy = clamp((height * s.verticalPosition) / 100, inset + halfH, height - inset - halfH);
  const justify = s.textAlign === "justify";
  const align = justify ? "left" : ["left", "right"].includes(s.textAlign) ? s.textAlign : "center";
  const boxLeft = cx - boxW / 2;
  const top = cy - naturalH / 2;

  // Her line breaks end a paragraph; the last row of a paragraph is never stretched.
  const paraEnds = new Set();
  if (justify && lineCount === 0) {
    let at = 0;
    for (const para of String(s.quote).split("\n")) {
      at += wrapText(para, boxW, measure).length;
      paraEnds.add(at - 1);
    }
  } else paraEnds.add(lines.length - 1);

  const rows = lines.map((text, i) => {
    const w = measure(text);
    const y = top + (i + 0.5) * lineHeight;
    if (justify) {
      const words = text.split(" ").filter(Boolean);
      if (!paraEnds.has(i) && words.length > 1) {
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
    color: s.textColor, font: s.textFont, weight: s.fontWeight, sx, sy, fit, kx, ky, anchorX, anchorY, bounds };
}

/** How many rows Lines on Auto draws for this box. The stepper shows it, and its first tap starts from it. */
export function autoLineCount(box, measureAt) {
  const words = String(box.quote || "").split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const L = coverLayout({ ...box, lineCount: 0 }, PREVIEW_WIDTH, PREVIEW_WIDTH * 1.25, measureAt);
  return Math.max(1, Math.min(words, L.rows.length));
}

/** The text boxes a cover draws: the quote when it's on, then her extra boxes, which always draw. */
export function textBoxes(item, quoteOn) {
  const boxes = [];
  if (quoteOn && String(item.quote || "").trim()) boxes.push({ ...withDefaults(item), quote: String(item.quote), main: true });
  (Array.isArray(item.extraTexts) ? item.extraTexts : []).forEach((extra, extraIndex) => {
    if (extra && String(extra.quote || "").trim()) boxes.push({ ...withDefaults(extra), extraIndex });
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

/** Loads every font the cover's text uses, so canvas measures and draws with the real face. */
export async function ensureFonts(item, quoteOn = true) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const boxes = textBoxes(item, quoteOn);
  await Promise.all(boxes.map((b) => document.fonts.load(fontString(b, 40), b.quote).catch(() => null)));
}

/**
 * Draws the cover into ctx at width x height: the photo (src rect optional, for the 9:16 story frame),
 * Image contrast, face mosaic, then the text. Returns { effectsSkipped } when the photo's pixels
 * couldn't be read (a photo from another site), so the screen can say so.
 */
export function drawCover(ctx, item, img, width, height, { quoteOn = Boolean(item.showQuote), src = null } = {}) {
  let effectsSkipped = false;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (img) {
    if (src) ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, width, height);
    else ctx.drawImage(img, 0, 0, width, height);
  }
  const edit = item.imageEdit || {};
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
  for (const box of textBoxes(item, quoteOn)) {
    const L = coverLayout(box, width, height, (px) => { ctx.font = fontString(box, px); return (t) => ctx.measureText(t).width; });
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

/** Where each text box sits on a width x height cover, for tapping the text to edit it. */
export function textHitBoxes(item, width, height, measureCtx, quoteOn = Boolean(item.showQuote)) {
  return textBoxes(item, quoteOn).map((box) => {
    const L = coverLayout(box, width, height, (px) => { measureCtx.font = fontString(box, px); return (t) => measureCtx.measureText(t).width; });
    return { index: box.main ? -1 : box.extraIndex, ...L.bounds };
  });
}

/** The cover as a JPEG Blob, longest side at most maxLong. quoteOn follows the deck: the toggle, and quotes unlocked. */
export async function renderCover(item, { maxLong = 2160, quoteOn = Boolean(item.showQuote) } = {}) {
  const img = new Image();
  img.decoding = "async";
  img.src = `/api/items/${item.id}/image?v=${encodeURIComponent(String(item.imageUrl || "").slice(-80))}`;
  await img.decode();
  const s = Math.min(1, maxLong / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  await ensureFonts(item, quoteOn);
  drawCover(canvas.getContext("2d"), item, img, w, h, { quoteOn });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the cover image."))), "image/jpeg", 0.92));
}
