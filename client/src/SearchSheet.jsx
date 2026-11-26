import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { imageUrlFor } from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";

const LIST_NAMES = { queue: "In queue", approved: "Approved", rejected: "Passed" };

// Search covers (1.33.0, Arjang Nov 26): a word from the photo's description and the rest (wisteria, bike, sunset), or
// a cover's number (003, 046, 277). Every list is searched; tapping a cover opens it.
export default function SearchSheet({ onPick, onClose }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null); // null until a search answers
  const input = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    input.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setFound(null); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await api(`/api/items/search?q=${encodeURIComponent(term)}`);
        if (alive) setFound(Array.isArray(r?.items) ? r.items : []);
      } catch {
        if (alive) setFound([]);
      }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet searchSheet" role="dialog" aria-modal="true" aria-labelledby="searchTitle">
        <div className="sheetHead">
          <h2 id="searchTitle">Search covers</h2>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <input ref={input} className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="A word like wisteria, or a number like 046" aria-label="Search by a word or a cover number" />
        {found && (found.length ? (
          <ul className="searchResults" aria-label="Covers found">
            {found.map((it) => (
              <li key={it.id}>
                <button type="button" className="searchHit" onClick={() => onPick(it)}>
                  <img src={imageUrlFor(it)} alt="" loading="lazy" />
                  <span className="searchWords">
                    <span className="searchId">#{String(it.id).padStart(3, "0")} · {LIST_NAMES[it.status] || it.status}</span>
                    <span className="searchLine">{it.description || it.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="hint">No covers match &ldquo;{q.trim()}&rdquo;.</p>)}
      </div>
    </div>
  );
}
