import { useEffect, useRef, useState } from "react";
import { imageUrlFor, loadImage } from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";
import { plainCaption } from "./captionCall.js";
import { badgeFor } from "./pollenView.js";
import { displayTitle, parseSong, starsFor } from "./reviewMath.js";

// Everything under the cover: the icon row, Slides and Posts, Randomize layout, her note, the caption,
// the Compose check, Why it matches, Image info and the star ratings.

export function ActionRow({ item, onLike, onRemix, onDownload, onDislike, onComment, onEdit, onZoom, busy, quote }) {
  return (
    // Order from the original, with dislike and repost swapped (Arjang, Nov 18): like, dislike, download, repost, comment,
    // then the T icon (1.13.9), the magnifier (1.14.1, Arjang #790 item 2) and edit.
    <div className="actionRow" role="toolbar" aria-label="Cover actions">
      <button type="button" className={item.status === "approved" ? "iconBtn act liked" : "iconBtn act"} onClick={onLike} disabled={busy} aria-label="Like: approve this cover" aria-pressed={item.status === "approved"}>
        <Icon name="heart" size={28} filled={item.status === "approved"} />
      </button>
      <button type="button" className={item.status === "rejected" ? "iconBtn act passed" : "iconBtn act"} onClick={onDislike} disabled={busy} aria-label="Dislike: pass on this cover" aria-pressed={item.status === "rejected"}>
        <Icon name="dislike" size={28} filled={item.status === "rejected"} />
      </button>
      <button type="button" className="iconBtn act" onClick={onDownload} disabled={busy} aria-label="Download this cover as it will post"><Icon name="download" size={28} /></button>
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

// One row (1.13.4, Arjang's #559 item 2, Quill #660): the cover arrows at the two ends, the slides stepper centered
// between them. Slides and posts move exactly as they did in their own rows.
export function Steppers({ slide, total, onSlide, onAddSlide, onRemoveSlide, canPrevPost, canNextPost, onPrevPost, onNextPost }) {
  const fileRef = useRef(null);
  return (
    <div className="navRow">
      <button type="button" className="postBtn" aria-label="Previous cover" disabled={!canPrevPost} onClick={onPrevPost}><Icon name="back" size={22} /></button>
      <div className="stepper" role="group" aria-label="Slides">
        <button type="button" aria-label="Previous slide" disabled={slide <= 0} onClick={() => onSlide(slide - 1)}><Icon name="back" size={22} /></button>
        <button type="button" aria-label="Add a slide" onClick={() => fileRef.current?.click()}><Icon name="plus" size={22} /></button>
        <button type="button" className={slide > 0 ? "danger" : ""} aria-label="Remove this slide" disabled={slide <= 0} onClick={onRemoveSlide}><Icon name="minus" size={22} /></button>
        <button type="button" aria-label="Next slide" disabled={slide >= total - 1} onClick={() => onSlide(slide + 1)}><Icon name="forward" size={22} /></button>
      </div>
      <button type="button" className="postBtn" aria-label="Next cover" disabled={!canNextPost} onClick={onNextPost}><Icon name="forward" size={22} /></button>
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) onAddSlide(f); }} />
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

export function TitleRow({ item }) {
  const badge = badgeFor(item.pollen);
  return (
    <div className="titleRow">
      <strong className="titleName">{displayTitle(item.title)}</strong>
      <span className="titleQuote">{item.quote || <em>No quote</em>}</span>
      <span className="version" title="Version">v{item.revision || 1}</span>
      {badge && <span className={`state ${badge.tone}`} title={badge.why}>{badge.text}</span>}
    </div>
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

// What shows is the plain caption: a call written into it is left out (1.10.1, Quill #458), and editing opens that
// plain text, so a save also takes the old call out of what's stored.
export function CaptionRow({ item, ctas = [], onCta, onSave, onRedo, onDraft }) {
  const shown = plainCaption(item.caption, ctas);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(shown);
  useEffect(() => { setText(shown); setEditing(false); }, [item.id, shown]);
  const call = ctas.find((c) => c.keyword === String(item.cta || "").toUpperCase()) || null;
  return (
    <div className="captionRow">
      <div className="captionSide">
        <span className="captionLabel">Instagram caption</span>
        {ctas.length > 0 && onCta && <CommentCall item={item} ctas={ctas} onCta={onCta} />}
      </div>
      <div className="captionBody">
        {call && <span className="captionCall">{call.line}</span>}
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
];

export function ComposeCheck({ item, onRecheck, busy }) {
  const b = item.beacons;
  const verdict = !b ? { word: "NOT CHECKED", tone: "idle" } : b.STEPS_VERIFIED ? { word: "PASS", tone: "pass" } : { word: "CHECK", tone: "fail" };
  const detail = {
    QUOTE_IN_STOCK: b?.QUOTE_IN_STOCK === null ? "The quote is off on this cover." : item.quote ? `"${item.quote}"` : "No quote yet",
    SONG_IN_POOL: item.song ? [parseSong(item.song).artist, parseSong(item.song).title].filter(Boolean).join(" · ") : "No song yet",
    STEPS_VERIFIED: item.composeAttestedAt ? `Composed ${new Date(item.composeAttestedAt).toLocaleDateString()}` : "Not verified yet",
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
                <span className="checkDot" aria-hidden="true">{ok ? <Icon name="check" size={18} /> : null}</span>
                <div>
                  <p className="checkName">{name} <span className="yes">{!b ? "" : na ? "NOT NEEDED" : ok ? "YES" : "NO"}</span></p>
                  <p className="checkWhat">{key} · {what}</p>
                  <p className="checkDetail">{detail[key]}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <button type="button" className="chipBtn" onClick={onRecheck} disabled={busy}>{b ? "Re-check" : "Check it"}</button>
    </>
  );
}

export function WhyMatches({ why }) {
  if (!why?.text) return null;
  return (
    <section className="why" aria-label="Why it matches">
      <h3>Why it matches</h3>
      <p>{why.source ? `Source: ${why.source}. ` : ""}{why.text}</p>
      {why.tags?.length > 0 && <div className="tags">{why.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>}
      {why.audience && <p className="audience">{why.audience}</p>}
    </section>
  );
}

export function ImageInfo({ item, onSwap, onRestore, searchPhotos }) {
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => { setNatural(null); setResults([]); }, [item.id]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadImage(imageUrlFor(item)).then((img) => { if (alive) setNatural({ w: img.naturalWidth, h: img.naturalHeight }); }).catch(() => {});
    return () => { alive = false; };
  }, [open, item.id, item.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = [
    ["File", item.title],
    ["Size", natural ? `${natural.w} x ${natural.h}` : "..."],
    ["From", item.source === "drive" ? `Drive${item.driveId ? ` (${item.driveId})` : ""}` : item.source || "Upload"],
    ["Quality", item.imageQualityStatus === "quarantined" ? "Held back for quality" : "Passed"],
    ["Added", item.createdAt ? new Date(item.createdAt).toLocaleString() : ""],
    ["Version", `v${item.revision || 1}${item.parentId ? `, remixed from cover ${item.parentId}` : ""}`],
  ];
  return (
    <details className="imageInfo" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Image info <Icon name="chevronDown" size={18} className="chev" /></summary>
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
    </details>
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
