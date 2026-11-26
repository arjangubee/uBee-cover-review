import { useEffect, useRef, useState } from "react";
import { imageUrlFor, loadImage } from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";
import { ctaFor, plainCaption, saysKeyword } from "./captionCall.js";
import { composePasses, driveLinkFor, parseSong, starsFor, whyProblem } from "./reviewMath.js";

// Everything under the cover: the icon row, Slides and Posts, Randomize layout, her note, the caption,
// the Compose check, Why it matches, Image info and the star ratings.

// Tinder's row (1.34.0, Arjang Nov 26): Rewind, the X, Skip where Tinder has its star (the queue only), and the heart.
// The X and the heart send the card off the way a swipe does. While a card moves, the button for where it's going grows
// and fills, and the rest shrink away; they come back once it's gone.
export function SwipeRow({ item, intent, busy, canRewind, onRewind, onNope, onLike, onSkip }) {
  const dir = intent?.dir || 0;
  const leading = Boolean(dir) && intent.phase !== "pop";
  const side = (s, name) => ["swipeBtn", "big", name, dir === s && (leading ? "lead" : "pop")].filter(Boolean).join(" ");
  return (
    <div className={leading ? "swipeRow leading" : "swipeRow"} role="toolbar" aria-label="Decide">
      <button type="button" className="swipeBtn rewind" onClick={onRewind} disabled={!canRewind} aria-label="Rewind: bring back the last cover you swiped">
        <Icon name="undo" size={24} />
      </button>
      <button type="button" className={side(-1, "nope")} onClick={onNope} disabled={busy} aria-label="Pass on this cover" aria-pressed={item.status === "rejected"}>
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
      </button>
      {onSkip && ( /* 1.32.0 (room #1248, Quill #1249): the whole cover to the end of the queue, nothing else changes */
        <button type="button" className="swipeBtn skip" onClick={onSkip} disabled={busy} aria-label="Skip: move this cover to the end of the queue"><Icon name="skip" size={22} /></button>
      )}
      <button type="button" className={side(1, "like")} onClick={onLike} disabled={busy} aria-label="Approve this cover" aria-pressed={item.status === "approved"}>
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 21s-7.6-4.6-9.4-9.5C1.4 8 3.6 4.5 7.1 4.5c2 0 3.7 1.1 4.9 3 1.2-1.9 2.9-3 4.9-3 3.5 0 5.7 3.5 4.5 7C19.6 16.4 12 21 12 21z" fill="currentColor" /></svg>
      </button>
    </div>
  );
}

export function ActionRow({ item, onRemix, onDownload, onDownloadAll, onComment, onEdit, onZoom, busy, quote }) {
  return (
    // Order from the original, with dislike and repost swapped (Arjang, Nov 18): download, repost, comment, then the T
    // icon (1.13.9), the magnifier (1.14.1, Arjang #790 item 2) and edit. Like, dislike and skip moved to the swipe row
    // above it in 1.34.0, as Tinder's heart, X and middle button.
    <div className="actionRow" role="toolbar" aria-label="Cover actions">
      <DownloadButton busy={busy} onTap={onDownload} onHold={onDownloadAll} />
      <button type="button" className="iconBtn act remixBtn" onClick={onRemix} disabled={busy} aria-label="Remix this cover" aria-haspopup="dialog"><Icon name="repost" size={28} /></button>
      <button type="button" className="iconBtn act" onClick={onComment} aria-label="Write a note for the next revision"><Icon name="comment" size={28} /></button>
      {quote && <QuoteButton {...quote} />}
      <button type="button" className="iconBtn act zoomBtn" onClick={onZoom} disabled={!onZoom} aria-label="Zoom in on the photo"><Icon name="zoom" size={28} /></button>
      <button type="button" className="iconBtn act" onClick={onEdit} aria-label="Edit the text on the cover"><Icon name="edit" size={28} /></button>
    </div>
  );
}

