import { useEffect, useRef, useState } from "react";

// The text editor's sheet, like the original's: anchored to the bottom, at most 56% of the screen, nearly
// see-through, one open stop. Dragging it down past max(96px, 16% of the screen), a tap on its handle, a tap
// outside it, or Escape closes it like Cancel. Save, inside the editor, is the only way to keep edits.
// children is a function that gets this same close, so the editor's Cancel slides the sheet away too.

const CLOSE_MS = 260;
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const threshold = () => Math.max(96, 0.16 * window.innerHeight);
const maxDrag = () => 0.52 * window.innerHeight; // the original stops the pull at 52% of the screen

export default function EditorSheet({ onDismiss, children }) {
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState("open"); // open | dragging | settling | closing
  const closing = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const handleDrag = useRef(null);
  const lastDragEnd = useRef(0);
  const handleRef = useRef(null);
  const scrollRef = useRef(null);

  function dismiss() {
    if (closing.current) return;
    closing.current = true;
    if (reducedMotion()) { dismissRef.current(); return; }
    setPhase("closing");
    setTimeout(() => dismissRef.current(), CLOSE_MS);
  }
  const dismissFn = useRef(dismiss);
  dismissFn.current = dismiss;

  function release(dy) {
    if (dy > threshold()) { dismiss(); return; }
    setPhase("settling");
    setOffset(0);
  }

  // The handle: drag it down with a finger, pen or mouse. A tap (or Enter) closes the sheet.
  function onHandleDown(e) {
    if (e.button !== 0 || closing.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    handleDrag.current = { startY: e.clientY, moved: 0 };
  }
  function onHandleMove(e) {
    const d = handleDrag.current;
    if (!d) return;
    d.moved = Math.max(d.moved, Math.abs(e.clientY - d.startY));
    if (d.moved < 6) return;
    setPhase("dragging");
    setOffset(Math.min(Math.max(0, e.clientY - d.startY), maxDrag()));
  }
  function onHandleUp(e) {
    const d = handleDrag.current;
    handleDrag.current = null;
    if (!d || d.moved < 6) return; // a tap: the click that follows closes the sheet
    lastDragEnd.current = Date.now();
    release(Math.max(0, e.clientY - d.startY));
  }
  function onHandleCancel() {
    if (!handleDrag.current) return;
    handleDrag.current = null;
    release(0);
  }
  function onHandleClick() {
    if (Date.now() - lastDragEnd.current < 500) return; // the click after a drag, already handled
    dismiss();
  }

  // The scroll area: a downward swipe that starts at its top drags the sheet instead of scrolling.
  // Sideways swipes (the sliders) and swipes inside something already scrolled are left alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    let start = null;
    let dragging = false;
    const scrolledAbove = (node) => {
      for (let n = node; n && n !== el; n = n.parentElement) if (n.scrollTop > 0) return true;
      return el.scrollTop > 0;
    };
    const down = (ev) => {
      const t = ev.touches[0];
      start = ev.touches.length === 1 && !scrolledAbove(ev.target) ? { x: t.clientX, y: t.clientY } : null;
      dragging = false;
    };
    const move = (ev) => {
      if (!start) return;
      const t = ev.touches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (!dragging) {
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !ev.cancelable) { start = null; return; }
        dragging = true;
        setPhase("dragging");
      }
      ev.preventDefault();
      setOffset(Math.min(Math.max(0, dy), maxDrag()));
    };
    const up = (ev) => {
      if (!start || !dragging) { start = null; return; }
      const t = ev.changedTouches?.[0];
      const dy = t ? t.clientY - start.y : 0;
      start = null;
      dragging = false;
      if (dy > threshold()) dismissFn.current();
      else { setPhase("settling"); setOffset(0); }
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, []);

  useEffect(() => {
    handleRef.current?.focus({ preventScroll: true }); // keyboard focus starts in the sheet
    const onKey = (e) => { if (e.key === "Escape") dismissFn.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="sheetLayer" onClick={dismiss} aria-hidden="true" />
      <section className={`editorSheet ${phase}`} role="dialog" aria-label="Text editor" style={{ "--drag": `${offset}px` }}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && phase === "settling") setPhase("open"); }}>
        <button type="button" ref={handleRef} className="sheetHandle" aria-label="Close the editor without saving"
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleCancel} onClick={onHandleClick} />
        <div className="sheetScroll" ref={scrollRef}>{children(dismiss)}</div>
      </section>
    </>
  );
}
