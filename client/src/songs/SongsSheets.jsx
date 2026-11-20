import Icon from "../icons.jsx";
import { Art } from "./SongsRow.jsx";
import { canUse } from "./songsData.js";

// The share sheet, Spotify's cut to what Cover Review needs: Use on this cover (when opened from a cover), Save and Hide
// (1.15.0, hers only), copy the hook time, and open the song elsewhere.

export function ShareSheet({ song, forCover, used, saved, hidden, onClose, onUse, onSave, onHide, onCopy }) {
  const open = (url) => () => window.open(url, "_blank", "noreferrer");
  const targets = [
    forCover && { name: used ? "On this cover" : "Use on this cover", icon: used ? "check" : "plusCircle", fn: () => onUse(song), off: used || !canUse(song), use: true },
    { name: saved ? "Remove from Saved" : "Save", icon: "heart", filled: saved, fn: () => onSave(!saved) },
    { name: hidden ? "Unhide" : "Hide", icon: "minusCircle", fn: () => onHide(!hidden) },
    { name: "Copy hook time", icon: "copy", fn: onCopy, off: !song.hook },
    song.watch && { name: "YouTube", icon: "video", fn: open(song.watch) },
    song.links?.spotify && { name: "Spotify", icon: "external", fn: open(song.links.spotify) },
    song.links?.apple && { name: "Apple Music", icon: "external", fn: open(song.links.apple) },
  ].filter(Boolean);
  return (
    <div className="symSheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="symSheet" role="dialog" aria-modal="true" aria-label="Share">
        <span className="symHandle" aria-hidden="true" />
        <div className="symShareCard">
          <Art src={song.artwork} size={64} />
          <span className="symRowText"><span className="symRowTitle">{song.title}</span><span className="symRowSub">{song.artist}{song.hook ? ` · Hook ${song.hook.label}` : ""}</span></span>
        </div>
        <div className="symTargets">
          {targets.map((t) => (
            <button type="button" key={t.name} className={`symTarget${t.use ? " use" : ""}`} disabled={Boolean(t.off)} onClick={() => { t.fn(); onClose(); }}>
              <span className="symTargetIcon"><Icon name={t.icon} size={24} filled={Boolean(t.filled)} /></span><span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