// The T icon (1.13.9, Arjang via Rose #693 and #694, Quill #695 and #696). On: a green circle behind the T, and the
// quote shows. Off: the T with a slash, grey like the other icons. A tap turns the quote off, or back on, for this post
// only. Holding it for HOLD_MS hides every quote, or brings them back, and that hold never also counts as a tap.
// Shift+Enter is the hold from a keyboard. A finger that slides off before the hold lands is neither. 1000 ms is the
// original's deck and quote holds (textHold and adjacentHold, Quill #707 and #719): a shorter press is a tap.
export const HOLD_MS = 1000;
function QuoteButton({ on, locked, onTap, onHold }) {
  const timer = useRef(null);
  const press = useRef(null);
  const stop = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  return (
    <button type="button" className={on ? "iconBtn act quoteBtn on" : "iconBtn act quoteBtn"} disabled={locked}
      aria-label="Quote on this cover" aria-pressed={on}
      aria-description="Tap to turn it off or on for this cover. Press and hold to hide or show quotes on every cover."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        press.current = { x: e.clientX, y: e.clientY, held: false };
        stop();
        timer.current = setTimeout(() => { timer.current = null; if (press.current) press.current.held = true; onHold(); }, HOLD_MS);
      }}
      onPointerMove={(e) => { const p = press.current; if (p && !p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { stop(); press.current = null; } }}
      onPointerUp={stop} onPointerCancel={() => { stop(); press.current = null; }} onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { const p = press.current; press.current = null; if (p?.held) return; onTap(); }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); onHold(); } }}>
      <span className="quoteMark"><Icon name={on ? "text" : "textOff"} size={22} /></span>
    </button>
  );
}

// Download (1.36.0, Arjang Nov 26): a tap saves what's on screen to the device, with nothing to choose and no share
// sheet. On a carousel, a hold of HOLD_MS saves every file of the post when she lets go: the save runs on the release,
// inside her touch, which is what lets a phone's browser save a file. The hold buzzes and lights the icon, so she knows
// to let go. Sliding off before letting go saves nothing. Shift+Enter is the hold from a keyboard.
function DownloadButton({ busy, onTap, onHold }) {
  const timer = useRef(null);
  const press = useRef(null);
  const [held, setHeld] = useState(false);
  const stop = () => { clearTimeout(timer.current); timer.current = null; };
  const cancel = () => { stop(); press.current = null; setHeld(false); };
  useEffect(() => stop, []);
  return (
    <button type="button" className={held ? "iconBtn act downloadBtn held" : "iconBtn act downloadBtn"} disabled={busy}
      aria-label={onHold ? "Download the photo on screen" : "Download this cover as it will post"}
      aria-description={onHold ? "Tap to download the photo on screen. Press and hold, then let go, to download every slide." : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0 || !onHold) return;
        press.current = { x: e.clientX, y: e.clientY, held: false, up: false };
        stop();
        timer.current = setTimeout(() => {
          timer.current = null;
          const p = press.current;
          if (!p || p.up) return;
          p.held = true;
          setHeld(true);
          navigator.vibrate?.(12);
        }, HOLD_MS);
      }}
      onPointerMove={(e) => { const p = press.current; if (p && !p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel(); }}
      onPointerUp={() => {
        stop();
        const p = press.current;
        if (!p) return;
        p.up = true;
        if (!p.held) return;
        setHeld(false);
        onHold();
        setTimeout(() => { if (press.current === p) press.current = null; }, 500); // the click after a hold, if any, is ignored
      }}
      onPointerCancel={cancel} onPointerLeave={() => { if (!press.current?.up) cancel(); }}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { const p = press.current; press.current = null; if (!p?.held) onTap(); }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey && onHold) { e.preventDefault(); onHold(); } }}>
      <Icon name="download" size={28} />
    </button>
  );
}

// One row (1.13.4, Arjang's #559 item 2, Quill #660): the cover arrows at the two ends, the slides stepper centered
// between them. Slides and posts move exactly as they did in their own rows.
// Since 1.37.0 the + opens a small menu (Choose From Queue, or the phone's own picker) instead of the picker itself.
export function Steppers({ slide, total, onSlide, onAddSlide, onRemoveSlide, canPrevPost, canNextPost, onPrevPost, onNextPost }) {
  return (
    <div className="navRow">
      <button type="button" className="postBtn" aria-label="Previous cover" disabled={!canPrevPost} onClick={onPrevPost}><Icon name="back" size={22} /></button>
      <div className="stepper" role="group" aria-label="Slides">
        <button type="button" aria-label="Previous slide" disabled={slide <= 0} onClick={() => onSlide(slide - 1)}><Icon name="back" size={22} /></button>
        <button type="button" aria-label="Add a slide" aria-haspopup="dialog" onClick={onAddSlide}><Icon name="plus" size={22} /></button>
        <button type="button" className={slide > 0 ? "danger" : ""} aria-label="Remove this slide" disabled={slide <= 0} onClick={onRemoveSlide}><Icon name="minus" size={22} /></button>
        <button type="button" aria-label="Next slide" disabled={slide >= total - 1} onClick={() => onSlide(slide + 1)}><Icon name="forward" size={22} /></button>
      </div>
      <button type="button" className="postBtn" aria-label="Next cover" disabled={!canNextPost} onClick={onNextPost}><Icon name="forward" size={22} /></button>
    </div>
  );
}

