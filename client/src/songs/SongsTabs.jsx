import { useEffect, useRef } from "react";
import Icon from "../icons.jsx";
import SongsRow from "./SongsRow.jsx";
import { SORTS } from "./songsData.js";

// The three tabs. New hot reads like a Spotify playlist page, Library like Your Library, Search like Spotify's search.
// The back arrow on each returns to the covers.

function Back({ label, onClose }) {
  return <button type="button" className="iconBtn" onClick={onClose} aria-label={label}><Icon name="back" /></button>;
}

export function HotTab({ rows, date, playingId, savedIds, closeLabel, onClose, onPlayAll, onPlay, onOpen }) {
  const playable = rows.filter((r) => r.hook);
  const mosaic = rows.filter((r) => r.artwork).slice(0, 4);
  const day = date ? new Date(`${date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
  return (
    <section aria-label="New hot">
      <header className="symTabHead">
        <Back label={closeLabel} onClose={onClose} />
        <span className="symGrow" />
        <img src="/brand/ubee-bee-chartreuse.png" alt="uBee" className="symBee" />
      </header>
      <div className="symHero">
        <div className={`symMosaic n${mosaic.length}`} aria-hidden="true">
          {mosaic.length ? mosaic.map((r) => <img key={r.id} src={r.artwork} alt="" />) : <Icon name="note" size={64} />}
        </div>
        <h1 className="symHeroTitle">New hot</h1>
        <p className="symHeroLine">Rising fast in the US: new on Shazam, climbing Spotify, Apple Music, iTunes and YouTube.</p>
        <p className="symHeroMeta">{rows.length} songs{day ? ` · ${day}` : ""}</p>
        <div className="symHeroActions">
          <span className="symGrow" />
          <button type="button" className="symBigPlay" onClick={onPlayAll} disabled={!playable.length} aria-label="Play every hook in order"><Icon name="play" size={28} /></button>
        </div>
      </div>
      {!rows.length && <p className="symEmpty">Nothing rising yet. Symphony reads the US charts every morning.</p>}
      <ol className="symRows">
        {rows.map((r) => (
          <SongsRow key={r.id} s={r} active={playingId === r.id} saved={savedIds.has(r.id)} onPlay={onPlay} onOpen={onOpen}
            line={<>{r.artist}{r.badges.length ? ` · ${r.badges.slice(0, 2).map((b) => b.text).join(" · ")}` : ""}</>} />
        ))}
      </ol>
    </section>
  );
}

// 1.15.0: Saved and Hidden sit before the genres. Hidden is the only place hidden songs show, each with Unhide.
export function LibraryTab({ rows, total, genres, genre, setGenre, shelf, setShelf, savedCount, hiddenCount, savedIds, sort, setSort, playingId,
  closeLabel, onClose, onPlay, onOpen, onSearch, onUnhide }) {
  const next = SORTS[(SORTS.findIndex(([id]) => id === sort) + 1) % SORTS.length];
  const name = SORTS.find(([id]) => id === sort)[1];
  return (
    <section aria-label="Library">
      <header className="symTabHead">
        <Back label={closeLabel} onClose={onClose} />
        <h1 className="symTabTitle">Library</h1>
        <button type="button" className="iconBtn" onClick={onSearch} aria-label="Search the library"><Icon name="search" /></button>
      </header>
      {(genres.length > 0 || savedCount > 0 || hiddenCount > 0) && (
        <div className="symChips" role="group" aria-label="Show">
          {(genre || shelf) && (
            <button type="button" className="symChip clear" onClick={() => { setGenre(null); setShelf(null); }} aria-label="Show every song"><Icon name="close" size={18} /></button>
          )}
          {!genre && [["saved", "Saved", savedCount], ["hidden", "Hidden", hiddenCount]].filter(([id, , n]) => n > 0 && (!shelf || shelf === id)).map(([id, name]) => (
            <button type="button" key={id} className={`symChip${shelf === id ? " on" : ""}`} aria-pressed={shelf === id} onClick={() => setShelf(shelf === id ? null : id)}>{name}</button>
          ))}
          {!shelf && (genre ? [genre] : genres).map((g) => (
            <button type="button" key={g} className={`symChip${genre === g ? " on" : ""}`} aria-pressed={genre === g} onClick={() => setGenre(genre === g ? null : g)}>{g}</button>
          ))}
        </div>
      )}
      <div className="symSortRow">
        <button type="button" className="symSortBtn" onClick={() => setSort(next[0])} aria-label={`Sorted by ${name}. Sort by ${next[1]}`}>
          <Icon name="sort" size={18} /> {name}
        </button>
        <span className="symCount">{total} {total === 1 ? "song" : "songs"}</span>
      </div>
      {!rows.length && <p className="symEmpty">No songs yet. Symphony adds today's US charts and the most streamed songs every morning.</p>}
      <ul className="symRows">
        {rows.map((r) => <SongsRow key={r.id} s={r} active={playingId === r.id} saved={savedIds.has(r.id)} onPlay={onPlay} onOpen={onOpen}
          onUnhide={shelf === "hidden" ? onUnhide : undefined} />)}
      </ul>
    </section>
  );
}

export function SearchTab({ q, setQ, rows, playingId, savedIds, focusKey, onPlay, onOpen }) {
  const input = useRef(null);
  useEffect(() => { if (focusKey) input.current?.focus(); }, [focusKey]);
  const typed = q.trim();
  return (
    <section aria-label="Search">
      <div className="symSearchBar">
        <label className="symSearchField">
          <Icon name="search" size={20} />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs" aria-label="Search songs" autoComplete="off" spellCheck={false} />
        </label>
        {q && <button type="button" className="symCancel" onClick={() => setQ("")}>Cancel</button>}
      </div>
      {!typed && (
        <div className="symFindHint">
          <h2>Find a song</h2>
          <p>Search every song Symphony knows, by artist or title.</p>
        </div>
      )}
      <ul className="symRows">
        {rows.map((r) => <SongsRow key={r.id} s={r} active={playingId === r.id} saved={savedIds.has(r.id)} onPlay={onPlay} onOpen={onOpen} />)}
      </ul>
      {typed && !rows.length && <p className="symEmpty">No song matches. Symphony adds new songs every morning.</p>}
    </section>
  );
}

export function TabBar({ tab, setTab }) {
  const items = [["hot", "New hot", "hot"], ["search", "Search", "search"], ["library", "Library", "library"]];
  return (
    <nav className="symTabBar" aria-label="Songs sections">
      {items.map(([id, name, icon]) => (
        <button type="button" key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
          <Icon name={icon} size={26} /><span>{name}</span>
        </button>
      ))}
    </nav>
  );
}
