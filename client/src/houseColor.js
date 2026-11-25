// Each cover's own color (1.26.0, Arjang #1092 and #1138, Quill #1098 and #1140). The queue lock is gone: a cover's
// color is its own, picked once from the 11-color house palette against the photo behind its text, the way the
// original picks: luminance contrast first, hue contrast second, and about 70% of covers in yellow, cream or white, the
// rest across the palette. The Random button picks a truly random hue from the wheel, lit to read on the photo.

export const HOUSE = ["#FAFFB4", "#D7E310", "#FFFFFF", "#1ED760", "#FBFA38", "#B8FFFF", "#FB0909", "#000000", "#FFB8CF", "#92AFFF", "#FE0956"];
const WARM_LIGHT = ["#FBFA38", "#FAFFB4", "#FFFFFF"]; // yellow, cream, white

export function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** The contrast ratio of a hex color on a tone ({ r, g, b }), 1 to 21. */
export function contrastOf(hex, tone) {
  const a = luminance(hexToRgb(hex)), b = luminance(tone);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function hueOf({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 12) return null; // grey: no hue to stand against
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a, b) => (a == null || b == null ? 90 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)));

/** A steady number in [0, 1) for a cover id, so a cover keeps its pick when the pass meets it again. */
export function seeded(n) {
  let x = (Math.imul(Number(n) || 1, 2654435761) >>> 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** pickHouseColor(tone, seed): the house color for text on a photo whose tone behind the text is { r, g, b }. */
export function pickHouseColor(tone, seed = Math.random()) {
  const scored = HOUSE.map((hex) => ({ hex, contrast: contrastOf(hex, tone), gap: hueGap(hueOf(hexToRgb(hex)), hueOf(tone)) }));
  const readable = scored.filter((s) => s.contrast >= 3);
  const pool = readable.length ? readable : [...scored].sort((a, b) => b.contrast - a.contrast).slice(0, 1);
  const warm = pool.filter((s) => WARM_LIGHT.includes(s.hex)), rest = pool.filter((s) => !WARM_LIGHT.includes(s.hex));
  const from = warm.length && (seed < 0.7 || !rest.length) ? warm : rest.length ? rest : warm;
  from.sort((a, b) => b.contrast - a.contrast || b.gap - a.gap); // luminance contrast first, hue contrast second
  const top = from.slice(0, 3); // the best few, so the queue isn't one color
  return top[Math.floor(((seed * 7919) % 1) * top.length)].hex;
}

export function hsvToHex(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#FFFFFF");
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  return { h: hueOf({ r, g, b }) ?? 0, s: max ? d / max : 0, v: max / 255 };
}

/** randomWheelColor(tone): a truly random hue from the wheel, its brightness set so it reads on the photo. */
export function randomWheelColor(tone, rand = Math.random) {
  const h = rand() * 360, s = 0.55 + rand() * 0.45, dark = luminance(tone) > 0.3;
  for (let i = 0; i < 16; i++) {
    const hex = hsvToHex(h, dark ? s : s * (0.35 + rand() * 0.65), dark ? 0.12 + rand() * 0.33 : 0.85 + rand() * 0.15);
    if (contrastOf(hex, tone) >= 3) return hex;
  }
  return contrastOf("#FFFFFF", tone) >= contrastOf("#000000", tone) ? "#FFFFFF" : "#000000";
}

/** The photo's tone in the band the text sits in, read from an image URL: { r, g, b }, or null when it can't be read. */
export async function photoTone(url, box) {
  if (!url || typeof Image === "undefined") return null;
  const img = await new Promise((done) => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = url; });
  if (!img || !img.naturalWidth) return null;
  try {
    const w = 96, h = Math.max(1, Math.round((96 * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const v = Math.min(100, Math.max(0, Number(box?.verticalPosition ?? 50))) / 100;
    const y0 = Math.max(0, Math.round(h * (v - 0.15))), y1 = Math.min(h, Math.max(y0 + 1, Math.round(h * (v + 0.15))));
    const d = ctx.getImageData(Math.round(w * 0.08), y0, Math.round(w * 0.84), y1 - y0).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1; }
    return n ? { r: r / n, g: g / n, b: b / n } : null;
  } catch {
    return null; // a photo from another site that won't share its pixels
  }
}
