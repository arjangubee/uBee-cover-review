import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CoverCanvas from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";
import { rewrapWidth, safeZoneFor, textHitBoxes } from "./renderCover.js";
import { lockAxis, startAxis } from "./safeLock.js";
import { GUIDE_IDS, SNAP_PX, guidesFor, snap, snapGuidesOn } from "./snapGuides.js";

// The stage: a 4:5 frame like a post. The cover is slide one; her slides follow in a strip she swipes
// through, like Instagram. While she edits, only the photo she's editing shows (the cover, or since 1.20.0 the carousel
// photo she was on): tap a text box to pick it, drag it to move it, and on the cover the Face mosaic boxes can be
// dragged and resized right on the photo. On a computer, a click on the photo away from the text closes the editor.

const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
const TAP = 8; // a press that moves less than this many pixels is a tap
const FREE = 3; // a drag past this many pixels lets the box leave the safe rectangle for this session (1.13.8)
const HOLD_MS = 320; // a press held this long on a text box lifts it for placing (1.20.0, Big Edit item 9)

export default function CoverStage({
  item, quoteOn, slides, slide, setSlide, story, editing, editSlide = null, activeBox, onStartEdit, onSelectBox, onMoveBox,
  pickMode, onPick, onMosaicsChange, burst = 0, onDrawn, onZoom, zoomRef, onTapOff, free = null, onFree, onMoveText, onDropText,
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

  // Pointer work on a photo, the cover or a carousel photo (slideAt): tap to edit, drag a box, pick a color, and outside
  // the editor hold a box to lift it and place it (1.20.0, Big Edit item 9).
  const press = useRef(null);
  const [lift, setLift] = useState(null); // the box held up for placing: { index, slideAt }
  useEffect(() => () => clearTimeout(press.current?.timer), []);
  // Snap guides (1.24.0, Arjang #1083): the line(s) the dragged text sits on, { slideAt, x, y }, or null.
  const [guide, setGuide] = useState(null);
  const snapPos = useRef({ x: 0, y: 0 }).current, snapOut = useRef({}).current;
  useEffect(() => {
    const off = () => { if (document.hidden) { setGuide(null); if (press.current) press.current.gx = press.current.gy = null; } };
    document.addEventListener("visibilitychange", off);
    return () => document.removeEventListener("visibilitychange", off);
  }, []);
  // While a box is lifted, her finger places it and the page never scrolls under it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const hold = (e) => {
      if (press.current) press.current.multi = e.touches.length > 1; // a two-finger drag doesn't snap
      if (press.current?.lifted && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, []);
  const boxesAt = (cssW, cssH, slideAt) => (measureCtx ? textHitBoxes(item, cssW, cssH, measureCtx, quoteOn, { safe, free, slideAt }) : []);
  function hitAt(x, y, cssW, cssH, slideAt) {
    if (!measureCtx) return null;
    const boxes = boxesAt(cssW, cssH, slideAt);
    const pad = 10;
    const hit = boxes.reverse().find((b) => x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad);
    return hit ? hit.index : null;
  }
  // The safe edges catch a dragged block only when its edge crosses one (1.13.8, the original's crossing locks): the
  // block's own half extents, from where it is now; an edge within 1.5px of a safe edge starts caught.
  function grab(p, cssW, cssH, slideAt) {
    const b = boxesAt(cssW, cssH, slideAt).find((bx) => bx.index === p.hit);
    if (!b) return;
    const z = safeZoneFor(cssW, cssH);
    Object.assign(p, { zone: z, halfW: b.halfW, halfH: b.halfH,
      lockX: startAxis(b.centerX, b.halfW, z.left, z.right), lockY: startAxis(b.centerY, b.halfH, z.top, z.bottom),
      snapOn: snapGuidesOn(), guides: null, gx: null, gy: null, slideAt, cssW, cssH,
      w0: cssW > cssH ? b.textWidth : null, w: null }); // a landscape box re-wraps narrower to follow a drag (1.27.0)
  }
  const pointer = (cssW, cssH, slideAt = null) => ({
    onPointerDown(e) {
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = hitAt(x, y, cssW, cssH, slideAt);
      // In the editor a press on any text box picks it and drags it at once (1.20.0, Big Edit item 9).
      const p = { x0: e.clientX, y0: e.clientY, x, y, hit, moved: false, mouse: e.pointerType === "mouse", drag: editing && !pickMode && hit != null, lifted: false };
      press.current = p;
      if (p.drag) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (hit !== activeBox) onSelectBox(hit);
        grab(p, cssW, cssH, slideAt);
      } else if (!editing && hit != null && onMoveText) {
        // Outside the editor a held box lifts: her thumb places it and letting go saves the spot. A tap still opens the editor.
        const el = e.currentTarget, id = e.pointerId;
        p.timer = setTimeout(() => {
          if (press.current !== p || p.moved) return;
          p.lifted = true;
          p.drag = true;
          try { el.setPointerCapture?.(id); } catch { /* the pointer may be gone already */ }
          grab(p, cssW, cssH, slideAt);
          navigator.vibrate?.(10);
          setLift({ index: hit, slideAt });
        }, HOLD_MS);
      }
    },
    onPointerMove(e) {
      const p = press.current;
      if (!p) return;
      if (Math.abs(e.clientX - p.x0) > TAP || Math.abs(e.clientY - p.y0) > TAP) { p.moved = true; if (!p.lifted) clearTimeout(p.timer); }
      if (!p.drag) return;
      if (!p.freed && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > FREE) { p.freed = true; onFree?.(p.hit); }
      const r = e.currentTarget.getBoundingClientRect();
      let x = e.clientX - r.left, y = e.clientY - r.top;
      // Snap guides, in screen px so they hold at any size and zoom. Alt/Option or a second finger lets the text go free.
      let gx = null, gy = null;
      if (p.snapOn && p.halfW != null && !e.altKey && !p.multi) {
        if (!p.guides) {
          p.guides = guidesFor(r.width, r.height);
          p.bounds = { halfW: (p.halfW * r.width) / p.cssW, halfH: (p.halfH * r.height) / p.cssH };
        }
        snapPos.x = x; snapPos.y = y;
        snap(snapPos, p.bounds, p.guides, SNAP_PX, snapOut);
        x = snapOut.x; y = snapOut.y; gx = snapOut.xGuide; gy = snapOut.yGuide;
      }
      // A landscape drag past where the block's edge meets the photo's edge re-wraps it narrower instead of stopping
      // (1.27.0, Quill #1145), down to 38%, so the center keeps following her. The block always stays on the photo.
      let halfW = p.halfW;
      if (p.zone && p.w0) {
        p.w = rewrapWidth(x, p.halfW, p.w0, p.zone.left, p.zone.right);
        if (p.w != null) halfW = (p.halfW * p.w) / p.w0;
      }
      if (p.zone) {
        const ax = lockAxis(p.lockX, x, halfW, p.zone.left, p.zone.right), ay = lockAxis(p.lockY, y, p.halfH, p.zone.top, p.zone.bottom);
        p.lockX = ax.state; p.lockY = ay.state;
        if (ax.center !== x) gx = null; // a safe edge held it off the line: no line shows
        if (ay.center !== y) gy = null;
        x = ax.center; y = ay.center;
      }
      if (gx !== p.gx || gy !== p.gy) {
        if (!p.mouse && ((gx && gx !== p.gx) || (gy && gy !== p.gy))) navigator.vibrate?.(8); // one light tick per snap
        p.gx = gx; p.gy = gy;
        setGuide(gx || gy ? { slideAt, x: gx ? gx.id : null, y: gy ? gy.id : null } : null);
      }
      const h = Math.min(100, Math.max(0, (x / r.width) * 100));
      const v = Math.min(100, Math.max(0, (y / r.height) * 100));
      const hx = gx ? Math.round(h * 1000) / 1000 : Math.round(h), vy = gy ? Math.round(v * 1000) / 1000 : Math.round(v);
      // Back toward the middle in the same drag, the box widens again, never past the width it started this drag with.
      const w = p.w0 ? (p.w ?? p.w0) : null;
      if (!p.lifted) onMoveBox(p.hit, hx, vy, w);
      else if (p.moved) { p.placed = true; onMoveText(p.hit, hx, vy, slideAt, w); } // past a tap's wiggle
    },
    onPointerUp() {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.gx || p.gy) setGuide(null);
      if (p.lifted) setLift(null);
      if (p.placed) { onDropText?.(); return; } // placed: the editor stays closed
      if (p.moved) return; // a lift let go without moving is still a tap (1.13.6): it opens the editor
      if (pickMode) return sampleColor(p.x, p.y, cssW);
      // A click away from the text closes the editor on a computer (1.20.0, Big Edit item 3). A tap on a phone doesn't:
      // there her thumb often lands just off the text while she works.
      if (p.hit == null) { if (editing && p.mouse) onTapOff?.(); return; }
      if (editing) onSelectBox(p.hit);
      else onStartEdit(p.hit, slideAt);
    },
    onPointerCancel() {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.gx || p.gy) setGuide(null);
      if (p.lifted) setLift(null);
      if (p.placed) onDropText?.(); // it stays where she had it
    },
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

  // The magnifier (1.7) flies up whatever she's looking at: the cover, or a photo slide with its own text (1.20.0).
  const shownSlide = !single && slide > 0 ? slides[slide - 1] : null;
  const zoomable = Boolean(onZoom) && !story && shownSlide?.mediaType !== "video";
  const zoomSource = () => stageRef.current?.querySelector(single ? ".coverCanvas" : ".slideItem.current .coverCanvas, .slideItem.current img") || null;
  // Its button is in the action row now (1.14.1, Arjang #790 item 2): it opens the zoom through zoomRef.
  useLayoutEffect(() => {
    if (!zoomRef) return undefined;
    zoomRef.current = zoomable ? () => { if (zoomSource()) onZoom({ source: zoomSource, slideUrl: shownSlide?.mediaUrl || null, slideAt: shownSlide ? shownSlide.at : null }); } : null;
    return () => { zoomRef.current = null; };
  });

  // slideAt null is the cover; a number is that carousel photo, drawn with the text she put on it (1.20.0).
  const cover = (maxW, maxH, slideAt = null) => (
    <CoverCanvas item={item} quoteOn={quoteOn} maxW={maxW} maxH={maxH} story={story && slideAt === null} safe={safe} free={free} slideAt={slideAt}
      canvasRef={single || slideAt === null ? canvasRef : undefined} onDrawn={onDrawn}
      className={[editing && "editing", pickMode && "picking"].filter(Boolean).join(" ")}>
      {({ cssW, cssH }) => (
        <>
          <div className="hitLayer" style={{ touchAction: editing ? "none" : "auto" }} {...pointer(cssW, cssH, slideAt)} />
          <div className="snapLines" aria-hidden="true">
            {GUIDE_IDS.map((id) => (
              <span key={id} className={guide && guide.slideAt === slideAt && (guide.x === id || guide.y === id) ? `snapLine ${id} on` : `snapLine ${id}`} />
            ))}
          </div>
          {lift && lift.slideAt === slideAt && (() => {
            const b = boxesAt(cssW, cssH, slideAt).find((x) => x.index === lift.index);
            return b ? <div className="liftRing" aria-hidden="true" style={{ left: b.left - 8, top: b.top - 8, width: b.right - b.left + 16, height: b.bottom - b.top + 16 }} /> : null;
          })()}
          {editing && slideAt === null && (item.imageEdit?.mosaics || []).map((m, i) => (
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
        <div className="stageSingle">{cover(stageW, stageH, editing ? editSlide : null)}</div>
      ) : (
        <div className="track" ref={trackRef} onScroll={onScroll} aria-label="Slides" role="group">
          <div className={slide === 0 ? "slideItem current" : "slideItem"} style={{ width: slideW }}>{cover(slideW, stageH)}</div>
          {slides.map((s, i) => (
            <div key={`${s.mediaUrl}-${i}`} className={slide === i + 1 ? "slideItem current" : "slideItem"} style={{ width: slideW }}>
              {s.mediaType === "video"
                ? <video src={s.mediaUrl} muted playsInline controls preload="metadata" aria-label={`Slide ${i + 2}`} />
                : cover(slideW, stageH, s.at)}
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
