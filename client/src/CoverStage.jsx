import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import CoverCanvas from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";
import { STYLE_DEFAULTS, rewrapWidth, safeZoneFor, textHitBoxes } from "./renderCover.js";
import { lockAxis, startAxis } from "./safeLock.js";
import { GUIDE_IDS, SNAP_PX, guidesFor, snap, snapGuidesOn } from "./snapGuides.js";
import { SWIPE, buzzesMidDrag, flyFor, haptic, progressFor, releaseFor, stampFor, tiltFor, velocityOf } from "./swipe.js";

// The stage: a 4:5 frame like a post, and the cover on it is a card (1.34.0, Arjang: swipe like Tinder). Drag it right
// to approve, left to pass: it tilts with the finger, a big heart or X shows on it, and the next cover waits underneath.
// Her carousel photos sit on the same card: a tap on the right half of the photo shows the next one, the left half the
// one before, with bars on top, like Tinder. While she edits, only the photo she's editing shows (the cover, or since
// 1.20.0 the carousel photo she was on): tap a text box to pick it, drag it to move it, and on the cover the Face mosaic
// boxes can be dragged and resized right on the photo. On a computer, a click on the photo away from the text closes
// the editor.

const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
const TAP = 8; // a press that moves less than this many pixels is a tap
const FREE = 3; // a drag past this many pixels lets the box leave the safe rectangle for this session (1.13.8)
const HOLD_MS = 320; // a press held this long on a text box lifts it for placing (1.20.0, Big Edit item 9)
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The next cover, drawn under the card so a swipe uncovers it. It only shows while a card is moving.
const UnderCard = memo(function UnderCard({ item, quoteOn, maxW, maxH, story, safe }) {
  return <CoverCanvas item={item} quoteOn={quoteOn} maxW={maxW} maxH={maxH} story={story} safe={safe} />;
});

