import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Icon from "./icons.jsx";
import { displayTitle } from "./reviewMath.js";

// A carousel holds this many photos, its cover included (1.37.0, Arjang Nov 26). The server holds the same line.
export const CAROUSEL_MAX = 10;
const PEEK_MS = 350; // a press this long shows the photo whole; a shorter one is a tap

// The carousel's + (1.37.0, Arjang Nov 26): Choose From Queue, then her phone's own picker (Photo Library, Take Photo or
// Video, Choose File). A web page can't add a line to the phone's menu, so this small menu comes first.
export function AddSlideMenu({ room, onQueue, onFile, onClose }) {
  const fileRef = useRef(null);
  const first = useRef(null);
  const full = room <= 0;
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet addSlideSheet" role="dialog" aria-modal="true" aria-labelledby="addSlideTitle" aria-describedby="addSlideHint">
        <div className="sheetHead">
          <h2 id="addSlideTitle">Add to this carousel</h2>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <p className="hint" id="addSlideHint">
          {full ? `It has ${CAROUSEL_MAX} photos, the most a carousel holds. Remove one to add another.`
            : `${CAROUSEL_MAX - room} of ${CAROUSEL_MAX} photos. Room for ${room} more.`}
        </p>
        <button ref={first} type="button" className="addSlideOption" disabled={full} onClick={onQueue}>
          <Icon name="grid" size={22} /> Choose From Queue
        </button>
        <button type="button" className="addSlideOption" disabled={full} onClick={() => fileRef.current?.click()}>
          <Icon name="photoAdd" size={22} /> Photo Library, Camera or File
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) { onClose(); onFile(f); } }} />
      </div>
    </div>
  );
}

// Choose From Queue (1.37.0, Arjang Nov 26). The queue's grid, the queue and approved, every photo, scrolling. It works
// differently from the queue: a tap picks a photo, with a thin white border, and a second tap lets it go. Holding a
// photo shows it whole until she lets go, and never picks it. She can pick as many as the carousel has room for, and
// they join in the order she tapped them. onAdd answers why they didn't join, or nothing once they did.
export default function QueuePicker({ currentId, room, onAdd, onClose }) {
  const [lists, setLists] = useState(null);
  const [failed, setFailed] = useState(null);
  const [picked, setPicked] = useState([]);
  const [peek, setPeek] = useState(null);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const press = useRef(null);
  const timer = useRef(null);
  const closeRef = useRef(null);
  const busy = useRef(false);
  busy.current = adding;

  useEffect(() => {
    let alive = true;
    Promise.all(["queue", "approved"].map((status) => api(`/api/items?status=${status}`)))
      .then(([q, a]) => {
        if (!alive) return;
        const keep = (r) => (r?.items || []).filter((it) => it.id !== currentId && it.imageUrl);
        setLists({ queue: keep(q), approved: keep(a) });
      })
      .catch((e) => { if (alive) setFailed(e.message || "The covers didn't load."); });
    return () => { alive = false; };
  }, [currentId]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy.current) { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const full = picked.length >= room;
  const toggle = (id) => {
    if (picked.includes(id)) { setPicked(picked.filter((x) => x !== id)); setNote(""); return; }
    if (full) { setNote(`A carousel holds ${CAROUSEL_MAX} photos. This one has room for ${room} more.`); return; }
    setPicked([...picked, id]);
    setNote("");
  };
  // A hold shows the photo whole. The press keeps its finger (pointer capture), so letting go anywhere ends it.
  const down = (e, item) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { id: item.id, x: e.clientX, y: e.clientY, peeked: false };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = press.current;
      if (!p || p.id !== item.id) return;
      p.peeked = true;
      setPeek(item);
      navigator.vibrate?.(8);
    }, PEEK_MS);
  };
  const move = (e) => {
    const p = press.current;
    if (p && !p.peeked && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(timer.current); press.current = null; }
  };
  const up = () => {
    clearTimeout(timer.current);
    const p = press.current;
    if (!p?.peeked) return;
    setPeek(null);
    setTimeout(() => { if (press.current === p) press.current = null; }, 400); // the click after a hold is ignored
  };
  const cancel = () => { clearTimeout(timer.current); press.current = null; setPeek(null); };
  const click = (item) => {
    const p = press.current;
    press.current = null;
    if (p?.peeked) return;
    toggle(item.id);
  };
  const add = async () => {
    if (!picked.length || adding) return;
    setAdding(true);
    const why = await onAdd(picked);
    if (why) { setNote(why); setAdding(false); }
  };

  const grid = (items) => (
    <div className={full ? "approvedGrid qpGrid full" : "approvedGrid qpGrid"}>
      {items.map((it) => {
        const at = picked.indexOf(it.id);
        return (
          <button type="button" key={it.id} className="tile qpTile" aria-pressed={at >= 0}
            aria-label={`${displayTitle(it.title)}${at >= 0 ? `, picked, photo ${at + 1} of ${picked.length}` : ""}`}
            onPointerDown={(e) => down(e, it)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()} onClick={() => click(it)}>
            <img src={it.imageUrl} alt="" loading="lazy" draggable={false} />
          </button>
        );
      })}
    </div>
  );
  const sections = lists ? [["queue", "Queue", lists.queue], ["approved", "Approved", lists.approved]] : [];
  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget && !adding) onClose(); }}>
      <div className="sheet qpSheet" role="dialog" aria-modal="true" aria-labelledby="pickTitle" aria-describedby="qpHint">
        <div className="qpHead">
          <h2 id="pickTitle">Choose From Queue</h2>
          <button ref={closeRef} type="button" className="iconBtn" onClick={onClose} disabled={adding} aria-label="Close"><Icon name="close" /></button>
        </div>
        <p className="hint qpHint" id="qpHint">Tap a photo to pick it, and tap again to let it go. Hold one to see it whole. They join in the order you tap them.</p>
        <div className="qpBody">
          {failed && <p className="problem" role="alert">{failed}</p>}
          {!lists && !failed && <p className="hint qpLoading">Loading your covers.</p>}
          {lists && !lists.queue.length && !lists.approved.length && <p className="hint qpLoading">No other covers in the queue or approved yet.</p>}
          {sections.filter(([, , items]) => items.length).map(([key, name, items]) => (
            <section key={key} aria-labelledby={`pick-${key}`}>
              <h3 id={`pick-${key}`} className="qpSection">{name} <span>{items.length}</span></h3>
              {grid(items)}
            </section>
          ))}
        </div>
        <div className="qpFoot">
          <p className="hint" role="status" aria-live="polite">{note || (picked.length ? `${picked.length} of ${room} picked.` : `Pick up to ${room}.`)}</p>
          <button type="button" className="qpAdd" disabled={!picked.length || adding} onClick={add}>
            {adding ? "Adding" : picked.length ? `Add ${picked.length}` : "Add"}
          </button>
        </div>
      </div>
      {peek && (
        <div className="qpPeek" aria-hidden="true">
          <img src={peek.imageUrl} alt="" draggable={false} />
        </div>
      )}
    </div>
  );
}
