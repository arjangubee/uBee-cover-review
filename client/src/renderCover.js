// Draws a cover the way the review deck shows it: the photo, and the quote on top when it's on.
// What she approved is what posts. The photo comes from this app's own address (/api/items/:id/image),
// so a photo from Drive or another site never blocks the canvas export.

export const FONT_CSS = {
  tiktok: "'TikTok Sans', system-ui, sans-serif",
  avenir: "Avenir, 'Segoe UI', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  condensed: "'Arial Narrow', 'Helvetica Neue Condensed', sans-serif",
  papyrus: "Papyrus, fantasy",
  papyrus_condensed: "Papyrus, fantasy",
};

// The deck's photo width on a computer screen. Text sizes in the deck are set against it, so the
// posted cover scales them up by (cover width / this) and the quote covers the same share of the photo.
export const PREVIEW_WIDTH = 494;
const BOX = 0.84; // the quote box is 84% of the photo's width, like the deck's overlay

/** The deck's text size for a cover, before scaling: 55% of the size slider, never under 14px. */
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
 * Where the quote goes on a cover of width x height. measureAt(px) returns a function that measures a
 * string at that text size. Line height is one text size, like the deck.
 */
export function coverLayout(item, width, height, measureAt) {
  const fontPx = previewFontPx(item) * (width / PREVIEW_WIDTH);
  const boxW = width * BOX;
  const lines = wrapText(item.quote, boxW, measureAt(fontPx));
  const cx = (width * Number(item.horizontalPosition ?? 50)) / 100;
  const cy = (height * Number(item.verticalPosition ?? 50)) / 100;
  const align = ["left", "right"].includes(item.textAlign) ? item.textAlign : "center";
  const x = align === "left" ? cx - boxW / 2 : align === "right" ? cx + boxW / 2 : cx;
  return { fontPx, lines, x, top: cy - (lines.length * fontPx) / 2, lineHeight: fontPx, align, alpha: Number(item.opacity ?? 100) / 100 };
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
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  if (quoteOn && String(item.quote || "").trim()) {
    if (document.fonts?.ready) await document.fonts.ready;
    const family = FONT_CSS[item.textFont] || FONT_CSS.tiktok;
    const fontAt = (px) => `${item.fontWeight || 500} ${px}px ${family}`;
    const L = coverLayout(item, w, h, (px) => { ctx.font = fontAt(px); return (t) => ctx.measureText(t).width; });
    ctx.font = fontAt(L.fontPx);
    ctx.fillStyle = item.textColor || "#FFFFFF";
    ctx.globalAlpha = L.alpha;
    ctx.textAlign = L.align;
    ctx.textBaseline = "middle";
    L.lines.forEach((line, i) => ctx.fillText(line, L.x, L.top + (i + 0.5) * L.lineHeight));
    ctx.globalAlpha = 1;
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the cover image."))), "image/jpeg", 0.92));
}
