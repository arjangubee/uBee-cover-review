import { useEffect, useRef, useState } from "react";
import { drawCover, ensureFonts } from "./renderCover.js";
import { storyCrop } from "./reviewMath.js";

// The cover on screen. It is drawn by drawCover, the same function that makes the posted JPEG, so the
// text wraps, sizes and sits exactly where it will post.

const images = new Map(); // photo address -> Promise of a loaded <img>, so going back and forth is instant

/** The photo from this app's own address, so the canvas can always read and export it. */
export const imageUrlFor = (item) => `/api/items/${item.id}/image?v=${encodeURIComponent(String(item.imageUrl || "").slice(-80))}`;

export function loadImage(url) {
  if (!images.has(url)) {
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The photo didn't load."));
      img.src = url;
    });
    images.set(url, p);
    p.catch(() => images.delete(url));
    if (images.size > 40) images.delete(images.keys().next().value);
  }
  return images.get(url);
}

/** The cover fit inside maxW x maxH. children({ cssW, cssH }) draws overlays on top, in CSS pixels. */
export default function CoverCanvas({ item, quoteOn, maxW, maxH, story = false, canvasRef, children, className = "", ...rest }) {
  const ref = useRef(null);
  const base = useRef({ key: "", canvas: null });
  const [img, setImg] = useState(null);
  const [failed, setFailed] = useState(false);
  const [, setFontsReady] = useState(0);
  const url = imageUrlFor(item);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    loadImage(url).then((i) => { if (alive) setImg(i); }).catch(() => { if (alive) { setImg(null); setFailed(true); } });
    return () => { alive = false; };
  }, [url]);

  const fontKey = JSON.stringify([quoteOn, item.textFont, item.fontWeight, (item.extraTexts || []).map((b) => [b.textFont, b.fontWeight])]);
  useEffect(() => {
    let alive = true;
    ensureFonts(item, quoteOn).then(() => { if (alive) setFontsReady((n) => n + 1); });
    return () => { alive = false; };
  }, [fontKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const natural = img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  const aspect = story ? 9 / 16 : natural ? natural.w / natural.h : 4 / 5;
  let cssW = Math.max(1, maxW), cssH = cssW / aspect;
  if (cssH > maxH) { cssH = Math.max(1, maxH); cssW = cssH * aspect; }

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !img) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const src = story ? storyCrop(natural.w, natural.h, item.storyPanX, item.storyPanY) : null;
    const edit = item.imageEdit || {};
    // The photo with its contrast and mosaic is drawn once per change; text redraws on top of it.
    const key = [img.src, W, H, edit.contrast || "normal", JSON.stringify(edit.mosaics || []), src ? [src.x, src.y, src.w, src.h].join(",") : ""].join("|");
    if (base.current.key !== key) {
      const layer = base.current.canvas || document.createElement("canvas");
      layer.width = W;
      layer.height = H;
      drawCover(layer.getContext("2d"), { ...item, extraTexts: [] }, img, W, H, { quoteOn: false, src });
      base.current = { key, canvas: layer };
    }
    drawCover(canvas.getContext("2d"), { ...item, imageEdit: null }, base.current.canvas, W, H, { quoteOn });
  });

  const setRef = (el) => { ref.current = el; if (canvasRef) canvasRef.current = el; };
  const label = [item.title, quoteOn && item.quote ? `Quote: ${item.quote}` : "", ...(item.extraTexts || []).map((b) => b.quote)].filter(Boolean).join(". ");
  return (
    <div className={`coverWrap ${className}`} style={{ width: cssW, height: cssH }} {...rest}>
      {failed ? (
        <div className="coverMissing" role="img" aria-label="The photo didn't load">The photo didn't load. Ask your Muse to import it again.</div>
      ) : (
        <canvas ref={setRef} className="coverCanvas" role="img" aria-label={label || "Cover"} />
      )}
      {!failed && img && children?.({ cssW, cssH, natural })}
    </div>
  );
}
