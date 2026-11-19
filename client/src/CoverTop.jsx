import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./icons.jsx";
import { displayTitle, parseSong, spotifyEmbedUrl } from "./reviewMath.js";

// The top of the review screen: the header row that stays put, the Review deck | Story view switch,
// and the song row.

const LIST_WORDS = { queue: "in queue", approved: "approved", rejected: "passed" };

export function CoverHeader({ list, count, position, total, canUndo, canRedo, onBack, onInfo, onUndo, onRedo, locked = false }) {
  // "Cover 12 of 172" when it fits, "12 of 172" when the row is tight.
  const countRef = useRef(null);
  useLayoutEffect(() => {
    const el = countRef.current;
    if (!el) return undefined;
    const fit = () => {
      el.classList.remove("short");
      if (el.scrollWidth > el.clientWidth) el.classList.add("short");
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [position, total, count, list]);
  return (
    <header className="topbar">
      <button type="button" className="iconBtn" onClick={onBack} disabled={locked} aria-label="All covers"><Icon name="back" /></button>
      <button type="button" className={`queuePill ${list}`} onClick={onBack} disabled={locked} aria-label={`${count} ${LIST_WORDS[list]}. Show all covers`}>
        <span className="pillFace">
          <span className="dot" aria-hidden="true" />
          <span>{count}<span className="pillWords"> {LIST_WORDS[list]}</span></span>
        </span>
      </button>
      <button type="button" className="iconBtn info" onClick={onInfo} disabled={locked} aria-label="Setup and help"><Icon name="info" /></button>
      <span className="coverCount" ref={countRef} aria-live="polite">{total ? <><span className="word">Cover </span>{position} of {total}</> : null}</span>
      <button type="button" className="iconBtn small" onClick={onUndo} disabled={locked || !canUndo} aria-label="Undo"><Icon name="undo" size={22} /></button>
      <button type="button" className="iconBtn small" onClick={onRedo} disabled={locked || !canRedo} aria-label="Redo"><Icon name="redo" size={22} /></button>
      <img src="/brand/ubee-bee-chartreuse.png" alt="uBee" className="bee" />
    </header>
  );
}

export function ModeSwitch({ story, setStory, disabled }) {
  return (
    <div className="modeSwitch" role="tablist" aria-label="View">
      <button type="button" role="tab" aria-selected={!story} className={!story ? "on" : ""} onClick={() => setStory(false)}>Review deck</button>
      <button type="button" role="tab" aria-selected={story} className={story ? "on" : ""} disabled={disabled} onClick={() => setStory(true)}>Story view</button>
    </div>
  );
}

// The play button works like the original's: with a Spotify link it opens Spotify's own player for this cover's
// song, and she taps play inside it (that keeps iOS happy about audio). Closing it, or moving to another cover,
// removes the player, so playback stops. A song with only a preview plays the preview, as in 1.4.
export function SongRow({ item, onShuffle, onSetSong, onDraft }) {
  const { artist, title } = parseSong(item.song);
  const embed = spotifyEmbedUrl(item.songSpotifyUrl);
  const [playing, setPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.song || "");
  const audio = useRef(null);
  useEffect(() => {
    setPlaying(false);
    setPlayerOpen(false);
    setEditing(false);
    setText(item.song || "");
    audio.current?.pause();
  }, [item.id, item.song, item.songSpotifyUrl]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  return (
    <>
    <div className="songRow">
      <div className="songMeta">
        <strong className="songOwner">{displayTitle(item.title)}</strong>
        {editing ? (
          <form className="songEdit" onSubmit={(e) => { e.preventDefault(); onSetSong(text.trim()); setEditing(false); }}>
            <input className="field" value={text} onChange={(e) => { setText(e.target.value); onDraft?.(e.target.value); }} placeholder="Artist - Song" aria-label="Song, as Artist - Song" autoFocus />
            <button type="submit" className="linkBtn">Save</button>
          </form>
        ) : (
          <button type="button" className="songLine" onClick={() => setEditing(true)} aria-label={`Song: ${item.song || "none yet"}. Tap to change it`}>
            {item.song ? <>{artist && <>{artist} · </>}<span className="u">{title}</span></> : <span>No song yet. Tap shuffle or type one.</span>}
          </button>
        )}
      </div>
      {embed ? (
        <button type="button" className={playerOpen ? "playBtn open" : "playBtn"} onClick={() => setPlayerOpen((o) => !o)} aria-expanded={playerOpen}
          aria-label={playerOpen ? "Close the Spotify player" : "Play the song on Spotify"}><Icon name={playerOpen ? "pause" : "play"} size={26} /></button>
      ) : item.songPreviewUrl ? (
        <>
          <button type="button" className="playBtn" onClick={toggle} aria-label={playing ? "Pause the song preview" : "Play the song preview"}><Icon name={playing ? "pause" : "play"} size={26} /></button>
          <audio ref={audio} src={item.songPreviewUrl} preload="none" onEnded={() => setPlaying(false)} />
        </>
      ) : null}
      <button type="button" className="iconBtn" onClick={onShuffle} aria-label="Shuffle the song"><Icon name="shuffle" /></button>
    </div>
    {embed && playerOpen && (
      <iframe key={`${item.id}-${embed}`} className="spotifyEmbed" src={embed} title={`Spotify player for ${item.song || "this song"}`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
    )}
    </>
  );
}
