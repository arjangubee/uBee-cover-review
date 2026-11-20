import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, post, upload } from "./api.js";
import { ActionRow, BrandFoot, CaptionRow, ComposeCheck, ImageInfo, NoteComposer, Ratings, Steppers, StoryControls, TitleRow, WhyMatches } from "./CoverDetails.jsx";
import CoverEditor from "./CoverEditor.jsx";
import EditorSheet from "./EditorSheet.jsx";
import ZoomView from "./ZoomView.jsx";
import { imageUrlFor, loadImage } from "./CoverCanvas.jsx";
import CoverStage from "./CoverStage.jsx";
import { CoverHeader, ModeSwitch, SongRow } from "./CoverTop.jsx";
import Icon from "./icons.jsx";
import InfoSheet from "./InfoSheet.jsx";
import LibraryView from "./LibraryView.jsx";
import { STYLE_DEFAULTS, canvasMeasureAt, ensureFonts, normalizePlacement, randomizeLayout, renderCover, withDefaults } from "./renderCover.js";
import { changedFields, displayTitle, valueForStars } from "./reviewMath.js";
import ScheduleSheet from "./ScheduleSheet.jsx";
import { coverSongEdit } from "./songs/songsData.js";
import SongsView from "./songs/SongsView.jsx";
import { createHistory } from "./undo.js";
import { globalHide, ownQuote, quoteShown } from "./quoteOverlay.js";
import { setBusy as setScreenBusy } from "./busy.js";

const STYLE_KEYS = Object.keys(STYLE_DEFAULTS);
const MAX_BOXES = 5;

/** A cover's style with every default filled in, so an edit compares what she actually sees. */
function effectiveStyle(item) {
  const s = withDefaults(item);
  const out = {};
  for (const k of STYLE_KEYS) out[k] = s[k];
  out.extraTexts = Array.isArray(item.extraTexts) ? item.extraTexts : [];
  return out;
}
const pickStyle = (item, keys) => Object.fromEntries(keys.map((k) => [k, effectiveStyle(item)[k]]));
// Resolves when the browser has a free moment (or after a short wait where it can't say), so a pass in the background
// never competes with her taps.
const whenIdle = () => new Promise((done) => (typeof window !== "undefined" && window.requestIdleCallback
  ? window.requestIdleCallback(() => done(), { timeout: 1000 }) : setTimeout(done, 50)));

