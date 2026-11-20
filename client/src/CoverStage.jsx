import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CoverCanvas from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";
import { safeZoneFor, textHitBoxes } from "./renderCover.js";
import { lockAxis, startAxis } from "./safeLock.js";

// The stage: a 4:5 frame like a post. The cover is slide one; her slides follow in a strip she swipes
// through, like Instagram. While she edits, only the cover shows: tap a text box to pick it, drag it to
// move it, and the Face mosaic boxes can be dragged and resized right on the photo.

const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
const TAP = 8; // a press that moves less than this many pixels is a tap
const FREE = 3; // a drag past this many pixels lets the box leave the safe rectangle for this session (1.13.8)

export default function CoverStage({
  item, quoteOn, slides, slide, setSlide, story, editing, activeBox, onStartEdit, onSelectBox, onMoveBox,
  pickMode, onPick, onMosaicsChange, burst = 0, onDrawn, onZoom, zoomRef, onTapOff, free = null, onFree,
}) {
  const [showBurst, setShowBurst] = useState(false);
  useEffect(() => {
    if (!burst) return undefined;
    setShowBurst(true);
    const t = setTimeout(() => setShowBurst(false), 800);
    return () => clearTimeout(t);
  }, [burst]);
  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const canvasRef = useRef(null);
  const [stageW, setStageW] = useState(390);
  const total = 1 + slides.length;
  const single = editing || story || total === 1;
  // The deck holds each text box inside the safe rectangle until she drags it (1.13.8); the story view never does.
  const safe = !story;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    setStageW(el.clientWidth || 390);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width) setStageW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stageH = Math.round((stageW * 5) / 4);
  const slideW = stageW; // every slide pages full width, like a carousel post

  // Steppers and keys move the strip; a swipe moves it natively and reports where it landed.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || single) return;
    const target = track.children[slide];
    if (target) track.scrollTo({ left: target.offsetLeft - (track.clientWidth - target.clientWidth) / 2, behavior: "smooth" });
  }, [slide, single, total]);
  // Only where the strip comes to rest counts, so a scroll on its way somewhere never moves the counter.
  const settle = useRef(null);
  useEffect(() => () => clearTimeout(settle.current), []);
  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const track = trackRef.current;
      if (!track) return;
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0, dist = Infinity;
      [...track.children].forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
      setSlide((cur) => (cur === best ? cur : best));
    }, 140);
  }

  // Pointer work on the cover: tap to edit, drag the picked box, pick a color.
  const press = useRef(null);
  const boxesAt = (cssW, cssH) => (measureCtx ? textHitBoxes(item, cssW, cssH, measureCtx, quoteOn, { safe, free }) : []);
  function hitAt(x, y, cssW, cssH) {
    if (!measureCtx) return null;
    const boxes = boxesAt(cssW, cssH);
    const pad = 10;
    const hit = boxes.reverse().find((b) => x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad);
    return hit ? hit.index : null;
  }
  const pointer = (cssW, cssH) => ({
    onPointerDown(e) {
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = hitAt(x, y, cssW, cssH);
      press.current = { x0: e.clientX, y0: e.clientY, x, y, hit, moved: false, drag: editing && !pickMode && hit != null && hit === activeBox };
      if (press.current.drag) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        // The safe edges catch the block only when its edge crosses one (1.13.8, the original's crossing locks): the
        // block's own half extents, from where it is now; an edge within 1.5px of a safe edge starts caught.
        const b = boxesAt(cssW, cssH).find((bx) => bx.index === activeBox);
        if (b) {
          const z = safeZoneFor(cssW, cssH);
          Object.assign(press.current, { zone: z, halfW: b.halfW, halfH: b.halfH,
            lockX: startAxis(b.centerX, b.halfW, z.left, z.right), lockY: startAxis(b.centerY, b.halfH, z.top, z.bottom) });
        }
      }
    },
    onPointerMove(e) {
      const p = press.current;
      if (!p) return;
      if (Math.abs(e.clientX - p.x0) > TAP || Math.abs(e.clientY - p.y0) > TAP) p.moved = true;
      if (!p.drag) return;
      if (!p.freed && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > FREE) { p.freed = true; onFree?.(activeBox); }
      const r = e.currentTarget.getBoundingClientRect();
      let x = e.clientX - r.left, y = e.clientY - r.top;
      if (p.zone) {
        const ax = lockAxis(p.lockX, x, p.halfW, p.zone.left, p.zone.right), ay = lockAxis(p.lockY, y, p.halfH, p.zone.top, p.zone.bottom);
        p.lockX = ax.state; p.lockY = ay.state;
        x = ax.center; y = ay.center;
      }
      const h = Math.min(100, Math.max(0, (x / r.width) * 100));
      const v = Math.min(100, Math.max(0, (y / r.height) * 100));
      onMoveBox(activeBox, Math.round(h), Math.round(v));
    },
    onPointerUp() {
      const p = press.current;
      press.current = null;
      if (!p || p.moved) return;
      if (pickMode) return sampleColor(p.x, p.y, cssW);
      if (p.hit == null) return;
      if (editing) onSelectBox(p.hit);
      else onStartEdit(p.hit);
    },
    onPointerCancel() { press.current = null; },
  });

  function sampleColor(x, y, cssW) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = canvas.width / cssW;
    try {
      const [r, g, b] = canvas.getContext("2d").getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
      onPick(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase());
    } catch {
      onPick(null);
    }
  }

  // The magnifier (1.7) flies up whatever she's looking at: the cover, or a photo slide.
  const shownSlide = !single && slide > 0 ? slides[slide - 1] : null;
  const zoomable = Boolean(onZoom) && !story && shownSlide?.mediaType !== "video";
  const zoomSource = () => stageRef.current?.querySelector(single ? ".coverCanvas" : ".slideItem.current .coverCanvas, .slideItem.current img") || null;
  // Its button is in the action row now (1.14.1, Arjang #790 item 2): it opens the zoom through zoomRef.
  useLayoutEffect(() => {
    if (!zoomRef) return undefined;
    zoomRef.current = zoomable ? () => { if (zoomSource()) onZoom({ source: zoomSource, slideUrl: shownSlide?.mediaUrl || null }); } : null;
    return () => { zoomRef.current = null; };
  });

  const cover = (maxW, maxH, extra = {}) => (
    <CoverCanvas item={item} quoteOn={quoteOn} maxW={maxW} maxH={maxH} story={story} safe={safe} free={free} canvasRef={canvasRef} onDrawn={onDrawn}
      className={[editing && "editing", pickMode && "picking"].filter(Boolean).join(" ")} {...extra}>
      {({ cssW, cssH }) => (
        <>
          <div className="hitLayer" style={{ touchAction: editing ? "none" : "auto" }} {...pointer(cssW, cssH)} />
          {editing && (item.imageEdit?.mosaics || []).map((m, i) => (
            <MosaicBox key={i} m={m} cssW={cssW} cssH={cssH}
              onChange={(next) => onMosaicsChange((item.imageEdit.mosaics || []).map((x, j) => (j === i ? next : x)))}
              onRemove={() => onMosaicsChange((item.imageEdit.mosaics || []).filter((_, j) => j !== i))} />
          ))}
        </>
      )}
    </CoverCanvas>
  );

  return (
    <div className="stage" ref={stageRef} style={{ height: stageH }}
      onClick={(e) => { if (editing && (e.target === e.currentTarget || e.target.classList.contains("stageSingle"))) onTapOff?.(); }}>
      {total > 1 && !single && <span className="slideCount" aria-live="polite">{slide + 1}/{total}</span>}
      {single ? (
        <div className="stageSingle">{cover(stageW, stageH)}</div>
      ) : (
        <div className="track" ref={trackRef} onScroll={onScroll} aria-label="Slides" role="group">
          <div className={slide === 0 ? "slideItem current" : "slideItem"} style={{ width: slideW }}>{cover(slideW, stageH)}</div>
          {slides.map((s, i) => (
            <div key={`${s.mediaUrl}-${i}`} className={slide === i + 1 ? "slideItem current" : "slideItem"} style={{ width: slideW }}>
              {s.mediaType === "video"
                ? <video src={s.mediaUrl} muted playsInline controls preload="metadata" aria-label={`Slide ${i + 2}`} />
                : <img src={s.mediaUrl} alt={`Slide ${i + 2}`} draggable={false} />}
            </div>
          ))}
        </div>
      )}
      {pickMode && <p className="pickHint" role="status">Tap the photo to pick a color</p>}
      {showBurst && <span key={burst} className="likeBurst" aria-hidden="true"><Icon name="heart" size={110} filled /></span>}
    </div>
  );
}

/** A Face mosaic box: drag to move, drag the corner to resize, the x removes it. Values are % of the photo. */
function MosaicBox({ m, cssW, cssH, onChange, onRemove }) {
  const start = useRef(null);
  const begin = (mode) => (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { mode, x: e.clientX, y: e.clientY, m };
  };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const dx = ((e.clientX - s.x) / cssW) * 100, dy = ((e.clientY - s.y) / cssH) * 100;
    const r = (v) => Math.round(v * 10) / 10;
    if (s.mode === "move") onChange({ ...s.m, x: r(Math.min(100 - s.m.w, Math.max(0, s.m.x + dx))), y: r(Math.min(100 - s.m.h, Math.max(0, s.m.y + dy))) });
    else onChange({ ...s.m, w: r(Math.min(100 - s.m.x, Math.max(4, s.m.w + dx))), h: r(Math.min(100 - s.m.y, Math.max(4, s.m.h + dy))) });
  };
  const end = () => { start.current = null; };
  return (
    <div className="mosaicBox" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}
      onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <button type="button" className="mosaicX" aria-label="Remove this mosaic" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}><Icon name="close" size={14} /></button>
      <span className="mosaicHandle" aria-hidden="true" onPointerDown={begin("size")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </div>
  );
}
