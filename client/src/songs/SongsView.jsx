import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "../icons.jsx";
import { clipNow, clipSource, isSilent, unlockAudio } from "./clipSource.js";
import { MiniPlayer, NowPlaying } from "./SongsPlayer.jsx";
import { ShareSheet } from "./SongsSheets.jsx";
import { HotTab, LibraryTab, SearchTab, TabBar } from "./SongsTabs.jsx";
import { hotList, librarySorted, onCover, partLabel, partsOf, searchSongs, sourceFor, topGenres } from "./songsData.js";
import "./songs.css";

// The Songs screen (1.12): Symphony's screens inside Cover Review, in Spotify's hierarchy (Arjang #483). The songs
// come from GET /api/symphony, which this app's server reads with the space's Symphony code. Tap a song and its hook
// plays in the mini player; tap the mini player for the song screen. One audio element plays clips of the song's
// popular parts, or the app preview that covers a moment, and stops at the end of the part. Opened from a cover's
// song row, Use on this cover gives that cover the song with its hook clip, as one step undo can take back.

const FROM = { hot: "Playing from New hot", library: "Playing from Library", search: "Playing from Search" };
const LIBRARY_ROWS = 200;

export default function SongsView({ forCover, closeLabel, onClose, onUse }) {
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState(null);
  const [tab, setTab] = useState("hot");
  const [genre, setGenre] = useState(null);
  const [sort, setSort] = useState("data");
  const [q, setQ] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [np, setNp] = useState(null); // what's loaded in the player
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(null);
  const audio = useRef(null);
  const toastTimer = useRef(null);
  const finished = useRef(null);
  const ticket = useRef(0); // the latest play request: a clip address that comes back after a newer tap doesn't start

  // A message at the bottom. With an action (a link), it stays longer so there's time to tap it.
  const say = useCallback((text, action = null) => {
    setToast({ text, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 2600);
  }, []);

  useEffect(() => {
    let live = true;
    const el = audio.current;
    window.scrollTo(0, 0);
    api("/api/symphony").then((d) => {
      if (!live) return;
      setData(d);
      if (d.connected && d.message) say(d.message);
    }).catch((e) => { if (live) setProblem(e.message); });
    return () => { live = false; ticket.current += 1; el?.pause(); clearTimeout(toastTimer.current); };
  }, [say]);

  const songs = useMemo(() => data?.songs || [], [data]);
  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const hotRows = useMemo(() => hotList(data), [data]);
  const genres = useMemo(() => topGenres(songs), [songs]);
  const library = useMemo(() => librarySorted(genre ? songs.filter((s) => s.genre === genre) : songs, sort), [songs, genre, sort]);
  const found = useMemo(() => searchSongs(songs, q), [songs, q]);
  const detail = openId ? byId.get(openId) || null : null;

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (sheet) setSheet(false); else if (openId) setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, openId]);

  const stop = () => { ticket.current += 1; audio.current?.pause(); setPlaying(false); };
  const youtube = (s) => (s.watch ? { label: s.links?.youtube ? "Watch on YouTube" : "Find on YouTube", href: s.watch } : null);

  const playRange = useCallback((s, from, to, queue = null) => {
    const src = sourceFor(s, from, to);
    if (!src) { say("This part has no clip yet.", youtube(s)); return false; }
    const a = audio.current;
    const mine = ++ticket.current;
    const start = (url) => {
      if (mine !== ticket.current) return;
      if (!url) { a.pause(); setPlaying(false); say("That audio didn't load.", youtube(s)); return; }
      a.src = url;
      a.currentTime = src.at;
      a.play().then(() => setPlaying(true)).catch(() => say("That audio didn't load.", youtube(s)));
    };
    // A clip plays from the address the server gives for it (1.13.2). Until that's known, the tap starts a silent sound.
    if (!src.clip) start(src.url);
    else if (clipNow(src.clip.id, src.clip.part)) start(clipNow(src.clip.id, src.clip.part));
    else { unlockAudio(a); clipSource(src.clip.id, src.clip.part).then(start); }
    const { idx, label } = partLabel(s, from, to);
    setNp({ id: s.id, song: s, part: idx, from, to, songStart: src.songStart, label, queue, clip: src.clip || null });
    setAt(from);
    return true;
  }, [say]);

  const playSong = (s, queue = null) => { const p = partsOf(s)[0]; if (p) playRange(s, p.start, p.end, queue); };
  const onRowPlay = (s) => (np?.id === s.id && playing ? stop() : playSong(s));
  const playAll = () => {
    const ids = hotRows.filter((r) => r.hook).map((r) => r.id);
    if (ids.length) playSong(byId.get(ids[0]), ids);
  };

  // The end of the part, by the clock or by the clip running out: stop, and with Play all go on to the next hook.
  function finish() {
    if (!np || finished.current === np || isSilent(audio.current)) return;
    finished.current = np;
    stop();
    if (np.queue) {
      const next = byId.get(np.queue[np.queue.indexOf(np.id) + 1]);
      if (next) playSong(next, np.queue);
    }
  }
  const onTime = () => {
    const a = audio.current;
    if (!np || !a || isSilent(a)) return;
    const t = np.songStart + a.currentTime;
    setAt(t);
    if (t >= np.to) finish();
  };

  const toggle = () => {
    if (playing) { stop(); return; }
    const s = detail || np?.song;
    if (np && s && np.id === s.id && at != null && at < np.to - 0.3 && !isSilent(audio.current)) {
      // Resume where it stopped while the loaded address is still good. Once it has expired, the part starts again
      // from where it began, on a fresh address.
      const good = np.clip ? clipNow(np.clip.id, np.clip.part) : null;
      if (!np.clip || (good && audio.current.src === new URL(good, window.location.href).href)) {
        audio.current.play().then(() => setPlaying(true)).catch(() => {});
        return;
      }
      if (playRange(s, np.from, np.to, np.queue)) return;
    }
    if (s) playSong(s);
  };
  const step = (dir) => {
    const s = detail || np?.song;
    const parts = partsOf(s);
    if (!parts.length) return;
    const cur = np?.id === s.id ? np.part : 0;
    const p = parts[(cur + dir + parts.length) % parts.length];
    playRange(s, p.start, p.end);
  };
  const use = (s) => { stop(); onUse(s); };
  const copy = (s) => {
    if (!s.hook) return;
    const done = () => say(`Copied ${s.hook.label}.`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(s.hook.label).then(done, () => say(`Hook ${s.hook.label}.`));
    else say(`Hook ${s.hook.label}.`);
  };

  // The player stays put across loading and the tabs, so leaving the screen always stops it.
  const player = <audio ref={audio} onTimeUpdate={onTime} onEnded={finish} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} preload="none" />;
  const back = (
    <header className="symTabHead">
      <button type="button" className="iconBtn" onClick={onClose} aria-label={closeLabel}><Icon name="back" /></button>
    </header>
  );
  if (!data || !data.connected) {
    return (
      <section className="symView" aria-label="Songs">
        {player}
        {back}
        <p className="symEmpty" role="status">
          {problem || (data ? data.message || "Symphony isn't connected. Ask your Muse to connect it with the code uBee gave you." : "Getting Symphony's songs.")}
        </p>
      </section>
    );
  }

  const progress = np ? Math.max(0, Math.min(1, ((at ?? np.from) - np.from) / Math.max(1, np.to - np.from))) : 0;
  const shareSong = detail || np?.song;
  const playingId = playing ? np?.id : null;
  return (
    <section className={`symView${np ? " withMini" : ""}`} aria-label="Songs">
      {player}
      {tab === "hot" && <HotTab rows={hotRows} date={data.hot?.date} playingId={playingId} closeLabel={closeLabel} onClose={onClose}
        onPlayAll={playAll} onPlay={onRowPlay} onOpen={setOpenId} />}
      {tab === "library" && <LibraryTab rows={library.slice(0, LIBRARY_ROWS)} total={library.length} genres={genres} genre={genre} setGenre={setGenre}
        sort={sort} setSort={setSort} playingId={playingId} closeLabel={closeLabel} onClose={onClose} onPlay={onRowPlay} onOpen={setOpenId}
        onSearch={() => { setTab("search"); setFocusKey((n) => n + 1); }} />}
      {tab === "search" && <SearchTab q={q} setQ={setQ} rows={found} playingId={playingId} focusKey={focusKey} onPlay={onRowPlay} onOpen={setOpenId} />}

      {np && !detail && (
        <MiniPlayer np={np} playing={playing} progress={progress} forCover={Boolean(forCover)} used={onCover(forCover, np.song)}
          onToggle={toggle} onOpen={() => setOpenId(np.id)} onUse={use} />
      )}
      <TabBar tab={tab} setTab={(t) => { setOpenId(null); setTab(t); window.scrollTo(0, 0); }} />

      {detail && (
        <NowPlaying song={detail} np={np} playing={playing && np?.id === detail.id} at={at} from={FROM[tab]} forCover={Boolean(forCover)}
          used={onCover(forCover, detail)} onClose={() => setOpenId(null)} onToggle={toggle} onPart={step}
          onSeek={(t) => playRange(detail, t, t + 15)} onPlayRange={(a, b) => playRange(detail, a, b)} onShare={() => setSheet(true)} onUse={use} />
      )}
      {sheet && shareSong && (
        <ShareSheet song={shareSong} forCover={Boolean(forCover)} used={onCover(forCover, shareSong)} onClose={() => setSheet(false)} onUse={use}
          onCopy={() => copy(shareSong)} />
      )}
      {toast && (
        <div className={`symToast${toast.action ? " withAction" : ""}`} role="status">
          <span>{toast.text}</span>
          {toast.action && <a className="symToastAction" href={toast.action.href} target="_blank" rel="noreferrer" onClick={() => setToast(null)}>{toast.action.label}</a>}
        </div>
      )}
    </section>
  );
}
