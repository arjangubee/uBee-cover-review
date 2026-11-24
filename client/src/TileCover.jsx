import { useEffect, useRef, useState } from "react";
import { drawCover, ensureFonts, textBoxes } from "./renderCover.js";

// A grid preview (1.20.0, Big Edit item 19): the photo as a plain image, and with the text overlay on, the cover's text
// drawn over it the way the cover draws it, on the whole photo as the 4:5 tile crops it. The text is drawn only once the
// tile is near the screen, so a long queue stays light on a phone.
const TILE = 4 / 5;

export default function TileCover({ item, quoteOn }) {
  const [natural, setNatural] = useState(null);
  const [near, setNear] = useState(false);
  const img = useRef(null);
  const canvas = useRef(null);
  const hasText = textBoxes(item, quoteOn).length > 0;

  useEffect(() => {
    const el = img.current?.parentElement;
    if (!el || near || !hasText) return undefined;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return undefined; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near, hasText]);

  // The photo fills the tile like object-fit: cover, so the text covers the whole photo, overflowing the tile the same way.
  const a = natural ? natural.w / natural.h : TILE;
  const wPct = a > TILE ? (a / TILE) * 100 : 100, hPct = a > TILE ? 100 : (TILE / a) * 100;
  useEffect(() => {
    const c = canvas.current, tile = img.current?.parentElement;
    if (!c || !tile || !near) return undefined;
    let alive = true;
    ensureFonts(item, quoteOn).then(() => {
      if (!alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = (tile.clientWidth * wPct) / 100, h = (tile.clientHeight * hPct) / 100;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      drawCover(c.getContext("2d"), { ...item, imageEdit: null }, null, c.width, c.height, { quoteOn, safe: true });
    });
    return () => { alive = false; };
  });

  return (
    <>
      <img ref={img} src={item.imageUrl} alt="" loading="lazy" draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })} />
      {hasText && near && natural && (
        <canvas ref={canvas} className="tileText" aria-hidden="true"
          style={{ width: `${wPct}%`, height: `${hPct}%`, left: `${(100 - wPct) / 2}%`, top: `${(100 - hPct) / 2}%` }} />
      )}
    </>
  );
}