export default function App() {
  const [status, setStatus] = useState(null);
  const [list, setList] = useState("queue");
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState("cover");
  const [story, setStory] = useState(false);
  const [slide, setSlide] = useState(0);
  const [draft, setDraft] = useState(null);
  const [zoom, setZoom] = useState(null); // the magnifier (1.7): { source, slideUrl } while the photo is flown up
  const [activeBox, setActiveBox] = useState(-1);
  const [pickMode, setPickMode] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // the editor saves as she goes (1.8): idle | saving | saved | error
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // { items, stop } while the Schedule sheet is open
  const [palette, setPalette] = useState({ palette: [], fonts: [], customColors: [] });
  const [quotesStatus, setQuotesStatus] = useState(null);
  const [quizQuotes, setQuizQuotes] = useState([]);
  const [pollen, setPollen] = useState(null);
  const [ctas, setCtas] = useState([]); // the space's comment CTAs (1.10); none means no switch under the caption
  const [symphony, setSymphony] = useState(null); // Symphony online (1.12): connected means the Songs screen is there
  const [songsFrom, setSongsFrom] = useState("cover"); // where the Songs screen goes back to: a cover, or all covers
  const [toast, setToast] = useState(null);
  const [burst, setBurst] = useState(0); // the heart that pops on the cover when she likes it
  const [drawnId, setDrawnId] = useState(null); // the cover whose photo is on screen: only that one can be decided
  const [loads, setLoads] = useState(0); // counts finished loads; each one starts the caption fill loop (1.9)
  const draftSaved = useRef(null); // the open draft as it stands on the server; each autosave sends only what changed
  const draftNow = useRef(null);
  const saveChain = useRef(Promise.resolve(true));
  const sheetDismiss = useRef(null); // closes the editor sheet with its slide, from a tap off the photo
  const pending = useRef({}); // typed but not yet saved: { [itemId]: { note, caption, song } }
  const stepping = useRef(false);
  const [, setHistoryTick] = useState(0);
  const history = useRef(createHistory(50));
  const pendingId = useRef(null);
  const noteRef = useRef(null);

  const say = useCallback((text) => setToast({ text, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const [s, q, qs, quiz, pc, pal, calls, sym] = await Promise.all([
      api("/api/setup/status"), api(`/api/items?status=${list}`), api("/api/quotes/status"), api("/api/quiz/quotes"),
      api("/api/pollen/channels").catch(() => null), api("/api/palette").catch(() => null), api("/api/settings/caption-ctas").catch(() => null),
      api("/api/connectors/symphony").catch(() => null),
    ]);
    setSymphony(sym);
    setStatus(s);
    setItems(q.items);
    setQuotesStatus(qs);
    setQuizQuotes(quiz.quotes);
    setPollen(pc);
    if (pal) setPalette({ palette: pal.palette, fonts: pal.fonts, customColors: pal.customColors || [] });
    setCtas(calls?.ctas || []);
    setLoads((n) => n + 1);
  }, [list]);
  useEffect(() => { load().catch((e) => say(e.message)); }, [load, say]);

  // Captions (1.9), the original's fill loop: every caption a model may draft (blank, or the offline placeholder)
  // gets a draft before she reaches it, off-screen covers first. The server keeps a typed caption: a draft lands only
  // while the caption is unchanged. A copy with no model answers no-model once, and the loop rests for the session.
  const filling = useRef(false);
  const noModel = useRef(false);
  async function fillCaptions(onScreenId) {
    if (filling.current || noModel.current) return;
    filling.current = true;
    try {
      const { ids } = await api("/api/captions/wanted");
      for (const id of [...ids.filter((i) => i !== onScreenId), ...ids.filter((i) => i === onScreenId)]) {
        const r = await post(`/api/items/${id}/caption-fill`, {});
        if (r.reason === "no-model") { noModel.current = true; break; }
        if (r.drafted && r.item) setItems((prev) => prev.map((i) => (i.id === r.item.id ? { ...i, caption: r.item.caption, captionSource: r.item.captionSource } : i)));
      }
    } catch { /* a draft is a nicety: the caption she has stays */ }
    filling.current = false;
  }

  // Text placement (1.13.8, #559 item 6, Quill #685, #687 and #689): the original's pass, once for each queue cover with
  // no stamp. A model looks at the photo and answers where the quote goes; normalizePlacement fits the answer with the
  // real text sizes, and saving it stamps the cover, ready or not. Off-screen covers first, the one on screen last. Only
  // the stored cover changes: a draft she has open stays as it is until she leaves it. A cover that fails is skipped
  // for this session and tried again on the next load. This copy has no model: it answers no-model once and the loop rests.
  const placing = useRef(false);
  const noPlacer = useRef(false);
  const placeFailed = useRef(new Set());
  async function fillPlacements(onScreenId) {
    if (placing.current || noPlacer.current) return;
    placing.current = true;
    try {
      const { ids } = await api("/api/placements/wanted");
      const todo = ids.filter((id) => !placeFailed.current.has(id));
      for (const id of [...todo.filter((i) => i !== onScreenId), ...todo.filter((i) => i === onScreenId)]) {
        try {
          const r = await post(`/api/items/${id}/placement-fill`, {});
          if (r.reason === "no-model") { noPlacer.current = true; break; }
          if (r.reason === "done") continue;
          if (!r.answer || !r.item) throw new Error("no answer");
          const img = await loadImage(imageUrlFor(r.item));
          await ensureFonts({ ...r.item, showQuote: true });
          const box = { ...withDefaults(r.item), quote: String(r.item.quote || "") };
          const measure = canvasMeasureAt(box) || ((px) => (t) => t.length * px * 0.5);
          const fields = normalizePlacement(box, img.naturalWidth / img.naturalHeight, measure, r.answer);
          const saved = await post(`/api/items/${id}/placement`, { fields });
          if (saved.saved && saved.item) {
            const keep = ["horizontalPosition", "verticalPosition", "textAlign", "fontSize", "lineCount", "textPlacementVersion"];
            setItems((prev) => prev.map((i) => (i.id === saved.item.id ? { ...i, ...Object.fromEntries(keep.map((k) => [k, saved.item[k]])) } : i)));
          }
        } catch { placeFailed.current.add(id); }
      }
    } catch { /* placing is a nicety: the text she has stays */ }
    placing.current = false;
  }

  // 1.13.9's one-time recheck (Quill #706, #707 and #719). A compose check saved before 1.13.9 was made when every post
  // started with its quote off, so it can say NOT NEEDED for a quote that shows now. Each one is checked once more:
  // idle, one cover at a time, the one on screen last, beacons only. Only a cover whose check changed is patched, and
  // only its check, so nothing else on the screen moves. A cover that fails keeps its saved check until the next load.
  const rechecking = useRef(false);
  async function recheckSavedChecks(onScreenId) {
    if (rechecking.current) return;
    rechecking.current = true;
    try {
      const { ids } = await api("/api/beacons/wanted");
      for (const id of [...ids.filter((i) => i !== onScreenId), ...ids.filter((i) => i === onScreenId)]) {
        await whenIdle();
        try {
          const r = await post(`/api/items/${id}/recheck`, {});
          if (!r.rechecked || !r.changed?.length || !r.item) continue;
          const fresh = { beacons: r.item.beacons, composeAttestedAt: r.item.composeAttestedAt, beaconsVersion: r.item.beaconsVersion };
          // A check that came back from something else in the meantime is as new as this one: it stays.
          setItems((prev) => prev.map((i) => (i.id === r.item.id && !(Number(i.beaconsVersion || 0) >= fresh.beaconsVersion) ? { ...i, ...fresh } : i)));
        } catch { /* this cover keeps its saved check until the next load */ }
      }
    } catch { /* the recheck only refreshes saved checks: every cover stays as it is */ }
    rechecking.current = false;
  }

  // Keep her place: a cover opened from the grid, or the same spot after a cover leaves the list.
  useEffect(() => {
    if (pendingId.current != null) {
      const at = items.findIndex((i) => i.id === pendingId.current);
      pendingId.current = null;
      if (at >= 0) { setIndex(at); return; }
    }
    setIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items]);

  // While a cover waits for Pollen, keep the Approved grid's badges fresh.
  const pollenPending = list === "approved" && items.some((i) => ["waiting", "leased"].includes(i.pollen?.status));
  useEffect(() => {
    if (!pollenPending || sheet) return undefined;
    const t = setInterval(() => load().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [pollenPending, sheet, load]);

  const current = items[index] || null;
  // An editor or a sheet open means she's busy: the update notes above both screens wait for a quiet minute (1.13.10, 1.14).
  const inUse = Boolean(draft) || infoOpen || Boolean(sheet);
  useEffect(() => { setScreenBusy("covers", inUse); }, [inUse]);
  useEffect(() => () => setScreenBusy("covers", false), []);
  const shown = draft && current && draft.id === current.id ? draft : current;
  const quoteOn = Boolean(quoteShown(shown, quotesStatus?.quoteOverlay) && quotesStatus?.unlocked); // 1.13.9: global hide, else the post's own (on by default)
  const activeSlides = useMemo(() => (shown?.slides || []).map((s, at) => ({ ...s, at }))
    .filter((s) => !s.deletedAt).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [shown]);
  useEffect(() => { setSlide(0); setPickMode(false); }, [current?.id]);
  // The editor belongs to one cover: if that cover leaves the screen, the editor closes with it.
  useEffect(() => { if (draft && current?.id !== draft.id) finishEdit(); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setZoom(null); }, [current?.id, view]); // another cover starts unzoomed, like the original
  // The next cover's photo starts loading now, so moving on is instant.
  useEffect(() => { const next = items[index + 1]; if (next) loadImage(imageUrlFor(next)).catch(() => {}); }, [items, index]);
  const coverReady = Boolean(current) && drawnId === current.id;
  useEffect(() => { if (loads) fillCaptions(current?.id ?? null); }, [loads]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loads) return undefined;
    const run = async () => { await recheckSavedChecks(current?.id ?? null); await fillPlacements(current?.id ?? null); };
    const idle = typeof window !== "undefined" && window.requestIdleCallback;
    const handle = idle ? window.requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 800);
    return () => (idle ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, [loads]); // eslint-disable-line react-hooks/exhaustive-deps
  // The boxes she has dragged on this cover this session leave the deck's safe hold, like the original's
  // positionedTextIds (1.13.8): never saved, and cleared when the cover changes.
  const [free, setFree] = useState(() => new Set());
  useEffect(() => { setFree(new Set()); }, [current?.id]);
  const freeBox = useCallback((i) => setFree((f) => (f.has(i) ? f : new Set([...f, i]))), []);
  useEffect(() => { if (slide > activeSlides.length) setSlide(activeSlides.length); }, [activeSlides.length, slide]);

  // On a phone the cover sizes itself so Randomize layout ends on the first screen (1.13.4, #559 item 2): the room is the
  // screen's height less the Muse tab bar, the page above the cover, and the rows under it down to Randomize layout.
  // The rule that uses it is in styles.css (.stage, pointer: coarse). Neither part depends on the cover's own size.
  const appRef = useRef(null);
  const randomizeRef = useRef(null);
  useLayoutEffect(() => {
    const app = appRef.current, btn = randomizeRef.current, stage = app?.querySelector(".stage");
    if (!app || !btn || !stage) return undefined;
    const fit = () => {
      const s = stage.getBoundingClientRect(), b = btn.getBoundingClientRect();
      // The Spotify card opens above the song row (1.13.7) and is left out, so play never shrinks the cover.
      const card = app.querySelector(".spotifyEmbed");
      const cardRoom = card ? card.getBoundingClientRect().height + (parseFloat(getComputedStyle(card).marginBottom) || 0) : 0;
      const used = Math.ceil(s.top + window.scrollY - cardRoom + (b.bottom - s.bottom) + 8);
      app.style.setProperty("--fit-h", `calc(100svh - var(--host-bar) - env(safe-area-inset-bottom, 0px) - ${used}px)`);
    };
    fit();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(app);
    return () => ro?.disconnect();
  }, [current?.id, story, Boolean(draft), list]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchItem = (item) => setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  const bumpHistory = () => setHistoryTick((t) => t + 1);

  // Every change goes through here, so undo and redo can play it back the same way.
  async function applyChange(itemId, ch) {
    let item = null;
    if (ch.style) item = (await post(`/api/items/${itemId}/style`, ch.style)).item;
    if (ch.edit) item = (await post(`/api/items/${itemId}/edit`, ch.edit)).item;
    if (ch.imageEdit) item = (await post(`/api/items/${itemId}/image-edit`, ch.imageEdit)).item;
    if (ch.rate) item = (await post(`/api/items/${itemId}/rate`, ch.rate)).item;
    // The T icon's tap, undo and redo (1.13.9): this post's own quote, with its mark; set false takes the mark back off.
    if (ch.showQuote != null) item = (await post(`/api/items/${itemId}/quote-toggle`, { showQuote: ch.showQuote, set: ch.set !== false })).item;
    if (ch.slide) item = (await post(`/api/items/${itemId}/slides/${ch.slide.at}/${ch.slide.state === "removed" ? "remove" : "restore"}`)).item;
    if (ch.status) {
      await post(`/api/items/${itemId}/decide`, { decision: ch.status });
      if (ch.status === list) pendingId.current = itemId; // it's back in this list: go to it
      await load();
      return null;
    }
    if (item) patchItem(item);
    return item;
  }
  async function record(label, itemId, before, after) {
    await applyChange(itemId, after);
    history.current.push({ label, itemId, before, after });
    bumpHistory();
  }
  async function step(direction) {
    if (stepping.current) return;
    stepping.current = true;
    try {
      // With the editor open (1.13.5, #559 item 3), her waiting change is saved first, so it's the step that comes
      // off. A step for this cover stays in the editor and shows there. A step for another cover, or a decision,
      // closes the editor first and runs the way it always did.
      const editing = draftNow.current;
      if (editing) {
        if (!(await persistDraft())) return;
        const next = history.current.peek(direction);
        if (!next) return;
        const here = next.itemId === editing.id && !next.before?.status && !next.after?.status;
        if (!here && !(await finishEdit())) return;
      }
      const entry = direction === "undo" ? history.current.undo() : history.current.redo();
      bumpHistory();
      if (!entry) return;
      try {
        const item = await applyChange(entry.itemId, direction === "undo" ? entry.before : entry.after);
        if (item && draftNow.current?.id === item.id) refreshDraft(item);
        say(`${direction === "undo" ? "Undid" : "Redid"} ${entry.label.toLowerCase()}.`);
      } catch (e) {
        // It didn't happen, so it stays where it was in the history.
        if (direction === "undo") history.current.redo(); else history.current.undo();
        bumpHistory();
        say(`Couldn't ${direction} that: ${e.message}`);
      }
    } finally { stepping.current = false; }
  }

  // ---------- Typed but not saved: kept per cover, saved before she moves on or decides ----------
  function setPending(itemId, key, value) {
    const p = { ...(pending.current[itemId] || {}) };
    if (value == null) delete p[key]; else p[key] = value;
    pending.current[itemId] = p;
  }
  function pendingEditFor(item) {
    const p = item && pending.current[item.id];
    if (!p || !Object.keys(p).length) return null;
    const saved = { note: item.note || "", caption: item.caption || "", song: item.song || "" };
    const typed = { note: (p.note ?? saved.note).trim(), caption: p.caption ?? saved.caption, song: (p.song ?? saved.song).trim() };
    const ch = changedFields(saved, typed, ["note", "caption", "song"]);
    if (ch && "caption" in ch.before) ch.before.captionSource = item.captionSource ?? null; // undo restores the source too (1.9)
    if (ch && "song" in ch.before) Object.assign(ch.before, songOf(item)); // and a song steps back whole, clip and all (1.11)
    return ch;
  }
  async function flushPending(item = current) {
    const pe = pendingEditFor(item);
    if (item) delete pending.current[item.id];
    if (pe) await record("Edit", item.id, { edit: pe.before }, { edit: pe.after });
  }
  async function goTo(next) {
    if (next < 0 || next >= items.length || next === index) return;
    await attempt(() => flushPending());
    setIndex(next);
  }
  async function attempt(fn) {
    try { await fn(); } catch (e) { say(e.message); }
  }

  // ---------- Cover actions ----------
  async function decide(decision) {
    if (!current || busy) return;
    if (current.status === decision) { say(decision === "approved" ? "Already approved." : "Already passed."); return; }
    if (!coverReady) return;
    setBusy(true);
    await attempt(async () => {
      if (decision === "approved" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setBurst((n) => n + 1);
        await new Promise((r) => setTimeout(r, 380)); // the heart lands on this cover before the next one slides in
      }
      const pe = pendingEditFor(current); // a note she typed but didn't post goes with the decision
      delete pending.current[current.id];
      await record(decision === "approved" ? "Like" : "Pass", current.id,
        { status: current.status, ...(pe ? { edit: pe.before } : {}) }, { status: decision, ...(pe ? { edit: pe.after } : {}) });
      say(decision === "approved" ? "Approved. Undo is up top." : "Passed. Undo is up top.");
    });
    setBusy(false);
  }
  const remix = () => attempt(async () => {
    const { item } = await post(`/api/items/${current.id}/remix`);
    say(`Remixed. Version ${item.revision} is in your queue.`);
    if (list === "queue") await load();
  });
  const download = () => attempt(async () => {
    const blob = await renderCover(current, { quoteOn, free }); // as the deck shows it, held boxes and all (1.13.8)
    const name = `${displayTitle(current.title)}-cover.jpg`;
    const file = new File([blob], name, { type: "image/jpeg" });
    const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  // The T icon (1.13.9, Arjang via Rose #693 and #694, Quill #695 and #696). A tap turns this post's quote off, or back on,
  // for this post only: a cover edit like any other, so undo puts back exactly what it was, mark and all. A hold is
  // global hide, the 1.13.3 setting: it hides every quote or brings them back, and it isn't a step for undo.
  const hidden = globalHide(quotesStatus?.quoteOverlay);
  const statusNow = useRef(quotesStatus);
  statusNow.current = quotesStatus;
  const holding = useRef(false);
  const tapQuote = () => attempt(async () => {
    const c = current;
    const own = ownQuote(c);
    await record(own ? "Quote off" : "Quote on", c.id, { showQuote: Boolean(c.showQuote), set: Boolean(c.showQuoteSet) }, { showQuote: !own, set: true });
    if (hidden) say(`This cover's quote is ${own ? "off" : "on"}. Quotes stay hidden on every cover until you hold the T again.`);
  });
  const holdQuotes = () => {
    if (holding.current) return; // one hold at a time: the next reads what the last one set
    holding.current = true;
    const was = globalHide(statusNow.current?.quoteOverlay);
    attempt(async () => {
      const r = await post("/api/settings/quote-overlay", { on: was ? null : false });
      const { items: rechecked = [], ...qs } = r;
      statusNow.current = qs;
      setQuotesStatus(qs);
      for (const i of rechecked) patchItem(i);
      say(was ? "Quotes are back. Each cover shows its own." : "Quotes hidden on every cover. Hold the T again to bring them back.");
    }).finally(() => { holding.current = false; });
  };
  const randomize = () => attempt(async () => {
    // The original's six layouts, kept inside the safe zone (1.8). Layout only: never the color, the font or the weight.
    const img = await loadImage(imageUrlFor(current));
    const box = effectiveStyle(current);
    const measure = canvasMeasureAt(box) || ((px) => (t) => t.length * px * 0.5);
    const patch = randomizeLayout({ ...box, quote: current.quote || "" }, img.naturalWidth / img.naturalHeight, measure);
    await record("Randomize", current.id, { style: pickStyle(current, Object.keys(patch)) }, { style: patch });
  });
  // Takes one of her custom colors off her list (1.9.1). Covers that use it keep it.
  const removeCustomColor = (hex) => attempt(async () => {
    const p = await post("/api/palette/custom-colors/remove", { hex });
    setPalette({ palette: p.palette, fonts: p.fonts, customColors: p.customColors || [] });
    say(`Removed ${hex} from your colors.`);
  });
  const postNote = (note) => attempt(async () => {
    setPending(current.id, "note", null);
    await record("Note", current.id, { edit: { note: current.note || "" } }, { edit: { note } });
    say("Note saved for the next revision.");
  });
  // Undo puts a caption's source back with its words (1.9), so a placeholder she typed over is a placeholder again.
  const captionOf = (item) => ({ caption: item.caption || "", captionSource: item.captionSource ?? null });
  const saveCaption = (caption) => attempt(() => { setPending(current.id, "caption", null); return record("Caption", current.id, { edit: captionOf(current) }, { edit: { caption } }); });
  // The Comment CTA switch (1.10, renamed in 1.10.1): a keyword turns it on, null turns it off; undo steps back like any edit.
  const setCta = (keyword) => attempt(() => record("Comment CTA", current.id, { edit: { cta: current.cta ?? null } }, { edit: { cta: keyword } }));
  // A song steps back whole: its name, preview, Spotify link, and the downloaded hook clip with its source (1.11).
  const songOf = (item) => ({ song: item.song || "", songPreviewUrl: item.songPreviewUrl || "", songSpotifyUrl: item.songSpotifyUrl || "",
    songFile: item.songFile ?? null, songHook: item.songHook ?? null, songSource: item.songSource ?? "" });
  async function regenerate(kind) {
    const before = kind === "caption" ? captionOf(current) : songOf(current);
    await attempt(async () => {
      const { item } = await post(`/api/items/${current.id}/edit`, kind === "caption" ? { regenerateCaption: true } : { shuffleSong: true });
      patchItem(item);
      const after = kind === "caption" ? captionOf(item) : songOf(item);
      history.current.push({ label: kind === "caption" ? "Caption" : "Song", itemId: item.id, before: { edit: before }, after: { edit: after } });
      bumpHistory();
    });
  }
  const setSong = (song) => attempt(() => { setPending(current.id, "song", null); return record("Song", current.id, { edit: songOf(current) }, { edit: { song } }); });
  const rate = (key, stars) => attempt(() => record("Rating", current.id, { rate: { [key]: current[key] ?? null } }, { rate: { [key]: valueForStars(stars) } }));
  const recheck = () => attempt(async () => {
    const { item } = await post(`/api/items/${current.id}/verify`);
    patchItem(item);
  });
  const addSlide = (file) => attempt(async () => {
    const { item } = await upload(`/api/items/${current.id}/slides`, "slide", file);
    patchItem(item);
    const at = item.slides.length - 1;
    history.current.push({ label: "Add slide", itemId: item.id, before: { slide: { at, state: "removed" } }, after: { slide: { at, state: "active" } } });
    bumpHistory();
    setSlide(item.slides.filter((s) => !s.deletedAt).length);
  });
  const removeSlide = () => attempt(async () => {
    const s = activeSlides[slide - 1];
    if (!s) return;
    await record("Remove slide", current.id, { slide: { at: s.at, state: "active" } }, { slide: { at: s.at, state: "removed" } });
    setSlide((n) => Math.max(0, n - 1));
  });
  const swapPhoto = (r) => attempt(async () => {
    const { item } = await post(`/api/items/${current.id}/swap-photo`, { imageUrl: r.imageUrl, title: r.title });
    patchItem(item);
    say("Photo swapped. Quote, song and style stayed.");
  });
  const restorePhoto = () => attempt(async () => { patchItem((await post(`/api/items/${current.id}/restore-original`)).item); });
  const searchPhotos = async (q) => (await api(`/api/photos/search?q=${encodeURIComponent(q)}`)).results;
  const pan = (key, value) => patchItem({ ...current, [key]: value });
  const panDone = () => attempt(async () => {
    patchItem((await post(`/api/items/${current.id}/story-framing`, { storyPanX: current.storyPanX, storyPanY: current.storyPanY })).item);
  });

  // ---------- The editor: every change saves as she goes (1.8), each save one undo step ----------
  // What the editor works on: the cover with its full style and its photo edits filled in.
  const editorCopy = (item) => JSON.parse(JSON.stringify({ ...item, ...effectiveStyle(item), imageEdit: { contrast: "normal", mosaics: [], ...(item.imageEdit || {}) } }));
  // An undo or redo inside the editor (1.13.5): the editor shows the cover as it now is, with nothing waiting to save.
  function refreshDraft(item) {
    const fresh = editorCopy(item);
    draftSaved.current = JSON.parse(JSON.stringify(fresh));
    draftNow.current = fresh;
    setDraft(fresh);
    setActiveBox((b) => (b >= (fresh.extraTexts || []).length ? -1 : b));
  }
  function startEdit(box = -1) {
    if (!current) return;
    setStory(false);
    setSlide(0);
    const opened = editorCopy(current);
    draftSaved.current = JSON.parse(JSON.stringify(opened));
    draftNow.current = opened;
    setSaveState("idle");
    setDraft(opened);
    setActiveBox(box);
    // The sheet covers the lower part of the screen, like the original. If the cover's top is hidden under
    // the header, bring it down into view; otherwise the page stays where she left it.
    requestAnimationFrame(() => {
      const stage = document.querySelector(".stage")?.getBoundingClientRect();
      const bar = document.querySelector(".topbar")?.getBoundingClientRect();
      if (stage && bar && stage.top < bar.bottom - 1) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollBy({ top: stage.top - bar.bottom, behavior: reduce ? "auto" : "smooth" });
      }
    });
  }
  function closeEditor() {
    draftSaved.current = null;
    draftNow.current = null;
    setDraft(null);
    setActiveBox(-1);
    setPickMode(false);
    // Back to the cover she just changed, wherever the editor left the page.
    requestAnimationFrame(() => document.querySelector(".stage")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  const setDraftItem = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setBox = (patch) => setDraft((d) => (activeBox === -1 ? { ...d, ...patch } : { ...d, extraTexts: d.extraTexts.map((b, i) => (i === activeBox ? { ...b, ...patch } : b)) }));
  const setImageEdit = (patch) => setDraft((d) => ({ ...d, imageEdit: { ...(d.imageEdit || {}), ...patch } }));
  const moveBox = (box, h, v) => setDraft((d) => (box === -1 ? { ...d, horizontalPosition: h, verticalPosition: v }
    : { ...d, extraTexts: d.extraTexts.map((b, i) => (i === box ? { ...b, horizontalPosition: h, verticalPosition: v } : b)) }));
  function newBox() {
    if (!draft || draft.extraTexts.length >= MAX_BOXES) return;
    const main = effectiveStyle(draft);
    const at = draft.extraTexts.length;
    // A new text box starts in TikTok Sans Regular (1.8), with the rest of the cover's look.
    const box = { ...pickStyle(draft, STYLE_KEYS), textFont: "tiktok", fontWeight: 400, quote: "Your text", verticalPosition: main.verticalPosition > 55 ? 22 : 78, lineCount: 0 };
    setDraft((d) => ({ ...d, extraTexts: [...d.extraTexts, box] }));
    setActiveBox(at);
  }
  function removeBox() {
    setDraft((d) => ({ ...d, extraTexts: d.extraTexts.filter((_, i) => i !== activeBox) }));
    setActiveBox(-1);
  }
  function addMosaic() {
    setImageEdit({ mosaics: [...(draft.imageEdit?.mosaics || []), { x: 35, y: 25, w: 30, h: 30 }] });
    say("Drag the box over a face. Drag its corner to resize it.");
  }
  // What changed between two states of the draft, as one undoable change: { before, after }, or null.
  function draftChange(base, now) {
    const style = changedFields(effectiveStyle(base), effectiveStyle(now), [...STYLE_KEYS, "extraTexts"]);
    const edit = changedFields({ quote: base.quote || "", note: base.note || "" }, { quote: now.quote || "", note: now.note || "" }, ["quote", "note"]);
    const imageEdit = changedFields({ contrast: base.imageEdit?.contrast || "normal", mosaics: base.imageEdit?.mosaics || [] },
      { contrast: now.imageEdit?.contrast || "normal", mosaics: now.imageEdit?.mosaics || [] }, ["contrast", "mosaics"]);
    const flip = Boolean(base.showQuote) !== Boolean(now.showQuote);
    if (!style && !edit && !imageEdit && !flip) return null;
    const before = {}, after = {};
    if (style) { before.style = style.before; after.style = style.after; }
    if (edit) { before.edit = edit.before; after.edit = edit.after; }
    if (imageEdit) { before.imageEdit = imageEdit.before; after.imageEdit = imageEdit.after; }
    if (flip) { before.showQuote = Boolean(base.showQuote); after.showQuote = Boolean(now.showQuote); }
    return { before, after, style };
  }
  // Sends what changed since the last save, one save at a time. Each save is one step for Undo, like the original's
  // one command per change. Resolves false if it couldn't save.
  function persistDraft() {
    saveChain.current = saveChain.current.then(async () => {
      const base = draftSaved.current, now = draftNow.current;
      if (!base || !now || base.id !== now.id) return true;
      const ch = draftChange(base, now);
      if (!ch) return true;
      setSaveState("saving");
      try {
        await applyChange(now.id, ch.after);
        history.current.push({ label: "Edit", itemId: now.id, before: ch.before, after: ch.after });
        bumpHistory();
        if (draftSaved.current?.id === now.id) draftSaved.current = JSON.parse(JSON.stringify(now));
        setSaveState("saved");
        if (ch.style?.after.textColor || ch.style?.after.extraTexts) api("/api/palette").then((p) => setPalette({ palette: p.palette, fonts: p.fonts, customColors: p.customColors || [] })).catch(() => {});
        return true;
      } catch (e) {
        setSaveState("error");
        say(`Couldn't save: ${e.message}`);
        return false;
      }
    });
    return saveChain.current;
  }
  useEffect(() => {
    draftNow.current = draft;
    if (!draft) return undefined;
    const t = setTimeout(persistDraft, 600);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every way out of the editor just closes it: what she changed is saved first. False keeps it open.
  async function finishEdit() {
    if (!(await persistDraft())) return false;
    closeEditor();
    return true;
  }
  function onPick(hex) {
    setPickMode(false);
    if (hex) setBox({ textColor: hex });
    else say("Couldn't read that color. Try another spot.");
  }

  // ---------- Library, info and setup ----------
  async function uploadPhotos(files) {
    const form = new FormData();
    files.forEach((f) => form.append("photos", f));
    await attempt(async () => {
      const r = await api("/api/items/upload", { method: "POST", body: form });
      say(`${r.created.length} photo${r.created.length === 1 ? "" : "s"} added to your queue.`);
      if (list !== "queue") { closeEditor(); setList("queue"); } else await load();
    });
  }
  function openFromLibrary(item) {
    const at = items.findIndex((i) => i.id === item.id);
    if (at >= 0) setIndex(at);
    setView("cover");
  }
  function switchList(next) {
    if (next === list) return;
    closeEditor();
    setIndex(0);
    setList(next);
  }
  async function showLibrary() {
    await attempt(() => flushPending());
    setView("library");
  }
  // ---------- Songs: Symphony's screens (1.12), from a cover's song row or from all covers ----------
  async function showSongs(from) {
    await attempt(() => flushPending());
    setSongsFrom(from);
    setView("songs");
  }
  function closeSongs() {
    setView(songsFrom);
    if (songsFrom === "cover") requestAnimationFrame(() => document.querySelector(".songRow")?.scrollIntoView({ block: "center" }));
  }
  // Use on this cover: the song whole, with its hook clip and hook, as one undoable step like any song change.
  const putSongOnCover = (s) => attempt(async () => {
    if (!current) return;
    setPending(current.id, "song", null);
    await record("Song", current.id, { edit: songOf(current) }, { edit: coverSongEdit(s) });
    closeSongs();
    say(`${s.title} is on this cover. Undo is up top.`);
  });

  useEffect(() => {
    function onKey(e) {
      if (draft || zoom || infoOpen || sheet || view !== "cover") return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); step(e.shiftKey ? "redo" : "undo"); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); if (e.shiftKey) setSlide((s) => Math.min(activeSlides.length, s + 1)); else goTo(index + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); if (e.shiftKey) setSlide((s) => Math.max(0, s - 1)); else goTo(index - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const counts = status?.counts;
  return (
    <div ref={appRef} className={draft ? "app editing" : "app"}>
      {view === "songs" ? (
        <SongsView forCover={songsFrom === "cover" ? current : null} closeLabel={songsFrom === "cover" ? "Back to the cover" : "Back to all covers"}
          onClose={closeSongs} onUse={putSongOnCover} />
      ) : view === "library" ? (
        <LibraryView list={list} setList={switchList} items={items} counts={counts} pollenOn={Boolean(pollen?.connected)} canClose
          onOpen={openFromLibrary} onUpload={uploadPhotos} onClose={() => setView("cover")} onSongs={symphony?.connected ? () => showSongs("library") : null}
          onSchedule={(ids, stop) => setSheet({ items: items.filter((i) => ids.includes(i.id)), stop })} />
      ) : (
        <>
        <main className="review" inert={zoom ? true : undefined}>
          <CoverHeader list={list} count={counts?.[list] ?? items.length} position={index + 1} total={items.length}
            canUndo={history.current.canUndo()} canRedo={history.current.canRedo()} locked={Boolean(draft)}
            onBack={showLibrary} onInfo={() => setInfoOpen(true)} onUndo={() => step("undo")} onRedo={() => step("redo")} />
          {!current ? (
            <div className="emptyCover">
              <p className="emptyTitle">{list === "queue" ? "Your queue is clear." : list === "approved" ? "No approved covers yet." : "Nothing passed yet."}</p>
              <p className="hint">Add photos, or ask your Muse to bring in your Drive photos. No connectors needed.</p>
              <label className="primaryBtn asLabel">
                <Icon name="photoAdd" size={20} /> Add photos
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; if (files.length) uploadPhotos(files); }} />
              </label>
              <button type="button" className="secondaryBtn" onClick={() => setView("library")}>See all covers</button>
            </div>
          ) : (
            <>
              {/* While the editor sheet is open, the review screen stays behind it, seen but not reachable. */}
              <div className="behind" inert={draft ? true : undefined}>
                <ModeSwitch story={story} setStory={setStory} />
                <SongRow item={current} onShuffle={() => regenerate("song")} onSetSong={setSong} onDraft={(v) => setPending(current.id, "song", v)}
                  onSongs={symphony?.connected ? () => showSongs("cover") : null} />
              </div>
              <CoverStage item={shown} quoteOn={quoteOn} slides={activeSlides} slide={slide} setSlide={setSlide} story={story && !draft}
                editing={Boolean(draft)} activeBox={activeBox} onStartEdit={(box) => startEdit(box)} onSelectBox={setActiveBox} onMoveBox={moveBox}
                pickMode={pickMode} onPick={onPick} onMosaicsChange={(mosaics) => setImageEdit({ mosaics })} burst={burst} onDrawn={setDrawnId}
                onZoom={setZoom} onTapOff={() => sheetDismiss.current?.()} free={free} onFree={freeBox} />
              <div className="behind" inert={draft ? true : undefined}>
                <ActionRow item={current} busy={busy || !coverReady} onLike={() => decide("approved")} onDislike={() => decide("rejected")} onRemix={remix} onDownload={download}
                  quote={{ on: quoteOn, locked: !quotesStatus?.unlocked, onTap: tapQuote, onHold: holdQuotes }}
                  onComment={() => { noteRef.current?.focus(); noteRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }} onEdit={() => startEdit(-1)} />
                {story && <StoryControls item={current} onPan={pan} onPanDone={panDone} />}
                <Steppers slide={slide} total={activeSlides.length + 1} onSlide={setSlide} onAddSlide={addSlide} onRemoveSlide={removeSlide}
                  canPrevPost={index > 0} canNextPost={index < items.length - 1} onPrevPost={() => goTo(index - 1)} onNextPost={() => goTo(index + 1)} />
                <button type="button" ref={randomizeRef} className="outlineBtn wide randomize" onClick={randomize}><Icon name="sparkle" size={20} /> Randomize layout</button>
                <NoteComposer item={current} onPost={postNote} onDraft={(v) => setPending(current.id, "note", v)} inputRef={noteRef} />
                <TitleRow item={current} />
                {list === "approved" && current.pollen?.error && ["failed", "not_sent"].includes(current.pollen.status) && <p className="problem">{current.pollen.error}</p>}
                <CaptionRow item={current} ctas={ctas} onCta={setCta} onSave={saveCaption} onRedo={() => regenerate("caption")} onDraft={(v) => setPending(current.id, "caption", v)} />
                <ComposeCheck item={current} onRecheck={recheck} busy={busy} />
                <WhyMatches why={current.why} />
                <ImageInfo item={current} onSwap={swapPhoto} onRestore={restorePhoto} searchPhotos={searchPhotos} />
                <Ratings item={current} onRate={rate} />
              </div>
              {draft && (
                <EditorSheet onDismiss={finishEdit} status={saveState} dismissRef={sheetDismiss}
                  history={{ canUndo: history.current.canUndo(), canRedo: history.current.canRedo(), onUndo: () => step("undo"), onRedo: () => step("redo") }}>
                  <CoverEditor draft={draft} activeBox={activeBox} setActiveBox={setActiveBox} setBox={setBox} setItem={setDraftItem} setImageEdit={setImageEdit}
                    palette={palette.palette} fonts={palette.fonts} customColors={palette.customColors} quotesUnlocked={Boolean(quotesStatus?.unlocked)}
                    pickMode={pickMode} setPickMode={setPickMode} onRemoveBox={removeBox}
                    onNewBox={newBox} onAddMosaic={addMosaic} canAddBox={draft.extraTexts.length < MAX_BOXES} onRemoveCustomColor={removeCustomColor} />
                </EditorSheet>
              )}
            </>
          )}
          <BrandFoot />
        </main>
        {zoom && current && (
          <ZoomView item={shown} quoteOn={quoteOn} slideUrl={zoom.slideUrl} source={zoom.source} free={free}
            onClose={() => { setZoom(null); requestAnimationFrame(() => document.querySelector(".zoomBtn")?.focus({ preventScroll: true })); }} />
        )}
        </>
      )}

      {infoOpen && (
        <InfoSheet status={status} pollen={pollen} quotesStatus={quotesStatus} quizQuotes={quizQuotes} list={list} currentId={current?.id}
          onClose={() => setInfoOpen(false)} onUpload={uploadPhotos}
          onSortDump={() => attempt(async () => { const r = await post("/api/dump/sort"); say(r.message); await load(); })}
          onConsent={() => attempt(async () => {
            const handle = window.prompt("Your Instagram handle, with the @");
            if (!handle) return;
            await post("/api/connectors/instagram/consent", { captionConsent: true, handle });
            await load();
          })}
          onConnectPollen={async (code) => { await post("/api/connectors/pollen", { code }); await load(); }}
          onQuizDecide={(text, keep) => attempt(async () => { await post("/api/quiz/decide", { text, keep }); await load(); })}
          onConnectQuotes={(raw) => attempt(async () => {
            const quotes = raw.split("\n").map((s) => s.trim()).filter(Boolean);
            if (quotes.length) { await post("/api/quotes/connect", { quotes }); await load(); say("Your quotes are connected."); }
          })}
          onGrievance={(text, context) => post("/api/grievances", { text, context })} />
      )}

      {sheet && (
        <ScheduleSheet items={sheet.items} ctas={ctas} quotesUnlocked={Boolean(quotesStatus?.unlocked)} quoteOverlay={quotesStatus?.quoteOverlay ?? null} api={api} post={post}
          onClose={() => { setSheet(null); load().catch(() => {}); }}
          onDone={() => { sheet.stop(); setSheet(null); load().catch(() => {}); }} />
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast.text}</div>}
    </div>
  );
}
