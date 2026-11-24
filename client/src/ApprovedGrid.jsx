import { useState } from "react";
import { badgeFor, selectable } from "./pollenView.js";

// Approved covers as a grid, like the Photos app. Select lets her check covers and schedule them with
// Pollen. Covers already with Pollen show where they stand and can't be picked again.
export default function ApprovedGrid({ items, pollenOn, onOpen, onSchedule, tile = null }) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState([]);
  const stop = () => { setSelecting(false); setPicked([]); };

  function tap(item) {
    if (!selecting) return onOpen(item);
    if (!selectable(item)) return;
    setPicked((p) => (p.includes(item.id) ? p.filter((x) => x !== item.id) : [...p, item.id]));
  }

  return (
    <div className={selecting ? "approved selecting" : "approved"}>
      <div className="row spread gridHead">
        <span className="hint">{selecting ? "Tap covers to pick them" : `${items.length} approved${pollenOn ? "" : ". Tap one to open it."}`}</span>
        {pollenOn && <button className="ghost" onClick={() => (selecting ? stop() : setSelecting(true))}>{selecting ? "Cancel" : "Select"}</button>}
      </div>
      <div className="approvedGrid">
        {items.map((item) => {
          const badge = badgeFor(item.pollen);
          const checked = picked.includes(item.id);
          const locked = !selectable(item);
          return (
            <button key={item.id} type="button" data-id={item.id} onClick={() => tap(item)}
              className={["tile", checked && "checked", selecting && locked && "locked"].filter(Boolean).join(" ")}
              aria-pressed={selecting ? checked : undefined} aria-label={item.title} title={badge?.why || item.title}>
              {tile ? tile(item) : <img src={item.imageUrl} alt="" loading="lazy" draggable={false} />}
              {selecting && !locked && <span className={checked ? "check on" : "check"} aria-hidden="true" />}
              {badge && (
                <span className={`badge ${badge.tone}`}>
                  {badge.detail ? <><span className="badgeLabel">{badge.label}</span> {badge.detail}</> : badge.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selecting && (
        <div className="selectBar">
          <span>{picked.length} selected</span>
          <button disabled={!picked.length} onClick={() => onSchedule(picked, stop)}>Schedule with Pollen</button>
        </div>
      )}
    </div>
  );
}
