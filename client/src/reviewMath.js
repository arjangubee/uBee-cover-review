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

/** A photo's named ratio (1.29.0, Quill #1212), by the original's aspectProfileForImage thresholds: 9:16 up to 0.62, 3:4
 * under 0.775, 4:5 up to 0.9, 1:1 up to 1. A landscape photo reads as the nearest of 4:3, 3:2, 16:9 and 21:9. */
export function aspectLabel(w, h) {
  if (!(w > 0 && h > 0)) return "";
  const r = w / h;
  if (r <= 0.62) return "9:16";
  if (r < 0.775) return "3:4";
  if (r <= 0.9) return "4:5";
  if (r <= 1) return "1:1";
  return [["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9], ["21:9", 21 / 9]]
    .reduce((b, n) => (Math.abs(Math.log(n[1] / r)) < Math.abs(Math.log(b[1] / r)) ? n : b))[0];
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


/** Randomize layout: a fresh look from her palette and fonts, kept well inside the photo. */
// Randomize layout (1.8): the original's createRandomizedEditorialDraft. Six layouts at even odds, each value drawn
// with its randomInt (rounded, both ends included). It sets layout only: align, size, Lines and position, never the
// color, the font or the weight. renderCover.js's randomizeLayout keeps the result inside the safe zone.
export const RANDOM_LAYOUTS = [
  { name: "centered hero", textAlign: "center", x: [46, 54], y: [32, 70], fontSize: [38, 82], lines: [2, 4] },
  { name: "left pillar", textAlign: "left", x: [27, 39], y: [24, 76], fontSize: [18, 48], lines: [3, 6] },
  { name: "right pillar", textAlign: "right", x: [61, 73], y: [24, 76], fontSize: [16, 44], lines: [3, 7] },
  { name: "justified center", textAlign: "justify", justify: true, x: [49, 51], y: [30, 70], fontSize: [24, 60], lines: [2, 4] },
  { name: "small left column", textAlign: "left", x: [31, 45], y: [18, 82], fontSize: [10, 28], lines: [4, 8] },
  { name: "monoline", textAlign: "center", x: [46, 54], y: [38, 62], fontSize: [28, 56], lines: [1, 1] },
];
const randomInt = (rand, lo, hi) => Math.round(lo + rand() * (hi - lo));

/** One draw from the original's six layouts (or the one given). Lines never asks for more rows than the words allow. */
export function randomEditorialLayout(rand, quote, layout = RANDOM_LAYOUTS[Math.min(RANDOM_LAYOUTS.length - 1, Math.floor(rand() * RANDOM_LAYOUTS.length))]) {
  const words = String(quote || "").split(/\s+/).filter(Boolean).length;
  const possible = layout.justify ? Math.min(8, Math.max(1, Math.floor(words / 2))) : Math.min(8, words);
  const low = Math.min(layout.lines[0], possible);
  const high = Math.max(low, Math.min(layout.lines[1], possible));
  return {
    textAlign: layout.textAlign,
    fontSize: randomInt(rand, ...layout.fontSize),
    lineCount: words ? randomInt(rand, low, high) : 0,
    horizontalPosition: randomInt(rand, ...layout.x),
    verticalPosition: randomInt(rand, ...layout.y),
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

/** The Drive file a photo came from, as a link that opens it (1.24.0, Arjang #1106). Null with no Drive id. */
export function driveLinkFor(item) {
  return item?.source === "drive" && item.driveId ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveId)}/view` : null;
}

/**
 * Why it matches, the compose check's 4th check (1.25.0, Arjang #1100, Quill #1102): the logic of the match in her
 * Muse's words. No reason, or a few words, is incomplete. Answers what's wrong, or null when it's written.
 */
export const WHY_WORDS_MIN = 6;
export function whyProblem(why) {
  const text = String(why?.text ?? "").trim();
  if (!text) return "No reason written yet";
  if (text.split(/\s+/).length < WHY_WORDS_MIN) return "Too short to say why: the photo, the quote and the song's link";
  return null;
}
/** A cover passes its compose check only with all four: the steps (quote, song, image) and Why it matches. */
export const composePasses = (beacons) => Boolean(beacons?.STEPS_VERIFIED && beacons?.WHY_WRITTEN);
