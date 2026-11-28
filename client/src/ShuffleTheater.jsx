import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Icon from "./icons.jsx";
import { displayTitle } from "./reviewMath.js";
import { SWIPE, progressFor, tiltFor } from "./swipe.js";

// Pick from shuffle (1.40.0 part 19, the creator's ask, room #1582): the cover she's on stays the cover, and she swipes
// through the queue one photo at a time, in the deck's order, looking for ones to add to its carousel. Theater mode: the
// rest of the screen dims and the quote is off while it's open (the page hides it). Right adds the photo, left skips it,
// the same sides as the deck. Done adds them all as one step for Undo, in the order she kept them. It stops taking more
// once the carousel is full. onAdd answers why they didn't join, or nothing once they did.
export default function ShuffleTheater({ cover, room, skipIds = [], onAdd, onClose }) {
  const [photos, setPhotos] = useState(null);
  const [failed, setFailed] = useState(null);
  const [at, setAt] = useState(0);
  const [kept, setKept] = useState([]);
  const [drag, setDrag] = useState(null); // { dx, low } while a finger is on the photo
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const press = useRef(null);
  const doneRef = useRef(null);
  const busy = useRef(false);
  busy.current = adding;

  useEffect(() => {
    let alive = true;
    const skip = new Set([cover.id, ...skipIds]);
    api("/api/items?status=queue")
      .then((r) => { if (alive) setPhotos((r?.items || []).filter((it) => it.imageUrl && !skip.has(it.id))); })
      .catch((e) => { if (alive) setFailed(e.message || "The queue didn't load."); });
    return () => { alive = false; };
  }, [cover.id]);

  const full = kept.length >= room;
  const photo = photos && !full ? photos[at] : null;
  const left = photos ? Math.max(0, photos.length - at) : 0;

  const next = (keep) => {
    if (!photo || adding) return;
    if (keep) {
      const now = [...kept, photo.id];
      setKept(now);
      setNote(now.length >= room ? `The carousel is full now. Tap Done to add ${now.length === 1 ? "it" : "them"}.` : "");
      navigator.vibrate?.(8);
    } else setNote("");
    setAt((n) => n + 1);
  };
  const done = async () => {
    if (adding) return;
    if (!kept.length) { onClose(); return; }
    setAdding(true);
    const why = await onAdd(kept);
    if (why) { setNote(why); setAdding(false); }
  };

  useEffect(() => { doneRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (busy.current) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); next(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The swipe: the photo follows the finger and tilts, and letting go past the line (or a flick) sends it that way.
  const down = (e) => {
    if (e.button !== 0 || !photo) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    press.current = { x: e.clientX, t: performance.now(), w: box.width, low: e.clientY > box.top + box.height / 2, moved: false };
  };
  const move = (e) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    if (!p.moved && Math.abs(dx) < SWIPE.slop) return;
    p.moved = true;
    setDrag({ dx, low: p.low, w: p.w });
  };
  const up = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    const dx = e.clientX - p.x, ms = Math.max(1, performance.now() - p.t);
    setDrag(null);
    if (!p.moved) return;
    const flick = Math.abs(dx) >= SWIPE.flickMin && Math.abs(dx) / ms >= SWIPE.flick;
    if (progressFor(dx, p.w) >= 1 || flick) next(dx > 0);
  };
  const cancel = () => { press.current = null; setDrag(null); };

  const p = drag ? progressFor(drag.dx, drag.w) : 0;
  const style = drag ? { transform: `translateX(${drag.dx}px) rotate(${tiltFor(drag.dx, drag.w, drag.low)}deg)`, transition: "none" } : undefined;
  const status = note
    || (failed ? "" : !photos ? "Loading your queue." : full ? "" : !photo ? "That's every photo in the queue." : `${left} to go. Right adds it, left skips it.`);
  return (
    <div className="theater" role="dialog" aria-modal="true" aria-labelledby="theaterTitle" aria-describedby="theaterStatus">
      <div className="theaterHead">
        <div className="theaterCover">
          <img src={cover.imageUrl} alt="" draggable={false} />
          <span><span id="theaterTitle">Pick from shuffle</span><small>For {displayTitle(cover.title) || "this cover"}</small></span>
        </div>
        <button type="button" className="iconBtn" onClick={onClose} disabled={adding} aria-label="Close without adding"><Icon name="close" /></button>
      </div>
      <div className="theaterStage">
        {failed && <p className="problem" role="alert">{failed}</p>}
        {photo && (
          <div className="theaterCard" style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}>
            <img key={photo.id} src={photo.imageUrl} alt={displayTitle(photo.title) || "A photo from the queue"} draggable={false} />
            {drag && p > 0.2 && (
              <span className={`theaterMark ${drag.dx > 0 ? "keep" : "skip"}`} style={{ opacity: Math.min(1, p) }} aria-hidden="true">
                <Icon name={drag.dx > 0 ? "plus" : "close"} size={44} />
              </span>
            )}
          </div>
        )}
      </div>
      {kept.length > 0 && (
        <div className="theaterKept" aria-label={`${kept.length} kept`}>
          {kept.map((id) => { const it = photos?.find((x) => x.id === id); return it ? <img key={id} src={it.imageUrl} alt="" /> : null; })}
        </div>
      )}
      <p className="hint theaterStatus" id="theaterStatus" role="status" aria-live="polite">{status}</p>
      <div className="theaterButtons">
        <button type="button" className="theaterSkip" disabled={!photo || adding} onClick={() => next(false)} aria-label="Skip this photo"><Icon name="close" size={28} /></button>
        <button ref={doneRef} type="button" className="theaterDone" disabled={adding} onClick={done}>
          {adding ? "Adding" : kept.length ? `Done, add ${kept.length}` : "Done"}
        </button>
        <button type="button" className="theaterKeep" disabled={!photo || adding} onClick={() => next(true)} aria-label="Add this photo"><Icon name="plus" size={28} /></button>
      </div>
    </div>
  );
}
