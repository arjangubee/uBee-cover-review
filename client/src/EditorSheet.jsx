import { useEffect, useRef, useState } from "react";

// The text editor's sheet, like the original's: anchored to the bottom, nearly see-through. It rests at 56% of the
// screen; a swipe up (on the handle, or from the top of its content) takes it to 88% (1.8, Arjang and Quill), and a
// swipe down from there brings it back to 56%. From 56%, dragging it down past max(96px, 16% of the screen), a tap
// on its handle, a tap outside it, or Escape closes it. Edits save as she goes (1.8), so closing never discards.
// onDismiss may answer false (her last change couldn't be saved): the sheet then comes back instead of closing.

const CLOSE_MS = 260;
const REST = 0.56, TALL = 0.88;
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const threshold = () => Math.max(96, 0.16 * window.innerHeight);
const maxDrag = () => 0.52 * window.innerHeight; // the original stops the pull at 52% of the screen
const span = () => (TALL - REST) * window.innerHeight; // the distance between the two stops
const STATUS = { idle: "Saves as you go", saving: "Saving…", saved: "Saved", error: "Not saved yet" };

export default function EditorSheet({ onDismiss, status = "idle", dismissRef: outerDismiss, children }) {
  const [offset, setOffset] = useState(0); // px down, from the rest stop, while dragging it closed
  const [grow, setGrow] = useState(0); // px taller (or shorter, below 0) than the current stop, while dragging between stops
  const [tall, setTall] = useState(false);
  const [phase, setPhase] = useState("open"); // open | dragging | settling | closing
  const closing = useRef(false);
  const tallRef = useRef(false);
  tallRef.current = tall;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const handleDrag = useRef(null);
  const lastDragEnd = useRef(0);
  const handleRef = useRef(null);
  const scrollRef = useRef(null);
  const closeTimer = useRef(0);

  function settle(toTall) {
    setTall(toTall);
    setGrow(0);
    setOffset(0);
    setPhase("settling");
  }
  function dismiss() {
    if (closing.current) return;
    closing.current = true;
    const finish = () => Promise.resolve(dismissRef.current()).then((ok) => {
      if (ok !== false) return;
      closing.current = false; // it couldn't save: the sheet comes back so nothing is lost
      settle(tallRef.current);
    });
    if (reducedMotion()) { finish(); return; }
    setPhase("closing");
    closeTimer.current = setTimeout(finish, CLOSE_MS);
  }
  const dismissFn = useRef(dismiss);
  dismissFn.current = dismiss;
  if (outerDismiss) outerDismiss.current = () => dismissFn.current(); // a tap off the photo, on the cover's frame, closes it too

  // One drag, from either stop: dy > 0 is down. Up from 56% grows toward 88%; down from 88% shrinks toward 56%;
  // down from 56% slides it away. Up from 88% does nothing.
  function dragTo(dy) {
    setPhase("dragging");
    if (!tallRef.current && dy < 0) { setGrow(Math.min(-dy, span())); setOffset(0); }
    else if (tallRef.current && dy > 0) { setGrow(-Math.min(dy, span())); setOffset(0); }
    else if (!tallRef.current && dy > 0) { setOffset(Math.min(dy, maxDrag())); setGrow(0); }
    else { setGrow(0); setOffset(0); }
  }
  function release(dy) {
    const step = 0.25 * span(); // a quarter of the way to the other stop is enough to go there
    if (!tallRef.current && dy < 0) { settle(-dy > step); return; }
    if (tallRef.current && dy > 0) { settle(!(dy > step)); return; }
    if (!tallRef.current && dy > threshold()) { dismiss(); return; }
    settle(tallRef.current);
  }

  // The handle: drag it with a finger, pen or mouse. A tap (or Enter) closes the sheet.
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
    dragTo(e.clientY - d.startY);
  }
  function onHandleUp(e) {
    const d = handleDrag.current;
    handleDrag.current = null;
    if (!d || d.moved < 6) return; // a tap: the click that follows closes the sheet
    lastDragEnd.current = Date.now();
    release(e.clientY - d.startY);
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

  // The scroll area: at its top, a swipe moves the sheet before the content scrolls. Up at 56% grows it to 88%;
  // down shrinks it from 88%, or slides it away from 56%. Sideways swipes (the sliders) and swipes inside something
  // already scrolled are left alone.
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
      start = ev.touches.length === 1 && !closing.current && !scrolledAbove(ev.target) ? { x: t.clientX, y: t.clientY } : null;
      dragging = false;
    };
    const move = (ev) => {
      if (!start) return;
      const t = ev.touches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (!dragging) {
        const sheetMoves = (dy > 0) || (dy < 0 && !tallRef.current);
        if (!sheetMoves || Math.abs(dx) > Math.abs(dy) || !ev.cancelable) { start = null; return; }
        dragging = true;
      }
      ev.preventDefault();
      dragTo(dy);
    };
    const up = (ev) => {
      if (!start || !dragging) { start = null; return; }
      const t = ev.changedTouches?.[0];
      const dy = t ? t.clientY - start.y : 0;
      start = null;
      dragging = false;
      release(dy);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    handleRef.current?.focus({ preventScroll: true }); // keyboard focus starts in the sheet
    const onKey = (e) => { if (e.key === "Escape") dismissFn.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(closeTimer.current); };
  }, []);

  return (
    <>
      <div className="sheetLayer" onClick={dismiss} aria-hidden="true" />
      <section className={`editorSheet ${phase}${tall ? " tall" : ""}`} role="dialog" aria-label="Text editor"
        style={{ "--drag": `${offset}px`, "--grow": `${grow}px` }}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && phase === "settling") setPhase("open"); }}>
        <div className="sheetTop">
          <button type="button" ref={handleRef} className="sheetHandle" aria-label="Close the editor" aria-describedby="sheetStatus"
            onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleCancel} onClick={onHandleClick} />
          <span id="sheetStatus" className={`sheetStatus ${status}`} role="status">{STATUS[status] || STATUS.idle}</span>
        </div>
        <div className="sheetScroll" ref={scrollRef}>{children}</div>
      </section>
    </>
  );
}
