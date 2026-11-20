import { useEffect, useState } from "react";

// The artwork's own color, darkened for backgrounds, the way Spotify tints the player and the
// lyrics card. Apple's artwork allows cross-origin reads; anything else falls back to surface gray.
const cache = new Map();
const FALLBACK = "#2c2c2e";

function tint(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 12;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, 12, 12);
        const px = g.getImageData(0, 0, 12, 12).data;
        let r = 0, gr = 0, b = 0, w = 0;
        for (let i = 0; i < px.length; i += 4) {
          const max = Math.max(px[i], px[i + 1], px[i + 2]);
          const min = Math.min(px[i], px[i + 1], px[i + 2]);
          const sat = max ? (max - min) / max : 0;
          const weight = 0.15 + sat;               // colorful pixels speak louder than gray ones
          r += px[i] * weight; gr += px[i + 1] * weight; b += px[i + 2] * weight; w += weight;
        }
        const k = 92 / Math.max(1, Math.max(r / w, gr / w, b / w)); // brightest channel lands near 92 of 255
        resolve(`rgb(${Math.round((r / w) * k)}, ${Math.round((gr / w) * k)}, ${Math.round((b / w) * k)})`);
      } catch { resolve(FALLBACK); }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = url;
  });
}

export function useArtColor(url) {
  const [color, setColor] = useState(() => cache.get(url) || FALLBACK);
  useEffect(() => {
    if (!url) { setColor(FALLBACK); return; }
    if (cache.has(url)) { setColor(cache.get(url)); return; }
    let live = true;
    tint(url).then((c) => { cache.set(url, c); if (live) setColor(c); });
    return () => { live = false; };
  }, [url]);
  return color;
}