export default function CoverStage({
  item, quoteOn, slides, slide, setSlide, story, editing, editSlide = null, activeBox, onStartEdit, onSelectBox, onMoveBox,
  pickMode, onPick, onMosaicsChange, onDrawn, onZoom, zoomRef, onTapOff, free = null, onFree, onMoveText, onDropText,
  under = null, underQuoteOn = false, swipe = null, swipeRef = null,
}) {
  const stageRef = useRef(null);
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
  // A tap shows the next photo or the one before (1.34.0, like Tinder: a sideways drag is a swipe now). The steppers
  // under the cover and Shift+arrow keys move it too.
  const stepSlide = (d) => setSlide((s) => Math.max(0, Math.min(total - 1, s + d)));

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
      w0: b.textWidth, w: null }); // a box re-wraps narrower to follow a drag: landscape (1.27.0), every ratio (1.29.0)
  }
  // Two fingers on a text box (1.35.0, Arjang Nov 26) pinch it bigger or smaller, and move it with them: in the editor
  // the second finger joins a press on a box; outside it, two fingers on a box lift it at once. The size stays between
  // the Size slider's ends (or wherever it already was past them).
  const sizeOf = (index) => {
    const b = index === -1 ? item : (item.extraTexts || [])[index];
    return Number(b?.fontSize) || STYLE_DEFAULTS.fontSize;
  };
  function startPinch(p, e, cssW, cssH, slideAt) {
    const b = boxesAt(cssW, cssH, slideAt).find((bx) => bx.index === p.hit);
    const r = e.currentTarget.getBoundingClientRect();
    const s0 = sizeOf(p.hit);
    p.pinch = { id: e.pointerId, x: e.clientX, y: e.clientY, d0: Math.max(12, Math.hypot(e.clientX - p.cx, e.clientY - p.cy)), s0,
      lo: Math.min(24, s0), hi: Math.max(110, s0), mid0: { x: (e.clientX + p.cx) / 2, y: (e.clientY + p.cy) / 2 },
      c0: b ? { x: (b.centerX * r.width) / cssW, y: (b.centerY * r.height) / cssH } : { x: p.cx - r.left, y: p.cy - r.top } };
    if (p.gx || p.gy) { p.gx = p.gy = null; setGuide(null); }
  }
  function applyPinch(p, e, slideAt) {
    const q = p.pinch, r = e.currentTarget.getBoundingClientRect();
    const d = Math.hypot(q.x - p.cx, q.y - p.cy);
    const size = Math.round(Math.min(q.hi, Math.max(q.lo, (q.s0 * d) / q.d0)));
    const mid = { x: (q.x + p.cx) / 2, y: (q.y + p.cy) / 2 };
    const h = Math.round(Math.min(100, Math.max(0, ((q.c0.x + mid.x - q.mid0.x) / r.width) * 100)));
    const v = Math.round(Math.min(100, Math.max(0, ((q.c0.y + mid.y - q.mid0.y) / r.height) * 100)));
    if (!p.freed) { p.freed = true; onFree?.(p.hit); }
    p.moved = true;
    if (!p.lifted) onMoveBox(p.hit, h, v, null, size);
    else { p.placed = true; onMoveText(p.hit, h, v, slideAt, null, size); }
  }
  const pointer = (cssW, cssH, slideAt = null) => ({
    onPointerDown(e) {
      const p0 = press.current;
      if (p0 && p0.id !== e.pointerId) {
        // A second finger: only on a text box she's moving or holding, and only one pinch at a time.
        if (p0.pinch || p0.hit == null || p0.mouse || pickMode || e.pointerType === "mouse") return;
        if (!p0.drag) {
          if (editing || !onMoveText || p0.moved) return;
          clearTimeout(p0.timer); // two fingers on the box lift it right away
          p0.lifted = true;
          p0.drag = true;
          try { e.currentTarget.setPointerCapture?.(p0.id); } catch { /* the first finger may be gone already */ }
          grab(p0, cssW, cssH, slideAt);
          setLift({ index: p0.hit, slideAt });
        }
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* the pointer may be gone already */ }
        startPinch(p0, e, cssW, cssH, slideAt);
        return;
      }
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = hitAt(x, y, cssW, cssH, slideAt);
      // In the editor a press on any text box picks it and drags it at once (1.20.0, Big Edit item 9).
      const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, x, y, hit, moved: false, mouse: e.pointerType === "mouse",
        drag: editing && !pickMode && hit != null, lifted: false };
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
      if (p.pinch) {
        if (e.pointerId === p.pinch.id) { p.pinch.x = e.clientX; p.pinch.y = e.clientY; } else if (e.pointerId === p.id) { p.cx = e.clientX; p.cy = e.clientY; } else return;
        applyPinch(p, e, slideAt);
        return;
      }
      if (e.pointerId !== p.id || p.pinched) return; // after a pinch the box stays where the fingers left it
      p.cx = e.clientX; p.cy = e.clientY;
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
      // A drag past where the block's edge meets the photo's edge re-wraps it narrower instead of stopping (1.27.0, Quill
      // #1145; every ratio since 1.29.0, Quill #1212), down to 38%, so the center keeps following her. The photo's own frame
      // is the hard edge; the safe zone stays a magnet (crossing locks), never a wall.
      let halfW = p.halfW;
      if (p.zone && p.w0) {
        p.w = rewrapWidth(x, p.halfW, p.w0, 0, p.cssW);
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
    onPointerUp(e) {
      const p = press.current;
      if (!p) return;
      if (p.pinch && e.pointerId === p.pinch.id) { p.pinch = null; p.pinched = true; return; } // the first finger finishes it
      if (e.pointerId !== p.id) return;
      press.current = null;
      clearTimeout(p.timer);
      if (p.gx || p.gy) setGuide(null);
      if (p.lifted) setLift(null);
      if (p.placed) { onDropText?.(); return; } // placed: the editor stays closed
      if (p.moved) return; // a lift let go without moving is still a tap (1.13.6): it opens the editor
      if (pickMode) return sampleColor(p.x, p.y, cssW);
      // A click away from the text closes the editor on a computer (1.20.0, Big Edit item 3). A tap on a phone doesn't:
      // there her thumb often lands just off the text while she works. Outside the editor, a tap away from the text
      // shows the next carousel photo on the right half and the one before on the left half (1.34.0, like Tinder).
      if (p.hit == null) {
        if (editing) { if (p.mouse) onTapOff?.(); return; }
        if (!single && total > 1) stepSlide(p.x < cssW / 2 ? -1 : 1);
        return;
      }
      if (editing) onSelectBox(p.hit);
      else onStartEdit(p.hit, slideAt);
    },
    onPointerCancel(e) {
      const p = press.current;
      if (!p) return;
      if (p.pinch && e.pointerId === p.pinch.id) { p.pinch = null; p.pinched = true; return; }
      if (e.pointerId !== p.id) return;
      press.current = null;
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

  // ---------- The swipe (1.34.0, Arjang: exactly like Tinder) ----------
  // The card follows her finger and tilts the way a card held at that spot swings. A heart (right) or an X (left) shows
  // on it, faint at first, then solid and bigger once letting go would send it, with a tap of the phone at that moment.
  // Let go past that line, or flick it, and the card flies off and the decision is made; short of it, it springs back,
  // and she can catch it again on the way. What flies off is a copy, so the next cover, drawn underneath the whole time,
  // is hers to swipe the moment it's uncovered. Everything that moves during a drag is set on the elements directly, so
  // React never redraws the cover mid-gesture.
  const cardRef = useRef(null);
  const stampsRef = useRef(null);
  const likeRef = useRef(null);
  const nopeRef = useRef(null);
  const ghostsRef = useRef(null); // the copies of sent cards, flying off
  const gesture = useRef(null); // a press on the card that may turn into a swipe
  const lastGrab = useRef(null); // where the last swipe held the card, to catch it again as it springs back
  const flight = useRef(null); // the card on its way back, or the cover it's waiting on: { timer, back } or { id, waiting, timer }
  const modeRef = useRef("idle");
  const [mode, setModeState] = useState("idle"); // idle | drag | fly | swap | enter
  const setMode = (m) => { modeRef.current = m; setModeState(m); };
  const [flying, setFlying] = useState(0); // copies still flying off
  const [frozenUnder, setFrozenUnder] = useState(null); // { item, quoteOn }: the cover underneath, held still while a card moves
  const freeze = () => setFrozenUnder({ item: under, quoteOn: underQuoteOn });
  const [drawnHere, setDrawnHere] = useState(null);
  const drawnRef = useRef(null);
  const drawn = useCallback((id) => { drawnRef.current = id; setDrawnHere(id); onDrawn?.(id); }, [onDrawn]);
  const canSwipe = Boolean(swipe) && !editing && !pickMode;
  const swipeNow = useRef(swipe);
  swipeNow.current = swipe;
  const timers = useRef(new Set());
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); return t; };
  useEffect(() => () => { clearTimeout(flight.current?.timer); timers.current.forEach(clearTimeout); }, []);

  function setCard(dx, dy, tilt, ms = 0, ease = "ease") {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms ${ease}` : "none";
    el.style.transform = dx || dy || tilt ? `translate3d(${dx}px, ${dy}px, 0) rotate(${tilt}deg)` : "";
  }
  function paintStamp(el, on, look, ms) {
    el.style.transition = ms ? `opacity ${ms}ms ease, transform ${ms}ms ease` : "none";
    el.style.opacity = on ? String(look.opacity) : "0";
    el.style.setProperty("--s", on ? String(look.scale) : "0.8");
  }
  function paintStamps(dir, p, ms = 0) {
    const look = stampFor(p);
    if (likeRef.current) paintStamp(likeRef.current, dir === 1, look, ms);
    if (nopeRef.current) paintStamp(nopeRef.current, dir === -1, look, ms);
  }
  // The heart and X sit on the photo itself, whatever its shape: measured while the card is still at rest.
  function placeStamps() {
    const card = cardRef.current, box = stampsRef.current;
    if (!card || !box) return;
    const media = card.querySelector(single ? ".stageSingle .coverWrap" : ".slideItem.current .coverWrap, .slideItem.current video");
    const c = card.getBoundingClientRect(), m = media ? media.getBoundingClientRect() : c;
    Object.assign(box.style, { left: `${m.left - c.left}px`, top: `${m.top - c.top}px`, width: `${m.width}px`, height: `${m.height}px` });
    box.style.setProperty("--mw", `${m.width}px`);
  }
  // Where the card is headed, for the swipe row's buttons. A card flying off hands the row back only if nothing newer
  // has taken it since.
  const lastIntent = useRef(null);
  const intent = (next) => { lastIntent.current = next; swipeNow.current?.onIntent?.(next); };

  function cardDown(e) {
    if (!canSwipe || gesture.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (drawnRef.current !== item.id) return; // the cover isn't on screen yet
    if (e.target.closest?.("button, a, input, textarea, select, .mosaicBox")) return;
    if (e.target.closest?.("video") && e.clientY > e.target.getBoundingClientRect().bottom - 56) return; // its play bar
    const el = cardRef.current, L = lastGrab.current, f = flight.current;
    if (modeRef.current === "drag" && f?.back && L) {
      // Caught on its way back: it stops where it is and follows her again from there. The press is the card's alone:
      // no tap, and no hold that lifts a text box.
      clearTimeout(f.timer);
      flight.current = null;
      if (press.current) { clearTimeout(press.current.timer); press.current = null; }
      const t = getComputedStyle(el).transform;
      let x = 0, y = 0;
      try { const m = new DOMMatrixReadOnly(t && t !== "none" ? t : undefined); x = m.m41; y = m.m42; } catch { /* from the middle */ }
      setCard(x, y, tiltFor(x, L.w, L.low));
      gesture.current = { ...L, id: e.pointerId, x0: e.clientX - x, y0: e.clientY - y, on: true, off: false, dx: x, dy: y, lead: 0, solid: false,
        itemId: item.id, samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
      try { el.setPointerCapture(e.pointerId); } catch { /* the pointer may be gone already */ }
      return;
    }
    if (modeRef.current !== "idle") return;
    const r = el.getBoundingClientRect();
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height,
      low: e.clientY - r.top > r.height / 2, on: false, off: false, dx: 0, dy: 0, lead: 0, solid: false, itemId: item.id,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
  }
  function cardMove(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.off) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.on) {
      const p = press.current;
      if (p?.lifted || p?.drag) { g.off = true; return; } // she's placing a text box
      if (Math.abs(dx) < SWIPE.slop && Math.abs(dy) < SWIPE.slop) return;
      if (Math.abs(dx) < Math.abs(dy)) { g.off = true; return; } // more up or down than sideways: the page scrolls
      g.on = true;
      if (p) { clearTimeout(p.timer); p.moved = true; } // no lift and no tap: this press is a swipe
      try { cardRef.current.setPointerCapture(e.pointerId); } catch { /* the pointer may be gone already */ }
      placeStamps();
      cardRef.current.style.transformOrigin = `${g.ox}px ${g.oy}px`;
      lastGrab.current = { ox: g.ox, oy: g.oy, w: g.w, h: g.h, low: g.low };
      freeze();
      setMode("drag");
    }
    g.dx = dx; g.dy = dy;
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (g.samples.length > 10) g.samples.shift();
    setCard(dx, dy, tiltFor(dx, g.w, g.low));
    const dir = Math.sign(dx), p = progressFor(dx, g.w);
    paintStamps(dir, p);
    const lead = Math.abs(dx) >= SWIPE.lead ? dir : 0, solid = p >= 1;
    if (solid && !g.solid && buzzesMidDrag()) haptic(); // the heart or X turns solid and grows: letting go now sends it
    if (lead !== g.lead || solid !== g.solid) {
      g.lead = lead; g.solid = solid;
      intent(lead ? { dir: lead, solid, phase: "drag" } : null);
    }
  }
  function cardUp(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.on) return; // a tap or a scroll: the photo's own press handles it
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    // A flick's speed is the finger's while it moved; one that stopped before lifting doesn't flick.
    const last = g.samples[g.samples.length - 1];
    const v = e.timeStamp - last.t > 80 ? { x: 0, y: 0 } : velocityOf(g.samples);
    let dir = releaseFor(g.dx, v.x, g.w);
    if (dir && (g.itemId !== item.id || swipeNow.current?.canSend?.(dir) === false)) dir = 0;
    if (dir) {
      if (!buzzesMidDrag()) haptic(); // an iPhone taps as the card goes: it can't mid-drag
      send(dir, { dx: g.dx, dy: g.dy, vx: v.x, vy: v.y, w: g.w, h: g.h, tilt: tiltFor(g.dx, g.w, g.low) });
    } else springBack();
  }
  function cardCancel(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.on) return;
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    springBack();
  }
  function springBack() {
    const reduce = reducedMotion();
    setCard(0, 0, 0, reduce ? 0 : 420, "cubic-bezier(0.2, 1.3, 0.35, 1)");
    paintStamps(0, 0, reduce ? 0 : 180);
    intent(null);
    clearTimeout(flight.current?.timer);
    flight.current = { back: true, timer: setTimeout(() => {
      flight.current = null;
      const el = cardRef.current;
      if (el) { el.style.transition = ""; el.style.transformOrigin = ""; }
      setMode("idle");
      setFrozenUnder(null);
    }, reduce ? 0 : 430) };
  }
  // A copy of the card as it is right now, photo and all, to fly off in its place.
  function ghostOf(card) {
    const ghost = card.cloneNode(true);
    ghost.classList.add("swipeGhost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    // Canvases come over blank: the one on show gets its picture (the other photos are out of sight, and stay empty).
    const from = [...card.querySelectorAll("canvas")], to = ghost.querySelectorAll("canvas");
    const shown = card.querySelector(single ? ".coverCanvas" : ".slideItem.current canvas");
    const i = from.indexOf(shown), c = from[i], t = to[i];
    if (c && t && c.width && c.height) {
      t.width = c.width; t.height = c.height;
      try { t.getContext("2d").drawImage(c, 0, 0); } catch { /* left blank */ }
    }
    ghost.querySelectorAll("video").forEach((v) => v.replaceWith(Object.assign(document.createElement("div"), { className: "ghostVideo" })));
    return ghost;
  }
  // Sends the card off to one side. A copy flies; the card itself goes back to rest, hidden until the next cover is
  // drawn on it, and the decision goes up at once. The last cover flies off first, since the deck empties after it.
  function send(dir, g) {
    const id = item.id, card = cardRef.current, box = ghostsRef.current;
    const fly = flyFor({ dir, ...g });
    const ms = reducedMotion() ? 0 : fly.ms;
    const look = stampFor(Math.max(1.2, progressFor(g.dx, g.w))); // solid the whole way out
    const flyIntent = { dir, solid: true, phase: "fly" };
    intent(flyIntent);
    const ghost = card && box ? ghostOf(card) : null;
    if (ghost) {
      box.append(ghost);
      setFlying((n) => n + 1);
      void ghost.getBoundingClientRect(); // the browser takes in where it starts, so the throw animates
      ghost.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.3, 0.6, 0.45, 1)` : "none";
      ghost.style.transform = `translate3d(${fly.x}px, ${fly.y}px, 0) rotate(${fly.tilt}deg)`;
      for (const [sel, side] of [[".stamp.like", 1], [".stamp.nope", -1]]) {
        const st = ghost.querySelector(sel);
        if (st) paintStamp(st, side === dir, look, ms ? 120 : 0);
      }
      later(() => {
        ghost.remove();
        setFlying((n) => Math.max(0, n - 1));
        if (lastIntent.current !== flyIntent) return; // she's already on the next one
        const pop = { dir, phase: "pop" };
        intent(pop);
        later(() => { if (lastIntent.current === pop) intent(null); }, 420);
      }, ms + 16);
      card.style.visibility = "hidden";
      setCard(0, 0, 0);
      card.style.transformOrigin = "";
      paintStamps(0, 0);
    }
    if (ghost && under) { land(id, dir); return; }
    // The last cover, or no copy to fly: the card itself goes, and the decision follows it.
    if (!ghost) {
      paintStamps(dir, Math.max(1.2, progressFor(g.dx, g.w)), ms ? 120 : 0);
      setCard(fly.x, fly.y, fly.tilt, ms, "cubic-bezier(0.3, 0.6, 0.45, 1)");
    }
    setMode("fly");
    clearTimeout(flight.current?.timer);
    flight.current = { id, dir, timer: setTimeout(() => land(id, dir), ms + 16) };
  }
  function land(id, dir) {
    const el = cardRef.current;
    if (el) { el.style.visibility = "hidden"; setCard(0, 0, 0); el.style.transformOrigin = ""; }
    paintStamps(0, 0);
    clearTimeout(flight.current?.timer);
    flight.current = { id, dir, waiting: true, timer: setTimeout(reveal, 1500) }; // shown again even if the next never draws
    drawnRef.current = null; // the next cover shows once it's drawn on this card
    setDrawnHere(null);
    setMode("swap");
    const leaves = swipeNow.current?.onSwipe?.(dir, id);
    if (leaves === false) reveal();
  }
  function reveal() {
    const el = cardRef.current;
    if (el) el.style.visibility = "";
    clearTimeout(flight.current?.timer);
    flight.current = null;
    setMode("idle");
    setFrozenUnder(null);
  }
  // The cover that took its place is drawn: the card shows again, right where the one underneath already is.
  useLayoutEffect(() => {
    const f = flight.current;
    if (mode === "swap" && f?.waiting && drawnHere === item.id && item.id !== f.id) reveal();
  }, [mode, drawnHere, item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A cover that changes under a drag (a reload) ends the drag where it is.
  useEffect(() => {
    if (modeRef.current !== "drag" || !gesture.current) return;
    gesture.current = null;
    springBack();
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The heart and X buttons send the card the same way (Tinder's buttons), with the same tap of the phone.
  const fly = (dir) => {
    if (!canSwipe || modeRef.current !== "idle" || drawnRef.current !== item.id || !cardRef.current) return false;
    if (swipeNow.current?.canSend?.(dir) === false) return true; // it said why; nothing moves
    placeStamps();
    const r = cardRef.current.getBoundingClientRect();
    cardRef.current.style.transformOrigin = "50% 50%";
    freeze();
    haptic();
    send(dir, { dx: 0, dy: 0, vx: dir * 1.8, vy: 0, w: r.width, h: r.height, tilt: 0 });
    return true;
  };
  if (swipeRef) swipeRef.current = { fly, busy: () => modeRef.current !== "idle" };

  // Rewind (1.34.0): the cover she brings back flies in from the side it left by, over the one she was on, which waits
  // underneath. It shows once its photo is drawn on this card, so nothing of the cover before it flies in.
  const enterFrom = swipe?.enterFrom ?? null;
  useLayoutEffect(() => {
    if (!enterFrom || enterFrom.id !== item.id || modeRef.current !== "idle" || !cardRef.current) return;
    const el = cardRef.current;
    el.style.visibility = "hidden";
    el.style.transformOrigin = "50% 50%";
    setCard(enterFrom.dir * (el.clientWidth + el.clientHeight * 0.5 + 40), 0, enterFrom.dir * 16);
    drawnRef.current = null;
    setDrawnHere(null);
    setMode("enter");
  }, [enterFrom?.id, item.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (mode !== "enter" || drawnHere !== item.id || !cardRef.current) return undefined;
    const el = cardRef.current;
    el.style.visibility = "";
    const reduce = reducedMotion();
    void el.getBoundingClientRect(); // the browser takes in where it starts, so the move in animates
    setCard(0, 0, 0, reduce ? 0 : 380, "cubic-bezier(0.2, 0.9, 0.25, 1)");
    const t = setTimeout(() => {
      el.style.transition = ""; el.style.transformOrigin = "";
      setMode("idle");
      setFrozenUnder(null);
      swipeNow.current?.onEntered?.();
    }, reduce ? 20 : 400);
    return () => clearTimeout(t);
  }, [mode, drawnHere, item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A rewind that never arrives (its cover isn't on this card after all) lets the card go back to normal.
  useEffect(() => {
    if (enterFrom || modeRef.current !== "enter") return;
    const el = cardRef.current;
    if (el) { el.style.visibility = ""; setCard(0, 0, 0); el.style.transformOrigin = ""; }
    setMode("idle");
    setFrozenUnder(null);
  }, [enterFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  const below = frozenUnder ?? { item: under, quoteOn: underQuoteOn };

  // The magnifier (1.7) flies up whatever she's looking at: the cover, or a photo slide with its own text (1.20.0).
  const shownSlide = !single && slide > 0 ? slides[slide - 1] : null;
  const zoomable = Boolean(onZoom) && !story && shownSlide?.mediaType !== "video";
  // From the card itself: the cover drawn underneath for the swipe has a canvas too.
  const zoomSource = () => cardRef.current?.querySelector(single ? ".coverCanvas" : ".slideItem.current .coverCanvas, .slideItem.current img") || null;
  // Its button is in the action row now (1.14.1, Arjang #790 item 2): it opens the zoom through zoomRef.
  useLayoutEffect(() => {
    if (!zoomRef) return undefined;
    zoomRef.current = zoomable ? () => { if (zoomSource()) onZoom({ source: zoomSource, slideUrl: shownSlide?.mediaUrl || null, slideAt: shownSlide ? shownSlide.at : null }); } : null;
    return () => { zoomRef.current = null; };
  });

  // slideAt null is the cover; a number is that carousel photo, drawn with the text she put on it (1.20.0).
  const cover = (maxW, maxH, slideAt = null) => (
    <CoverCanvas item={item} quoteOn={quoteOn} maxW={maxW} maxH={maxH} story={story && slideAt === null} safe={safe} free={free} slideAt={slideAt}
      canvasRef={single || slideAt === null ? canvasRef : undefined} onDrawn={slideAt === null ? drawn : undefined}
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

  const bars = !single && total > 1;
  const stageClass = ["stage", mode !== "idle" && "swiping", (mode !== "idle" || flying > 0) && "moving"].filter(Boolean).join(" ");
  return (
    <div className={stageClass} ref={stageRef} style={{ height: stageH }}
      onClick={(e) => { if (editing && (e.target === e.currentTarget || e.target.classList.contains("stageSingle") || e.target.classList.contains("swipeCard"))) onTapOff?.(); }}>
      {swipe && below.item && (
        <div className="swipeUnder" aria-hidden="true">
          <UnderCard key={below.item.id} item={below.item} quoteOn={below.quoteOn} maxW={stageW} maxH={stageH} story={story} safe={safe} />
        </div>
      )}
      <div className="swipeCard" ref={cardRef} style={canSwipe ? { touchAction: "pan-y" } : undefined}
        onPointerDown={cardDown} onPointerMove={cardMove} onPointerUp={cardUp} onPointerCancel={cardCancel}
        onLostPointerCapture={(e) => { if (e.target === e.currentTarget) cardCancel(e); /* the photo's own one bubbles here too */ }}>
        {single ? (
          <div className="stageSingle">{cover(stageW, stageH, editing ? editSlide : null)}</div>
        ) : (
          <div className="track" style={{ transform: `translate3d(${-slide * slideW}px, 0, 0)` }} aria-label="Slides" role="group">
            <div className={slide === 0 ? "slideItem current" : "slideItem"} style={{ width: slideW }} inert={slide === 0 ? undefined : true}>{cover(slideW, stageH)}</div>
            {slides.map((s, i) => (
              <div key={`${s.mediaUrl}-${i}`} className={slide === i + 1 ? "slideItem current" : "slideItem"} style={{ width: slideW }} inert={slide === i + 1 ? undefined : true}>
                {s.mediaType === "video"
                  ? <video src={s.mediaUrl} muted playsInline controls preload="metadata" aria-label={`Slide ${i + 2}`} />
                  : cover(slideW, stageH, s.at)}
              </div>
            ))}
          </div>
        )}
        {bars && ( /* Tinder's bars across the top: one for each photo, the one showing lit. A bar jumps to its photo. */
          <div className="slideBars" role="group" aria-label="Photos">
            {Array.from({ length: total }, (_, i) => (
              <button key={i} type="button" className={i === slide ? "slideBar on" : "slideBar"} onClick={() => setSlide(i)}
                aria-label={`Photo ${i + 1} of ${total}`} aria-current={i === slide ? "true" : undefined}><span /></button>
            ))}
          </div>
        )}
        <div className="swipeStamps" ref={stampsRef} aria-hidden="true">
          <span className="stamp like" ref={likeRef}>
            <svg viewBox="0 0 100 100"><path d="M50 90C23 70 4 52 4 30.5 4 15.6 15.3 5 29 5c9.3 0 16.6 5 21 12.6C54.4 10 61.7 5 71 5c13.7 0 25 10.6 25 25.5C96 52 77 70 50 90z" /></svg>
          </span>
          <span className="stamp nope" ref={nopeRef}>
            <svg viewBox="0 0 100 100"><rect x="41" y="1" width="18" height="98" rx="4" transform="rotate(45 50 50)" /><rect x="41" y="1" width="18" height="98" rx="4" transform="rotate(-45 50 50)" /></svg>
          </span>
        </div>
      </div>
      <div className="swipeGhosts" ref={ghostsRef} aria-hidden="true" />
      {bars && <span className="srOnly" aria-live="polite">Photo {slide + 1} of {total}</span>}
      {pickMode && <p className="pickHint" role="status">Tap the photo to pick a color</p>}
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
