import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./icons.jsx";
import { hardRefresh } from "./release.js";
import { imageUrlFor, loadImage } from "./CoverCanvas.jsx";
import { aspectLabel, displayTitle, parseSong, spotifyEmbedUrl, symphonyWhy } from "./reviewMath.js";
import { clipNow, clipSource, isSilent, unlockAudio } from "./songs/clipSource.js";
import { symphonyIdOf } from "./songs/songsData.js";

// The top of the review screen: the header row that stays put, the Review deck | Story view switch,
// and the song row.

const LIST_WORDS = { queue: "in queue", approved: "approved", rejected: "passed" };

export function CoverHeader({ list, count, position, total, canUndo, canRedo, onBack, onInfo, onSearch, onUndo, onRedo, locked = false, away = false }) {
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
    <header className={away ? "topbar away" : "topbar"} inert={away ? true : undefined}>
      <button type="button" className="iconBtn" onClick={onBack} disabled={locked} aria-label="All covers"><Icon name="back" /></button>
      <button type="button" className={`queuePill ${list}`} onClick={onBack} disabled={locked} aria-label={`${count} ${LIST_WORDS[list]}. Show all covers`}>
        <span className="pillFace">
          <span className="dot" aria-hidden="true" />
          <span>{count}<span className="pillWords"> {LIST_WORDS[list]}</span></span>
        </span>
      </button>
      <button type="button" className="iconBtn info" onClick={onInfo} disabled={locked} aria-label="Setup and help"><Icon name="info" /></button>
      {/* Search covers by a word or a number (1.33.0, Arjang Nov 26). */}
      <button type="button" className="iconBtn search" onClick={onSearch} disabled={locked} aria-label="Search covers"><Icon name="search" /></button>
      <span className="coverCount" ref={countRef} aria-live="polite">{total ? <><span className="word">Cover </span>{position} of {total}</> : null}</span>
      {/* Undo and redo work with the editor open too (1.13.5), so they follow the stack, not the editor. */}
      <button type="button" className="iconBtn small" onClick={onUndo} disabled={!canUndo} aria-label="Undo"><Icon name="undo" size={22} /></button>
      <button type="button" className="iconBtn small" onClick={onRedo} disabled={!canRedo} aria-label="Redo"><Icon name="redo" size={22} /></button>
      {/* One tap loads the latest version (1.24.0, Arjang #1121). */}
      <button type="button" className="beeBtn" onClick={hardRefresh} aria-label="Refresh to latest version">
        <img src="/brand/ubee-bee-chartreuse.png" alt="" className="bee" />
      </button>
    </header>
  );
}

export function ModeSwitch({ story, setStory, disabled, away = false }) {
  return (
    <div className={away ? "modeSwitch away" : "modeSwitch"} role="tablist" aria-label="View" inert={away ? true : undefined}>
      <button type="button" role="tab" aria-selected={!story} className={!story ? "on" : ""} onClick={() => setStory(false)}>Review deck</button>
      <button type="button" role="tab" aria-selected={story} className={story ? "on" : ""} disabled={disabled} onClick={() => setStory(true)}>Story view</button>
    </div>
  );
}

