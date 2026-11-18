// Small helpers for the review screen, kept apart from React so they can be checked without a browser.

/** The 9:16 story frame inside a photo, placed where the pan sliders (0 to 100) point. */
export function storyCrop(imgW, imgH, panX = 50, panY = 50) {
  let w = Math.min(imgW, (imgH * 9) / 16);
  let h = (w * 16) / 9;
  if (h > imgH) { h = imgH; w = (h * 9) / 16; }
  const px = Math.min(100, Math.max(0, Number(panX ?? 50))) / 100;
  const py = Math.min(100, Math.max(0, Number(panY ?? 50))) / 100;
  return { x: (imgW - w) * px, y: (imgH - h) * py, w, h };
}

/** A cover's title without its file ending: "IMG_0221.jpeg" reads "IMG_0221". */
export function displayTitle(title) {
  const t = String(title || "").trim();
  if (!t) return "Cover";
  return t.replace(/\.(jpe?g|png|webp|heic|heif|gif|avif|tiff?)$/i, "");
}

/** "Artist - Title" as { artist, title }. A song with no artist is all title. */
export function parseSong(song) {
  const s = String(song || "").trim();
  const at = s.indexOf(" - ");
  if (at < 0) return { artist: "", title: s };
  return { artist: s.slice(0, at).trim(), title: s.slice(at + 3).trim() };
}

/** Ratings are saved 1 to 10; the stars show half of that, rounded. */
export const starsFor = (value) => (value == null ? 0 : Math.max(0, Math.min(5, Math.round(Number(value) / 2))));
export const valueForStars = (stars) => (stars > 0 ? Math.min(10, Math.max(1, Math.round(stars) * 2)) : null);

/** The fields in keys that differ between before and after, as { before, after }; null when none do. */
export function changedFields(before, after, keys) {
  const b = {}, a = {};
  for (const k of keys) {
    if (JSON.stringify(before?.[k] ?? null) === JSON.stringify(after?.[k] ?? null)) continue;
    b[k] = before?.[k] ?? null;
    a[k] = after?.[k] ?? null;
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

const pick = (rand, list) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
const between = (rand, lo, hi) => Math.round(lo + rand() * (hi - lo));

/** Randomize layout: a fresh look from her palette and fonts, kept well inside the photo. */
export function randomLayout(rand, palette, fonts) {
  const usable = fonts.filter((f) => !String(f).startsWith("papyrus"));
  return {
    textColor: pick(rand, palette).hex,
    textFont: pick(rand, usable.length ? usable : fonts),
    fontWeight: pick(rand, [500, 700]),
    textAlign: pick(rand, ["left", "center", "right"]),
    lineCount: pick(rand, [0, 2, 3, 4]),
    fontSize: between(rand, 46, 80),
    horizontalPosition: between(rand, 30, 70),
    verticalPosition: between(rand, 20, 80),
  };
}
