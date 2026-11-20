import Icon from "../icons.jsx";
import { useArtColor } from "./artColor.js";
import { Art } from "./SongsRow.jsx";
import { canUse, clock, moveText, partsOf, replayPath } from "./songsData.js";

// The mini player above the tabs and the song screen it opens, both after Spotify's. What plays is always a part of
// the song: the hook first, then the other popular parts. Opened from a cover, both carry Use on this cover.

function UseButton({ song, used, onUse, size }) {
  return (
    <button type="button" className={`iconBtn symUse${used ? " on" : ""}`} onClick={() => onUse(song)} disabled={used || !canUse(song)}
      aria-label={used ? "On this cover" : canUse(song) ? "Use on this cover" : "No hook clip to use yet"}>
      <Icon name={used ? "checkCircle" : "plusCircle"} size={size} />
    </button>
  );
}

export function MiniPlayer({ np, playing, progress, forCover, used, onToggle, onOpen, onUse }) {
  const color = useArtColor(np.song.artwork);
  return (
    <div className="symMini" style={{ "--tint": color }}>
      <button type="button" className="symMiniMain" onClick={onOpen} aria-label={`Open ${np.song.title}`}>
        <Art src={np.song.artwork} size={40} />
        <span className="symMiniText">
          <span className="symMiniTitle">{np.song.title} <span className="symMiniArtist">· {np.song.artist}</span></span>
          <span className="symMiniPart">{np.label}</span>
        </span>
      </button>
      {forCover && <UseButton song={np.song} used={used} onUse={onUse} size={26} />}
      <button type="button" className="iconBtn" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} size={26} /></button>
      <span className="symMiniProgress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
    </div>
  );
}

/** The song as one track: the replay graph faintly above, the hook in green, the other parts in white. */
function Scrubber({ song, at, onSeek }) {
  const d = song.durationSec || Math.max(1, ...partsOf(song).map((p) => p.end));
  const pct = (t) => `${Math.max(0, Math.min(100, (t / d) * 100))}%`;
  const parts = partsOf(song);
  const graph = replayPath(song.replay);
  return (
    <div className="symScrub">
      {graph && (
        <svg className="symScrubGraph" viewBox={`0 0 ${song.replay.length} 10`} preserveAspectRatio="none" aria-hidden="true"><path d={graph} /></svg>
      )}
      <button type="button" className="symScrubTrack" aria-label="Play from this point"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * d); }}>
        {parts.slice(1).map((p) => <span key={p.start} className="symScrubPart" style={{ left: pct(p.start), width: `calc(${pct(p.end)} - ${pct(p.start)})` }} />)}
        {song.hook && <span className="symScrubHook" style={{ left: pct(song.hook.start), width: `calc(${pct(song.hook.end)} - ${pct(song.hook.start)})` }} />}
        {at != null && <span className="symScrubKnob" style={{ left: pct(at) }} />}
      </button>
      <div className="symScrubTimes"><span>{clock(at ?? song.hook?.start ?? 0)}</span><span>{clock(d)}</span></div>
    </div>
  );
}

const APPS = [
  ["apple", "Apple Music", "The start the label chose. Distributors send TikTok the same one."],
  ["deezer", "Deezer", "Deezer's own 30 second preview."],
  ["spotify", "Spotify", "Spotify's 30 second preview."],
];
const CHART = { shazam: "Shazam", spotify: "Spotify", apple: "Apple Music", itunes: "iTunes", youtube: "YouTube" };
const LEVEL = { high: "Signals agree", medium: "One signal", low: "Lyrics only" };

function Check({ ok, name, note }) {
  return (
    <li className="symCredit">
      <span className={`symDot${ok ? " ok" : ""}`}>{ok ? <Icon name="check" size={16} /> : null}</span>
      <span className="symCreditText"><span className="symCreditName">{name}</span>{note && <span className="symCreditRole">{note}</span>}</span>
    </li>
  );
}