// The play button works like the original's: with a Spotify link it opens Spotify's own player for this cover's
// song, and she taps play inside it (that keeps iOS happy about audio). Closing it, or moving to another cover,
// removes the player, so playback stops. A song with only a preview plays the preview, as in 1.4. A downloaded song
// (1.11) plays its hook clip from this app, ahead of any Spotify link. With Symphony connected (1.12), the note opens
// the Songs screen for this cover.
export function SongRow({ item, onShuffle, onSetSong, onDraft, onSongs, onPlayer }) {
  const { artist, title } = parseSong(item.song);
  // A Symphony clip plays from the address the server gives for it (1.13.2): asked for as soon as the cover shows,
  // and read again on every tap, so an address that expires is asked for again.
  const symId = symphonyIdOf(item.songFile);
  const tap = useRef(0); // the latest tap: an address that comes back after another tap, or another cover, doesn't start
  const clip = item.songFile && item.songPreviewUrl ? item.songPreviewUrl : "";
  const embed = clip ? "" : spotifyEmbedUrl(item.songSpotifyUrl);
  const preview = clip || item.songPreviewUrl;
  const [playing, setPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.song || "");
  const verified = symphonyWhy(item);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyRef = useRef(null);
  useEffect(() => { setWhyOpen(false); }, [item.id, item.song]);
  useEffect(() => {
    if (!whyOpen) return undefined;
    const away = (e) => { if (whyRef.current && !whyRef.current.contains(e.target)) setWhyOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setWhyOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [whyOpen]);
  const audio = useRef(null);
  // The photo's ratio beside its number (1.29.0, Quill #1212), from the photo's own pixels.
  const [ratio, setRatio] = useState("");
  useEffect(() => {
    let alive = true;
    setRatio("");
    loadImage(imageUrlFor(item)).then((img) => { if (alive) setRatio(aspectLabel(img.naturalWidth, img.naturalHeight)); }).catch(() => {});
    return () => { alive = false; };
  }, [item.id, item.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    tap.current += 1;
    setPlaying(false);
    setPlayerOpen(false);
    setEditing(false);
    setText(item.song || "");
    audio.current?.pause();
  }, [item.id, item.song, item.songSpotifyUrl, item.songPreviewUrl]);

  useEffect(() => {
    if (symId) clipSource(symId);
  }, [symId]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (symId) {
      const mine = ++tap.current;
      const go = (u) => {
        if (mine !== tap.current) return;
        if (!u) { setPlaying(false); return; }
        if (a.src !== new URL(u, window.location.href).href) a.src = u;
        a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      };
      const now = clipNow(symId);
      if (now) go(now); else { unlockAudio(a); clipSource(symId).then(go); }
      return;
    }
    if (isSilent(a)) a.src = preview;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  const shown = Boolean(embed && playerOpen);
  // 1.14.1 (Arjang #790 item 3): the card opens right above the song row, over the space the header and the view switch
  // leave as they move up. Nothing in the page's flow changes, so the cover never moves and the page never scrolls.
  useEffect(() => { onPlayer?.(shown); }, [shown, onPlayer]);
  useEffect(() => () => onPlayer?.(false), [onPlayer]);
  return (
    <div className="songWrap" ref={whyRef}>
    {verified && whyOpen && (
      <div className="symWhy" id={`symwhy-${item.id}`} role="region" aria-label="Why Symphony picked this song">
        <div className="symWhyHead">
          <Icon name="shieldCheck" size={18} />
          <strong>Picked by Symphony</strong>
          <button type="button" className="iconBtn symWhyClose" onClick={() => setWhyOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <p className="symWhyText">{verified.text}</p>
        <p className="symWhyFoot">For {verified.song}{verified.recordedAt ? ` · ${new Date(verified.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</p>
      </div>
    )}
    {shown && (
      <iframe key={`${item.id}-${embed}`} className="spotifyEmbed" src={embed} title={`Spotify player for ${item.song || "this song"}`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
    )}
    <div className="songRow">
      <div className="songMeta">
        <strong className="songOwner">{displayTitle(item.title)}{ratio && <span className="ratioTag"> {ratio}</span>}</strong>
        {editing ? (
          <form className="songEdit" onSubmit={(e) => { e.preventDefault(); onSetSong(text.trim()); setEditing(false); }}>
            <input className="field" value={text} onChange={(e) => { setText(e.target.value); onDraft?.(e.target.value); }} placeholder="Artist - Song" aria-label="Song, as Artist - Song" autoFocus />
            <button type="submit" className="linkBtn">Save</button>
          </form>
        ) : (
          <div className="songLineRow">
            <button type="button" className="songLine" onClick={() => setEditing(true)} aria-label={`Song: ${item.song || "none yet"}. Tap to change it`}>
              {item.song ? <>{artist && <>{artist} · </>}<span className="u">{title}</span></> : <span>No song yet. Tap shuffle or type one.</span>}
            </button>
            {verified && (
              <button type="button" className={whyOpen ? "symBadge open" : "symBadge"} onClick={() => setWhyOpen((o) => !o)}
                aria-expanded={whyOpen} aria-controls={`symwhy-${item.id}`} aria-label="Symphony picked this song. Show why">
                <Icon name="shieldCheck" size={18} />
              </button>
            )}
          </div>
        )}
      </div>
      {embed ? (
        <button type="button" className={playerOpen ? "playBtn open" : "playBtn"} onClick={() => setPlayerOpen((o) => !o)} aria-expanded={playerOpen}
          aria-label={playerOpen ? "Close the Spotify player" : "Play the song on Spotify"}><Icon name={playerOpen ? "pause" : "play"} size={26} /></button>
      ) : preview ? (
        <>
          <button type="button" className="playBtn" onClick={toggle}
            aria-label={clip ? (playing ? "Pause the hook" : "Play the hook") : (playing ? "Pause the song preview" : "Play the song preview")}><Icon name={playing ? "pause" : "play"} size={26} /></button>
          <audio ref={audio} src={symId ? undefined : preview} preload="none" onEnded={() => setPlaying(false)} />
        </>
      ) : null}
      {onSongs && <button type="button" className="iconBtn" onClick={onSongs} aria-label="Pick a song from Symphony"><Icon name="note" /></button>}
      <button type="button" className="iconBtn" onClick={onShuffle} aria-label="Shuffle the song"><Icon name="shuffle" /></button>
    </div>
    </div>
  );
}
