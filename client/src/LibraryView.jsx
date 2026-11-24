import ApprovedGrid from "./ApprovedGrid.jsx";
import Icon from "./icons.jsx";
import { quoteShown } from "./quoteOverlay.js";
import { withLook } from "./renderCover.js";
import { displayTitle } from "./reviewMath.js";
import TileCover from "./TileCover.jsx";

// All covers, behind the back arrow: Queue, Approved and Passed as grids. Approved keeps Select and
// Schedule with Pollen. Tapping a cover opens it.

const TABS = [["queue", "Queue"], ["approved", "Approved"], ["rejected", "Passed"]];

export default function LibraryView({ list, setList, items, counts, pollenOn, onOpen, onSchedule, onUpload, onClose, canClose, onSongs,
  look = null, quoteOverlay = null, quotesUnlocked = false }) {
  // Each preview shows its text the way its cover does (1.20.0, Big Edit item 19): the overlay rule, and the queue's look.
  const tile = (item) => {
    const it = withLook(item, look);
    return <TileCover item={it} quoteOn={Boolean(quoteShown(it, quoteOverlay) && quotesUnlocked)} />;
  };
  return (
    <section className="library" aria-label="All covers">
      <header className="libraryHead">
        {canClose
          ? <button type="button" className="iconBtn" onClick={onClose} aria-label="Back to the cover"><Icon name="back" /></button>
          : <span className="iconBtn" aria-hidden="true" />}
        <h1>Covers</h1>
        {onSongs && <button type="button" className="iconBtn" onClick={onSongs} aria-label="Songs from Symphony"><Icon name="note" /></button>}
        <label className="addPhotos">
          <Icon name="photoAdd" size={20} /> Add photos
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; if (files.length) onUpload(files); }} />
        </label>
      </header>
      <div className="modeSwitch three" role="tablist" aria-label="Which covers">
        {TABS.map(([id, name]) => (
          <button type="button" key={id} role="tab" aria-selected={list === id} className={list === id ? "on" : ""} onClick={() => setList(id)}>
            {name}{counts ? ` (${counts[id] ?? 0})` : ""}
          </button>
        ))}
      </div>
      {!items.length && (
        <div className="emptyState">
          <p>{list === "queue" ? "Nothing to review right now." : list === "approved" ? "No approved covers yet." : "Nothing passed yet."}</p>
          {list === "queue" && <p className="hint">Add photos here, or ask your Muse to bring in your Drive photos. No connectors needed.</p>}
        </div>
      )}
      {items.length > 0 && (list === "approved" ? (
        <ApprovedGrid items={items} pollenOn={pollenOn} onOpen={onOpen} onSchedule={onSchedule} tile={tile} />
      ) : (
        <div className="approvedGrid">
          {items.map((item) => (
            <button type="button" key={item.id} data-id={item.id} className="tile" onClick={() => onOpen(item)} aria-label={`Open ${displayTitle(item.title)}`}>
              {tile(item)}
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}