export function NowPlaying({ song, np, playing, at, from, forCover, used, onClose, onToggle, onPart, onSeek, onPlayRange, onShare, onUse }) {
  const color = useArtColor(song.artwork);
  const h = song.hook;
  const parts = partsOf(song);
  const mine = np?.id === song.id;
  const today = Object.entries(song.today || {}).sort((a, b) => a[1].rank - b[1].rank);
  const sig = song.depth?.signals || {};
  return (
    <div className="symNp" role="dialog" aria-modal="true" aria-label={`${song.title} by ${song.artist}`} style={{ "--tint": color }}>
      <header className="symNpHead">
        <button type="button" className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="collapse" size={28} /></button>
        <span className="symNpFrom">{from}</span>
        <button type="button" className="iconBtn" onClick={onShare} aria-label="Share"><Icon name="more" size={26} /></button>
      </header>
      <div className="symNpArt">{song.artwork ? <img src={song.artwork} alt={`${song.title} artwork`} /> : <span className="symArt symNoArt"><Icon name="note" size={64} /></span>}</div>
      <div className="symNpTitleRow">
        <div className="symNpTitles"><h1>{song.title}</h1><p>{song.artist}</p></div>
        {forCover && <UseButton song={song} used={used} onUse={onUse} size={30} />}
      </div>
      <Scrubber song={song} at={mine ? at : null} onSeek={onSeek} />
      <div className="symNpControls">
        <span className="iconBtn" aria-hidden="true" />
        <button type="button" className="iconBtn" onClick={() => onPart(-1)} disabled={parts.length < 2} aria-label="Previous popular part"><Icon name="prev" size={30} /></button>
        <button type="button" className="symNpPlay" onClick={onToggle} disabled={!h} aria-label={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} size={30} /></button>
        <button type="button" className="iconBtn" onClick={() => onPart(1)} disabled={parts.length < 2} aria-label="Next popular part"><Icon name="next" size={30} /></button>
        <span className="iconBtn" aria-hidden="true" />
      </div>
      <p className="symNpPartLine">{h ? `${mine ? np.label : `Hook ${h.label}`}${LEVEL[h.level] ? ` · ${LEVEL[h.level]}` : ""}` : song.error ? `Not found: ${song.error}` : "Not measured yet"}</p>
      {forCover && (
        <div className="symUseRow">
          <button type="button" className="symUseBtn" onClick={() => onUse(song)} disabled={used || !canUse(song)}>
            {used ? <><Icon name="check" size={20} /> On this cover</> : canUse(song) ? "Use on this cover" : "No hook clip to use yet"}
          </button>
        </div>
      )}
      {song.watch && (
        <div className="symNpExtras">
          <a className="symPill symYtPill" href={song.watch} target="_blank" rel="noreferrer">
            <Icon name="video" size={20} />{song.links?.youtube ? "Watch on YouTube" : "Find on YouTube"}
          </a>
        </div>
      )}

      {h?.lines?.length > 0 && (
        <section className="symCard lyrics">
          <h2>Hook lyrics</h2>
          {h.lines.map((l, i) => <p key={i}>{l}</p>)}
        </section>
      )}

      <section className="symCard">
        <h2>Where each app starts</h2>
        <ul className="symCredits">
          {APPS.map(([k, name, note]) => {
            const start = song.previewStart?.[k];
            return (
              <li className="symCredit" key={k}>
                <span className="symCreditText"><span className="symCreditName">{name}</span><span className="symCreditRole">{start != null ? note : "No preview"}</span></span>
                {start != null && <button type="button" className="symPill" onClick={() => onPlayRange(start, start + 29)}>{clock(start)}</button>}
              </li>
            );
          })}
          <li className="symCredit">
            <span className="symCreditText"><span className="symCreditName">YouTube most replayed</span>
              <span className="symCreditRole">{song.replayPeak != null ? "Where viewers rewind to" : "Shows once a video has enough views"}</span></span>
            {song.replayPeak != null && <button type="button" className="symPill" onClick={() => onPlayRange(song.replayPeak, song.replayPeak + 15)}>{clock(song.replayPeak)}</button>}
          </li>
          <li className="symCredit">
            <span className="symCreditText"><span className="symCreditName">TikTok and Instagram</span>
              <span className="symCreditRole">Not published. TikTok plays the label's clip, usually from Apple Music's start.</span></span>
          </li>
        </ul>
      </section>

      {parts.length > 1 && (
        <section className="symCard">
          <h2>Popular parts</h2>
          <ul className="symCredits">
            {parts.map((p, i) => (
              <li className="symCredit" key={p.start}>
                <span className="symCreditText"><span className="symCreditName">{clock(p.start)} to {clock(p.end)}</span><span className="symCreditRole">{i === 0 ? "The hook" : `Part ${i + 1}`}</span></span>
                <button type="button" className="symPill" onClick={() => onPlayRange(p.start, p.end)}>Play</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {today.length > 0 && (
        <section className="symCard">
          <h2>US charts today</h2>
          <ul className="symCredits">
            {today.map(([k, v]) => (
              <li className="symCredit" key={k}><span className="symCreditText"><span className="symCreditName">{CHART[k] || k} #{v.rank}</span>
                <span className="symCreditRole">{moveText(v.move)}</span></span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="symCard">
        <h2>Data behind it {song.depth ? <span className="symCardCount">{song.depth.score} of {song.depth.max}</span> : null}</h2>
        <ul className="symCredits">
          <Check ok={sig.applePreview} name="Apple Music preview placed" />
          <Check ok={sig.deezerPreview} name="Deezer preview placed" />
          <Check ok={sig.spotifyPreview} name="Spotify preview placed" />
          <Check ok={sig.replayGraph} name="YouTube replay graph" />
          <Check ok={sig.lyrics} name="Synced lyrics" />
          <Check ok={sig.chorus} name="Chorus found" note={song.chorusCount ? `Sung ${song.chorusCount} times` : null} />
          <Check ok={sig.charted} name="On a US chart" />
          <Check ok={sig.bigAudience} name="Big audience" note={song.views ? `${Number(song.views).toLocaleString()} YouTube views` : null} />
        </ul>
      </section>

      <div className="symOpenIn">
        {song.links?.apple && <a className="symPill" href={song.links.apple} target="_blank" rel="noreferrer">Apple Music</a>}
        {song.links?.spotify && <a className="symPill" href={song.links.spotify} target="_blank" rel="noreferrer">Spotify</a>}
      </div>
    </div>
  );
}
