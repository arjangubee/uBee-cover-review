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

/**
 * The original's spotifyEmbedUrl: a track or episode link (open.spotify.com, with or without an intl-xx part, or a
 * spotify: URI) becomes https://open.spotify.com/embed/<type>/<id>. Anything else gets no player, so the iframe
 * can only ever load Spotify's own embed.
 */
export function spotifyEmbedUrl(link) {
  const m = String(link ?? "").trim().match(/^(?:https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?|spotify:)(track|episode)[/:]([A-Za-z0-9]{22})(?:[?#][^"'<>\s]*)?$/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}

// ---------- The magnifier (1.7), on the original's zoom state: { scale 1 to 4, x and y: the zoom center in % } ----------
export const ZOOM_MAX = 4;
export const ZOOM_SNAP = 1.08; // the original lets go of anything under 1.08
export const ZOOM_REST = { scale: 1, x: 50, y: 50 };
const pct = (v) => Math.min(100, Math.max(0, v));

/** A pinch or wheel step to a raw scale. Clamped to 1..4; from rest the zoom centers on the pinch point. */
export function zoomTo(z, raw, at) {
  const scale = Math.min(ZOOM_MAX, Math.max(1, raw));
  const fromRest = z.scale <= 1 && at;
  return { scale, x: fromRest ? pct(at.x) : z.x, y: fromRest ? pct(at.y) : z.y, raw };
}

/** When the fingers lift: under 1.08 snaps back to rest, like the original. */
export function zoomSettle(z) {
  return (z.raw ?? z.scale) < ZOOM_SNAP ? { ...ZOOM_REST } : { scale: z.scale, x: z.x, y: z.y };
}

/** One finger or the mouse moves a zoomed photo: its zoom center slides the other way, staying on the photo. */
export function zoomPan(z, dx, dy, w, h) {
  if (z.scale <= 1) return z;
  return { ...z, x: pct(z.x - (dx / (w * (z.scale - 1))) * 100), y: pct(z.y - (dy / (h * (z.scale - 1))) * 100) };
}
