import Icon from "../icons.jsx";
import { statusLine } from "./songsData.js";

// A song in a list, Spotify style: artwork, title (green while it plays), one gray line under it. A green mark shows a
// song with a hook clip ready to play, and a heart one she saved (1.15.0). In Library's Hidden list, Unhide takes the
// place of the details button.

export function Art({ src, size = 56, round = 4 }) {
  return src
    ? <img className="symArt" src={src} alt="" loading="lazy" draggable={false} style={{ width: size, height: size, borderRadius: round }} />
    : <span className="symArt symNoArt" style={{ width: size, height: size, borderRadius: round }}><Icon name="note" size={Math.round(size * 0.4)} /></span>;
}

export default function SongsRow({ s, active, line, saved, onPlay, onOpen, onUnhide }) {
  return (
    <li className={`symRow${active ? " active" : ""}`}>
      <button type="button" className="symRowMain" onClick={() => (s.hook ? onPlay(s) : onOpen(s.id))}
        aria-label={s.hook ? `Play the hook of ${s.title} by ${s.artist}` : `Open ${s.title} by ${s.artist}`}>
        <Art src={s.artwork} />
        <span className="symRowText">
          <span className="symRowTitle">{s.title}</span>
          <span className="symRowSub">
            {saved && <Icon name="heart" size={14} filled className="symSavedMark" label="Saved" />}
            {s.clips?.[0] && <Icon name="clip" size={14} className="symClipMark" label="Hook clip ready" />}
            {line || <>{s.artist} · {statusLine(s)}</>}
          </span>
        </span>
      </button>
      {onUnhide
        ? <button type="button" className="symUnhide" onClick={() => onUnhide(s)} aria-label={`Unhide ${s.title}`}>Unhide</button>
        : (
          <button type="button" className="symRowMore" onClick={() => onOpen(s.id)} aria-label={`Details for ${s.title}`}>
            <Icon name="more" size={22} />
          </button>
        )}
    </li>
  );
}