export function NoteComposer({ item, onPost, onDraft, inputRef }) {
  const [text, setText] = useState(item.note || "");
  useEffect(() => { setText(item.note || ""); }, [item.id, item.note]);
  const changed = text.trim() !== String(item.note || "").trim();
  return (
    <form className="noteRow" onSubmit={(e) => { e.preventDefault(); if (changed) onPost(text.trim()); }}>
      <input ref={inputRef} className="noteInput" value={text} onChange={(e) => { setText(e.target.value); onDraft?.(e.target.value); }}
        placeholder="Add a note for the next revision" aria-label="Note for the next revision" />
      <button type="submit" className="linkBtn" disabled={!changed}>Post</button>
    </form>
  );
}

// The Comment CTA (1.10, Arjang #435; renamed in 1.10.1, Arjang #453): her ManyChat-style line leads the caption only
// when the switch is on. Off by default. The switch sits under the label; with more than one call, she picks which under it.
function CommentCall({ item, ctas, onCta }) {
  const on = ctas.find((c) => c.keyword === String(item.cta || "").toUpperCase()) || null;
  return (
    <div className="commentCall">
      <button type="button" role="switch" aria-checked={Boolean(on)} aria-label="Comment CTA" className="callSwitch"
        onClick={() => onCta(on ? null : ctas[0].keyword)}>
        <span className="track" aria-hidden="true"><span className="knob" /></span>
        <span className="callLabel">Comment CTA</span>
      </button>
      {on && ctas.length > 1 && (
        <div className="callKeys" role="group" aria-label="Which comment CTA">
          {ctas.map((c) => (
            <button key={c.keyword} type="button" className="callKey" aria-pressed={c.keyword === on.keyword}
              onClick={() => c.keyword !== on.keyword && onCta(c.keyword)}>{c.keyword}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// The comment CTA's line (1.36.0, Arjang Nov 26): with the switch on, a tap opens it to edit, for this cover only. It
// keeps the keyword, so fans know what to comment, and goes out under the rules her saved lines follow. A cover with its
// own line can go back to her saved line. onSave answers why it didn't save, or nothing once it did.
function CtaLine({ call, saved, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(call.line);
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!onSave) return <span className="captionCall">{call.line}</span>;
  if (!editing) {
    return (
      <button type="button" className="captionCall editable" onClick={() => { setText(call.line); setProblem(null); setEditing(true); }}
        aria-label={`Comment CTA, ${call.own ? "written for this cover" : "your saved line"}: ${call.line}. Tap to edit it for this cover.`}>
        {call.line}
      </button>
    );
  }
  const save = async (next) => {
    setSaving(true);
    const why = await onSave(next);
    setSaving(false);
    if (why) setProblem(why); else setEditing(false);
  };
  const submit = (e) => {
    e.preventDefault();
    const line = text.trim();
    if (!saysKeyword(line, call.keyword)) { setProblem(`Keep the word ${call.keyword} in it, so fans know what to comment.`); return; }
    if (line === call.line) { setEditing(false); return; }
    save(line === saved?.line ? null : { keyword: call.keyword, line });
  };
  return (
    <form className="ctaEdit" onSubmit={submit}>
      <textarea className="field" rows={4} value={text} maxLength={300} autoFocus
        aria-label={`Comment CTA for this cover. Keep the word ${call.keyword} in it.`}
        onChange={(e) => { setText(e.target.value); setProblem(null); }} />
      {problem && <p className="problem" role="alert">{problem}</p>}
      <div className="rowEnd">
        {call.own && <button type="button" className="linkBtn muted" disabled={saving} onClick={() => save(null)}>Use my saved line</button>}
        <button type="button" className="linkBtn muted" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="linkBtn" disabled={saving || !text.trim()}>Save</button>
      </div>
    </form>
  );
}

// What shows is the plain caption: a call written into it is left out (1.10.1, Quill #458), and editing opens that
// plain text, so a save also takes the old call out of what's stored.
export function CaptionRow({ item, ctas = [], onCta, onCtaLine, onSave, onRedo, onDraft }) {
  const shown = plainCaption(item.caption, ctas);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(shown);
  useEffect(() => { setText(shown); setEditing(false); }, [item.id, shown]);
  const call = ctaFor(item, ctas);
  return (
    <div className="captionRow">
      <div className="captionSide">
        <span className="captionLabel">Instagram caption</span>
        {ctas.length > 0 && onCta && <CommentCall item={item} ctas={ctas} onCta={onCta} />}
      </div>
      <div className="captionBody">
        {call && <CtaLine key={`${item.id}|${call.keyword}|${call.line}`} call={call} saved={ctas.find((c) => c.keyword === call.keyword)} onSave={onCtaLine} />}
        {editing ? (
          <form className="captionEdit" onSubmit={(e) => { e.preventDefault(); onSave(text); setEditing(false); }}>
            <textarea className="field" rows={3} value={text} onChange={(e) => { setText(e.target.value); onDraft?.(e.target.value); }} aria-label="Instagram caption" autoFocus />
            <div className="rowEnd">
              <button type="button" className="linkBtn muted" onClick={onRedo}><Icon name="refresh" size={18} /> New caption</button>
              <button type="button" className="linkBtn muted" onClick={() => { setText(shown); setEditing(false); onDraft?.(null); }}>Cancel</button>
              <button type="submit" className="linkBtn">Save</button>
            </div>
          </form>
        ) : (
          <button type="button" className="captionText" onClick={() => setEditing(true)} aria-label="Edit the caption">{shown || "No caption yet"}</button>
        )}
      </div>
    </div>
  );
}

const CHECKS = [
  ["QUOTE_IN_STOCK", "Quote in stock", "The quote is from your quote list, word for word."],
  ["SONG_IN_POOL", "Song in pool", "The song is in your library or the trending pool."],
  ["STEPS_VERIFIED", "Steps verified", "Image first, then the quote, then the song."],
  ["WHY_WRITTEN", "Why it matches", "The logic of this match: the photo, the quote and the song."],
];

// The compose check (1.21.0, Big Edit item 12) comes checked, and argues each decision like a caveman: one line for the
// quote and one for the song (lines, null while what the cover shows has changed since its check). None for the image.
export function ComposeCheck({ item, lines, onRecheck, busy }) {
  const b = item.beacons;
  const why = { QUOTE_IN_STOCK: lines?.quote, SONG_IN_POOL: lines?.song };
  // 1.25.0 (Arjang #1100, #1104): Why it matches is the 4th check. All four pass, or the cover is INCOMPLETE, with a red X
  // in each circle that fails. A check from before the 4th existed reads as checking again, never as blank.
  const verdict = !b ? { word: "NOT CHECKED", tone: "idle" } : composePasses(b) ? { word: "PASS", tone: "pass" } : { word: "INCOMPLETE", tone: "fail" };
  const detail = {
    QUOTE_IN_STOCK: b?.QUOTE_IN_STOCK === null ? "The quote is off on this cover." : item.quote ? `"${item.quote}"` : "No quote yet",
    SONG_IN_POOL: item.song ? [parseSong(item.song).artist, parseSong(item.song).title].filter(Boolean).join(" · ") : "No song yet",
    STEPS_VERIFIED: item.composeAttestedAt ? `Composed ${new Date(item.composeAttestedAt).toLocaleDateString()}` : "Not verified yet",
    WHY_WRITTEN: whyProblem(item.why) || (item.why.source ? `Source: ${item.why.source}` : "Written"),
  };
  return (
    <>
      <section className={`composeCard ${verdict.tone}`} aria-label="Compose check">
        <div className="composeHead">
          <h3>Compose check</h3>
          <span className={`verdict ${verdict.tone}`}>{verdict.word}</span>
        </div>
        <p className="composeFlow">Image first → quote from stock → song from pool</p>
        <ul className="checks">
          {CHECKS.map(([key, name, what]) => {
            const ok = b?.[key];
            const na = Boolean(b) && ok === null; // 1.5.2: the quote is off, so its stock check doesn't apply
            return (
              <li key={key} className={na ? "na" : ok ? "ok" : b ? "no" : "idle"}>
                <span className="checkDot" aria-hidden="true">{ok ? <Icon name="check" size={18} /> : b && !na ? <Icon name="close" size={18} /> : null}</span>
                <div>
                  <p className="checkName">{name} <span className="yes">{!b ? "" : na ? "NOT NEEDED" : ok ? "YES" : "NO"}</span></p>
                  <p className="checkWhat">{key} · {what}</p>
                  <p className="checkDetail">{detail[key]}</p>
                  {why[key] && <p className="checkWhy">{why[key]}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {/* Why it matches lives here now (1.25.0): the blurb beneath the checks, the logic of this match. */}
        {item.why?.text ? (
          <div className="composeWhy">
            <p>{item.why.text}</p>
            {item.why.tags?.length > 0 && <div className="tags">{item.why.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>}
            {item.why.audience && <p className="audience">{item.why.audience}</p>}
          </div>
        ) : null}
      </section>
      <button type="button" className="chipBtn" onClick={onRecheck} disabled={busy}>{b ? "Re-check" : "Check it"}</button>
    </>
  );
}

// Rate Quality (1.21.0, Big Edit item 12.1): what was the "Image info" fold is always open now, its title centered: the
// stars first, then the photo's details and the photo swap.
export function RateQuality({ item, onRate, onSwap, onRestore, searchPhotos }) {
  const [natural, setNatural] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => { setResults([]); }, [item.id]);
  useEffect(() => {
    let alive = true;
    setNatural(null);
    loadImage(imageUrlFor(item)).then((img) => { if (alive) setNatural({ w: img.naturalWidth, h: img.naturalHeight }); }).catch(() => {});
    return () => { alive = false; };
  }, [item.id, item.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = [
    ["File", item.title],
    ["Size", natural ? `${natural.w} x ${natural.h}` : "..."],
    // The Drive file opens in a new tab (1.24.0, Arjang #1106). No Drive id, no link.
    ["From", driveLinkFor(item)
      ? <a href={driveLinkFor(item)} target="_blank" rel="noopener noreferrer">{`Drive (${item.driveId})`}</a>
      : item.source === "drive" ? "Drive" : item.source || "Upload"],
    ["Quality", item.imageQualityStatus === "quarantined" ? "Held back for quality" : "Passed"],
    ["Added", item.createdAt ? new Date(item.createdAt).toLocaleString() : ""],
    ["Version", `v${item.revision || 1}${item.parentId ? `, remixed from cover ${item.parentId}` : ""}`],
  ];
  return (
    <section className="rateQuality" aria-labelledby="rateQualityTitle">
      <h3 id="rateQualityTitle">Rate Quality</h3>
      <Ratings item={item} onRate={onRate} />
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <form className="swapRow" onSubmit={async (e) => { e.preventDefault(); setResults(await searchPhotos(q)); }}>
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Swap the photo: search by name" aria-label="Search your photos by name" />
        <button type="submit" className="linkBtn">Search</button>
      </form>
      {results.length > 0 && (
        <div className="swapGrid">
          {results.slice(0, 12).map((r, i) => (
            <button type="button" key={i} className="swapTile" onClick={() => onSwap(r)} aria-label={`Use ${r.title}`}><img src={r.imageUrl} alt="" loading="lazy" /></button>
          ))}
        </div>
      )}
      {item.originalImageUrl && item.originalImageUrl !== item.imageUrl && <button type="button" className="linkBtn" onClick={onRestore}>Restore the original photo</button>}
    </section>
  );
}

const RATES = [["qualityRating", "Output quality", "Tap to rate"], ["songRating", "Song choice", "Optional"], ["quoteRating", "Quote pairing", "Optional"]];

export function Ratings({ item, onRate }) {
  return (
    <section className="ratings" aria-label="Ratings">
      {RATES.map(([key, name, sub]) => {
        const n = starsFor(item[key]);
        return (
          <div className="rateRow" key={key}>
            <div className="rateName"><span>{name}</span><small>{n ? `${n} of 5` : sub}</small></div>
            <div className="stars" role="radiogroup" aria-label={name}>
              {[1, 2, 3, 4, 5].map((s) => (
                <button type="button" key={s} role="radio" aria-checked={n === s} aria-label={`${s} star${s > 1 ? "s" : ""}`}
                  className={s <= n ? "star on" : "star"} onClick={() => onRate(key, n === s ? 0 : s)}>
                  <Icon name="star" size={30} filled={s <= n} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function StoryControls({ item, onPan, onPanDone }) {
  return (
    <div className="storyControls">
      {[["storyPanX", "Story frame, left to right"], ["storyPanY", "Story frame, top to bottom"]].map(([key, label]) => (
        <div className="slider" key={key}>
          <label htmlFor={key}>{label}</label>
          <output htmlFor={key}>{item[key] ?? 50}%</output>
          <input id={key} type="range" min="0" max="100" value={item[key] ?? 50} style={{ "--pct": `${item[key] ?? 50}%` }}
            onChange={(e) => onPan(key, Number(e.target.value))} onPointerUp={onPanDone} onKeyUp={onPanDone} />
        </div>
      ))}
    </div>
  );
}

export function BrandFoot() {
  return (
    <footer className="brandFoot">
      <span className="rule" aria-hidden="true" />
      <img src="/brand/ubee-wordmark-chartreuse.png" alt="ubee" className="wordmark" />
      <span className="rule" aria-hidden="true" />
    </footer>
  );
}
