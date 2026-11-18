import { useEffect, useRef, useState } from "react";
import { imageUrlFor, loadImage } from "./CoverCanvas.jsx";
import Icon from "./icons.jsx";
import { badgeFor } from "./pollenView.js";
import { displayTitle, parseSong, starsFor } from "./reviewMath.js";

// Everything under the cover: the icon row, Slides and Posts, Randomize layout, her note, the caption,
// the Compose check, Why it matches, Image info and the star ratings.

export function ActionRow({ item, onLike, onRemix, onDownload, onDislike, onComment, onEdit, busy }) {
  return (
    <div className="actionRow" role="toolbar" aria-label="Cover actions">
      <button type="button" className={item.status === "approved" ? "iconBtn act liked" : "iconBtn act"} onClick={onLike} disabled={busy} aria-label="Like: approve this cover" aria-pressed={item.status === "approved"}>
        <Icon name="heart" size={28} filled={item.status === "approved"} />
      </button>
      <button type="button" className="iconBtn act" onClick={onRemix} disabled={busy} aria-label="Repost: remix this cover as a new version"><Icon name="repost" size={28} /></button>
      <button type="button" className="iconBtn act" onClick={onDownload} disabled={busy} aria-label="Download this cover as it will post"><Icon name="download" size={28} /></button>
      <button type="button" className={item.status === "rejected" ? "iconBtn act passed" : "iconBtn act"} onClick={onDislike} disabled={busy} aria-label="Dislike: pass on this cover" aria-pressed={item.status === "rejected"}>
        <Icon name="dislike" size={28} filled={item.status === "rejected"} />
      </button>
      <button type="button" className="iconBtn act" onClick={onComment} aria-label="Write a note for the next revision"><Icon name="comment" size={28} /></button>
      <button type="button" className="iconBtn act" onClick={onEdit} aria-label="Edit the text on the cover"><Icon name="edit" size={28} /></button>
    </div>
  );
}

export function Steppers({ slide, total, onSlide, onAddSlide, onRemoveSlide, canPrevPost, canNextPost, onPrevPost, onNextPost }) {
  const fileRef = useRef(null);
  return (
    <>
      <div className="stepRow">
        <span className="stepLabel" id="slidesLabel">Slides</span>
        <div className="stepper" role="group" aria-labelledby="slidesLabel">
          <button type="button" aria-label="Previous slide" disabled={slide <= 0} onClick={() => onSlide(slide - 1)}><Icon name="back" size={22} /></button>
          <button type="button" aria-label="Add a slide" onClick={() => fileRef.current?.click()}><Icon name="plus" size={22} /></button>
          <button type="button" className={slide > 0 ? "danger" : ""} aria-label="Remove this slide" disabled={slide <= 0} onClick={onRemoveSlide}><Icon name="minus" size={22} /></button>
          <button type="button" aria-label="Next slide" disabled={slide >= total - 1} onClick={() => onSlide(slide + 1)}><Icon name="forward" size={22} /></button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) onAddSlide(f); }} />
      </div>
      <div className="postsRow">
        <button type="button" className="postBtn" aria-label="Previous cover" disabled={!canPrevPost} onClick={onPrevPost}><Icon name="back" size={22} /></button>
        <span className="stepLabel">Posts</span>
        <button type="button" className="postBtn" aria-label="Next cover" disabled={!canNextPost} onClick={onNextPost}><Icon name="forward" size={22} /></button>
      </div>
    </>
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

export function CaptionRow({ item, onSave, onRedo, onDraft }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.caption || "");
  useEffect(() => { setText(item.caption || ""); setEditing(false); }, [item.id, item.caption]);
  return (
    <div className="captionRow">
      <span className="captionLabel">Instagram caption</span>
      {editing ? (
        <form className="captionEdit" onSubmit={(e) => { e.preventDefault(); onSave(text); setEditing(false); }}>
          <textarea className="field" rows={3} value={text} onChange={(e) => { setText(e.target.value); onDraft?.(e.target.value); }} aria-label="Instagram caption" autoFocus />
          <div className="rowEnd">
            <button type="button" className="linkBtn muted" onClick={onRedo}><Icon name="refresh" size={18} /> New caption</button>
            <button type="button" className="linkBtn muted" onClick={() => { setText(item.caption || ""); setEditing(false); onDraft?.(null); }}>Cancel</button>
            <button type="submit" className="linkBtn">Save</button>
          </div>
        </form>
      ) : (
        <button type="button" className="captionText" onClick={() => setEditing(true)} aria-label="Edit the caption">{item.caption || "No caption yet"}</button>
      )}
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
    QUOTE_IN_STOCK: item.quote ? `"${item.quote}"` : "No quote yet",
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
            return (
              <li key={key} className={ok ? "ok" : b ? "no" : "idle"}>
                <span className="checkDot" aria-hidden="true">{ok ? <Icon name="check" size={18} /> : null}</span>
                <div>
                  <p className="checkName">{name} <span className="yes">{!b ? "" : ok ? "YES" : "NO"}</span></p>
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
