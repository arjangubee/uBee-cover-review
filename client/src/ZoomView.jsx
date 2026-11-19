import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CoverCanvas from "./CoverCanvas.jsx";
import { ZOOM_REST, zoomPan, zoomSettle, zoomTo } from "./reviewMath.js";

// The magnifier (1.7): Arjang's spec, on the original's zoom state ({ scale 1 to 4, x and y: the zoom center in % }).
// The photo flies up from where it sits to fill the view, over a dark, blurred background. Pinch zooms 1 to 4 like
// Apple Photos (a trackpad pinch or ctrl + wheel on a computer), a drag moves a zoomed photo, a double tap zooms in
// or back out, and letting go under 1.08 snaps back to 1. A tap off the photo, or Escape, flies it back to its place.

const FLY_MS = 320;
const TAP = 8; // a press that moves less than this is a tap
const DOUBLE_TAP_MS = 300;
const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

function targetRect(aspect) {
  const hostBar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--host-bar")) || 0;
  const pad = 12; // above and below; edge to edge across, like Apple Photos
  const availW = Math.max(1, window.innerWidth), availH = Math.max(1, window.innerHeight - 2 * pad - hostBar);
  let w = availW, h = w / aspect;
  if (h > availH) { h = availH; w = h * aspect; }
  return { x: (window.innerWidth - w) / 2, y: pad + (availH - h) / 2, w, h };
}
const flip = (from, to) => (from && from.width ? `translate(${from.left - to.x}px, ${from.top - to.y}px) scale(${from.width / to.w}, ${from.height / to.h})` : null);

export default function ZoomView({ item, quoteOn, slideUrl, source, onClose }) {
  const [target] = useState(() => {
    const r = source()?.getBoundingClientRect();
    return targetRect(r && r.height ? r.width / r.height : 4 / 5);
  });
  const [from, setFrom] = useState(() => flip(source()?.getBoundingClientRect(), target));
  const [phase, setPhase] = useState(() => (reducedMotion() ? "open" : "from")); // from | open | closing
  const [zoom, setZoom] = useState(ZOOM_REST);
  const [gesturing, setGesturing] = useState(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const closing = useRef(false);
  const timers = useRef([]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const viewRef = useRef(null);
  const closeRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  useLayoutEffect(() => {
    if (phase !== "from") return undefined;
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setPhase("open")); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    if (closing.current) return;
    closing.current = true;
    if (reducedMotion()) { onCloseRef.current(); return; }
    setZoom(ZOOM_REST);
    setFrom(flip(source()?.getBoundingClientRect(), target));
    setPhase("closing");
    timers.current.push(setTimeout(() => onCloseRef.current(), FLY_MS));
  }
  const closeFn = useRef(close);
  closeFn.current = close;

  // Where a screen point falls on the photo, in % of its unzoomed frame.
  const atPoint = (x, y) => ({ x: ((x - target.x) / target.w) * 100, y: ((y - target.y) / target.h) * 100 });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    // Escape closes the magnifier only: caught first, so an open editor underneath keeps its draft.
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeFn.current(); } };
    window.addEventListener("keydown", onKey, true);
    // A trackpad pinch (or ctrl + wheel) zooms; a plain wheel moves a zoomed photo. The page behind never scrolls.
    const view = viewRef.current;
    let settle = 0;
    const onWheel = (e) => {
      e.preventDefault();
      if (closing.current) return;
      const z = zoomRef.current;
      if (e.ctrlKey) {
        setGesturing(true);
        setZoom(zoomTo(z, (z.raw ?? z.scale) * Math.exp(-e.deltaY * 0.01), atPoint(e.clientX, e.clientY)));
        clearTimeout(settle);
        settle = setTimeout(() => { setGesturing(false); setZoom((cur) => zoomSettle(cur)); }, 220);
      } else if (z.scale > 1) {
        setZoom(zoomPan(z, -e.deltaX, -e.deltaY, target.w, target.h));
      }
    };
    view?.addEventListener("wheel", onWheel, { passive: false });
    const pending = timers.current;
    return () => {
      window.removeEventListener("keydown", onKey, true);
      view?.removeEventListener("wheel", onWheel);
      clearTimeout(settle);
      pending.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Fingers and the mouse ----------
  function onPointerDown(e) {
    if (closing.current || e.target.closest("button")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current = { kind: "press", x0: e.clientX, y0: e.clientY, last: { x: e.clientX, y: e.clientY }, moved: false, offPhoto: e.target === e.currentTarget };
    } else if (pts.length === 2) {
      const [p, q] = pts;
      gesture.current = { kind: "pinch", d0: Math.hypot(q.x - p.x, q.y - p.y) || 1, z0: zoomRef.current, at: atPoint((p.x + q.x) / 2, (p.y + q.y) / 2) };
      setGesturing(true);
    }
  }
  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()];
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      setZoom(zoomTo(g.z0, g.z0.scale * (d / g.d0), g.at));
    } else if (g.kind === "press") {
      if (Math.abs(e.clientX - g.x0) > TAP || Math.abs(e.clientY - g.y0) > TAP) g.moved = true;
      if (g.moved && zoomRef.current.scale > 1) {
        setGesturing(true);
        setZoom((z) => zoomPan(z, e.clientX - g.last.x, e.clientY - g.last.y, target.w, target.h));
      }
      g.last = { x: e.clientX, y: e.clientY };
    }
  }
  function onPointerUp(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) {
        setGesturing(false);
        setZoom((z) => zoomSettle(z));
        gesture.current = pointers.current.size === 1 ? { kind: "after" } : null; // the last finger lifting is not a tap
      }
      return;
    }
    if (pointers.current.size) return;
    gesture.current = null;
    setGesturing(false);
    if (g.kind !== "press" || g.moved || e.type === "pointercancel") return;
    if (g.offPhoto) { closeFn.current(); return; } // a tap on the dark background flies the photo back
    const now = Date.now(), prev = lastTap.current;
    if (now - prev.t < DOUBLE_TAP_MS && Math.abs(prev.x - e.clientX) < 30 && Math.abs(prev.y - e.clientY) < 30) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      setZoom((z) => (z.scale > 1 ? { ...ZOOM_REST } : zoomSettle(zoomTo(z, 2.5, atPoint(e.clientX, e.clientY)))));
    } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  }

  const scaleLabel = String(Math.round(zoom.scale * 100) / 100);
  return (
    <div ref={viewRef} className={`zoomView ${phase}`} role="dialog" aria-modal="true" aria-label="Zoomed photo"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <button type="button" ref={closeRef} className="zoomClose" onClick={close}>Close the zoomed photo</button>
      <div className="zoomFrame" style={{ left: target.x, top: target.y, width: target.w, height: target.h, transform: phase === "open" ? "none" : from || "none" }}>
        <div className={gesturing ? "zoomLayer gesturing" : "zoomLayer"} data-scale={scaleLabel}
          style={{ transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.x}% ${zoom.y}%` }}>
          {slideUrl ? <img src={slideUrl} alt="" draggable={false} />
            : <CoverCanvas item={item} quoteOn={quoteOn} maxW={target.w} maxH={target.h} detail={4} />}
        </div>
      </div>
      {zoom.scale > 1 && phase === "open" && (
        <button type="button" className="zoomReset" onClick={() => setZoom({ ...ZOOM_REST })}>Reset zoom</button>
      )}
    </div>
  );
}
