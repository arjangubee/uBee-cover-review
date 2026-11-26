import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, post, upload } from "./api.js";
import { ActionRow, BrandFoot, CaptionRow, ComposeCheck, NoteComposer, RateQuality, Steppers, StoryControls, SwipeRow, TitleRow } from "./CoverDetails.jsx";
import CoverEditor from "./CoverEditor.jsx";
import EditorSheet from "./EditorSheet.jsx";
import ZoomView from "./ZoomView.jsx";
import { imageUrlFor, loadImage } from "./CoverCanvas.jsx";
import { photoTone, pickHouseColor, seeded } from "./houseColor.js";
import CoverStage from "./CoverStage.jsx";
import { CoverHeader, ModeSwitch, SongRow } from "./CoverTop.jsx";
import Icon from "./icons.jsx";
import InfoSheet from "./InfoSheet.jsx";
import SearchSheet from "./SearchSheet.jsx";
import LibraryView from "./LibraryView.jsx";
import RemixSheet from "./RemixSheet.jsx";
import { badgeFor, selectable } from "./pollenView.js";
import { STYLE_DEFAULTS, canvasMeasureAt, colorPatch, ensureFonts, lookOf, normalizePlacement, randomizeLayout, registerFonts, renderCover, withDefaults, withLook } from "./renderCover.js";
import { changedFields, displayTitle, valueForStars } from "./reviewMath.js";
import ScheduleSheet from "./ScheduleSheet.jsx";
import { coverSongEdit } from "./songs/songsData.js";
import SongsView from "./songs/SongsView.jsx";
import { createHistory } from "./undo.js";
import { globalHide, ownQuote, quoteShown } from "./quoteOverlay.js";
import { setBusy as setScreenBusy } from "./busy.js";

const STYLE_KEYS = Object.keys(STYLE_DEFAULTS);
const MAX_BOXES = 5;
const LOOK_KEYS = ["textFont", "textColor"]; // the queue's look (1.20.0, Big Edit item 1): one font and one color for every queued cover
const NO_PALETTE = { palette: [], fonts: [], customColors: [], brandColors: [], lock: { textFont: null, textColor: null }, customFonts: [] };

/** A cover's style with every default filled in, so an edit compares what she actually sees. */
function effectiveStyle(item) {
  const s = withDefaults(item);
  const out = {};
  for (const k of STYLE_KEYS) out[k] = s[k];
  out.extraTexts = Array.isArray(item.extraTexts) ? item.extraTexts : [];
  return out;
}
const pickStyle = (item, keys) => Object.fromEntries(keys.map((k) => [k, effectiveStyle(item)[k]]));
/** A cover with one text box at a new spot: index -1 is the quote, 0 and up her own boxes. */
// m.w is the narrower width a landscape drag re-wrapped the box to (1.27.0, Quill #1145), or null when it kept its width.
const placed = (m) => ({ horizontalPosition: m.h, verticalPosition: m.v, ...(m.w != null ? { textWidth: m.w } : {}) });
const placeBox = (item, m) => (m.index === -1 ? { ...item, ...placed(m) }
  : { ...item, extraTexts: (item.extraTexts || []).map((b, i) => (i === m.index ? { ...b, ...placed(m) } : b)) });
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
  const [editSlide, setEditSlide] = useState(null); // the photo the editor is on: null is the cover, a number a carousel photo (1.20.0)
  const [pickMode, setPickMode] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // the editor saves as she goes (1.8): idle | saving | saved | error
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // { items, stop } while the Schedule sheet is open
  const [palette, setPalette] = useState(NO_PALETTE);
  // The editor reads the palette while it works, so it never reads one from before the last change (1.20.0).
  const paletteNow = useRef(NO_PALETTE);
  const applyPalette = useCallback((p) => {
    if (!p) return;
    registerFonts(p.customFonts); // her own fonts, from her data folder (1.20.0, Big Edit item 4)
    const next = { palette: p.palette || [], fonts: p.fonts || [], customColors: p.customColors || [], brandColors: p.brandColors || [],
      lock: p.lock || NO_PALETTE.lock, customFonts: p.customFonts || [] };
    paletteNow.current = next;
    setPalette(next);
  }, []);
  const [quotesStatus, setQuotesStatus] = useState(null);
  const [quizQuotes, setQuizQuotes] = useState([]);
  const [pollen, setPollen] = useState(null);
  const [ctas, setCtas] = useState([]); // the space's comment CTAs (1.10); none means no switch under the caption
  const [symphony, setSymphony] = useState(null); // Symphony online (1.12): connected means the Songs screen is there
  const [songsFrom, setSongsFrom] = useState("cover"); // where the Songs screen goes back to: a cover, or all covers
  const [toast, setToast] = useState(null);
  const [remixOpen, setRemixOpen] = useState(false); // the remix menu (1.17.0)
  const [remixing, setRemixing] = useState([]); // remixes still being made: each comes next once it's done
  // The swipe (1.34.0, Arjang Nov 26: like Tinder). intent is where the card on the stage is headed, for the swipe row's
  // buttons: { dir, solid, phase }. enterFrom is a cover Rewind brings back, flying in from the side it left by.
  const [intent, setIntent] = useState(null);
  const [enterFrom, setEnterFrom] = useState(null);
  const stageApi = useRef(null); // the stage's fly(dir) and busy(), for the X and heart buttons
  const swipes = useRef([]); // her swipes in this list, newest last, for Rewind
  const leaving = useRef(new Set()); // covers swiped away whose decision hasn't reached the server yet
  const inFlight = useRef(0); // swipe and rewind calls still on their way
  const [drawnId, setDrawnId] = useState(null); // the cover whose photo is on screen: only that one can be decided
  const [loads, setLoads] = useState(0); // counts finished loads; each one starts the caption fill loop (1.9)
  const [checksReady, setChecksReady] = useState(false); // the 1.13.9 recheck has had its turn: checks can start (1.21.0)
  const [checkTick, setCheckTick] = useState(0);
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

  // 1.27.1 (room #1193, #1207, Quill #1208): one call that fails never blanks Covers. Before, the four calls shared one
  // Promise.all with no catch, so any one failing threw before the list was set and the screen read "Your queue is clear."
  // Now each call settles on its own, the covers list is tried up to 3 times, and a failure stays on screen (loadError)
  // naming the call, with Try again, until a load works. A failed list keeps the covers she had and never reads as empty.
  const [loadError, setLoadError] = useState(null); // { calls: [names], items: true when the covers list failed, why }
  // keep (1.34.0): the cover on screen stays on screen, wherever the fresh list puts it.
  const load = useCallback(async ({ keep = false } = {}) => {
    const failed = [];
    let why = "";
    const soft = (path, name) => api(path).catch((e) => {
      console.error(`Cover Review: ${path} didn't load: ${e.message}`);
      if (name) { failed.push(name); why ||= e.message; }
      return null;
    });
    const listOf = async () => {
      for (let tries = 1; tries <= 3; tries++) {
        try { return await api(`/api/items?status=${list}`); } catch (e) {
          console.error(`Cover Review: /api/items?status=${list} didn't load (try ${tries}): ${e.message}`);
          if (tries === 3) { failed.unshift("the covers list"); why = e.message; return null; }
          await new Promise((r) => setTimeout(r, 600 * tries));
        }
      }
      return null;
    };
    const [s, q, qs, quiz, pc, pal, calls, sym] = await Promise.all([
      soft("/api/setup/status", "setup status"), listOf(), soft("/api/quotes/status", "quotes status"), soft("/api/quiz/quotes", "quiz quotes"),
      soft("/api/pollen/channels"), soft("/api/palette"), soft("/api/settings/caption-ctas"), soft("/api/connectors/symphony"),
    ]);
    setSymphony(sym);
    if (s) setStatus(s);
    if (qs) setQuotesStatus(qs);
    if (quiz) setQuizQuotes(quiz.quotes);
    setPollen(pc);
    applyPalette(pal);
    setCtas(calls?.ctas || []);
    if (q) {
      if (keep === true && pendingId.current == null && currentIdNow.current != null) pendingId.current = currentIdNow.current;
      // A cover she just swiped away stays away while its decision is still on its way (1.34.0).
      setItems((Array.isArray(q.items) ? q.items : []).filter((i) => !leaving.current.has(i.id))); // a failed list keeps the covers she had
    }
    setLoadError(failed.length ? { calls: failed, items: !q, why } : null);
    if (q) setLoads((n) => n + 1);
  }, [list, applyPalette]);
  const retryLoad = () => { load().catch((e) => say(e.message)); };
  const loadErrorBar = loadError && (
    <div className="loadError" role="alert">
      <p>{loadError.calls.join(", ").replace(/^./, (c) => c.toUpperCase())} didn't load{loadError.why ? `: ${loadError.why}` : ""}.</p>
      <button type="button" className="linkBtn" onClick={retryLoad}>Try again</button>
    </div>
  );
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
          if (!r.rechecked || !r.item) continue;
          // The check's caveman lines (1.21.0) come with every recheck, so the card has them without a second check.
          setItems((prev) => prev.map((i) => (i.id === r.item.id && r.item.rationale ? { ...i, rationale: r.item.rationale } : i)));
          if (!r.changed?.length) continue;
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
  const currentIdNow = useRef(null);
  currentIdNow.current = current?.id ?? null;
  const itemsNow = useRef(items);
  itemsNow.current = items;
  const indexNow = useRef(index);
  indexNow.current = index;
  // An editor or a sheet open means she's busy: the update notes above both screens wait for a quiet minute (1.13.10, 1.14).
  const inUse = Boolean(draft) || infoOpen || Boolean(sheet) || remixOpen;
  useEffect(() => { setScreenBusy("covers", inUse); }, [inUse]);
  useEffect(() => () => setScreenBusy("covers", false), []);
  // A queued cover draws with the queue's look (1.20.0, Big Edit items 1 and 2): her last font and color, or her default color.
  const look = useMemo(() => lookOf(palette), [palette]);
  // A text box she's placing by hold and drag (1.20.0, Big Edit item 9) shows where her thumb has it until it's saved.
  const [moving, setMoving] = useState(null);
  const movingNow = useRef(null);
  const drawnNow = withLook(current, look);
  const shown = draft && current && draft.id === current.id ? draft
    : moving && current && moving.id === current.id ? placeBox(drawnNow, moving) : drawnNow;
  const quoteOn = Boolean(quoteShown(shown, quotesStatus?.quoteOverlay) && quotesStatus?.unlocked); // 1.13.9: global hide, else the post's own (on by default)
  const activeSlides = useMemo(() => (shown?.slides || []).map((s, at) => ({ ...s, at }))
    .filter((s) => !s.deletedAt).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [shown]);
  // The magnifier works on the cover or a photo slide, never in Story view or on a video (1.7).
  const zoomable = !story && !(slide > 0 && activeSlides[slide - 1]?.mediaType === "video");
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
    const run = async () => { await recheckSavedChecks(current?.id ?? null); setChecksReady(true); await fillPlacements(current?.id ?? null); };
    const idle = typeof window !== "undefined" && window.requestIdleCallback;
    const handle = idle ? window.requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 800);
    return () => (idle ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, [loads]); // eslint-disable-line react-hooks/exhaustive-deps
  // The compose check comes checked (1.21.0, Big Edit item 12): the moment a cover is second in the queue, the one after
  // the cover on screen, it's checked, and so is the cover on screen when it isn't yet, or when what it shows changed
  // since its check (the quote, the song, or whether the quote shows). A check saved before 1.13.9 is left to that pass,
  // which runs first. One check at a time, when the browser is free; one that fails waits for the next load. Only the
  // check is patched in, so nothing else moves. A copy with a model writes its own lines after each check
  // (rationale-fill); one without answers no-model once, and that rests for the session.
  const checking = useRef(false);
  const checkFailed = useRef(new Set());
  const checkedAs = useRef(new Map()); // id -> what the cover showed when this page checked it: never the same check twice
  const linesModel = useRef(true);
  const quoteOnFor = (item) => Boolean(quoteShown(item, quotesStatus?.quoteOverlay) && quotesStatus?.unlocked);
  // The cover a swipe uncovers (1.34.0): the next one, or the one before when she's on the last.
  const under = useMemo(() => { const n = items[index + 1] ?? items[index - 1]; return n ? withLook(n, look) : null; }, [items, index, look]);
  const underQuoteOn = under ? quoteOnFor(under) : false;
  const shownAs = (item) => JSON.stringify([String(item.quote ?? ""), String(item.song ?? ""), quoteOnFor(item)]);
  const linesFor = (item) => {
    const b = item?.rationale?.basedOn;
    return b && b.quote === String(item.quote ?? "") && b.song === String(item.song ?? "") && Boolean(b.quoteOn) === quoteOnFor(item) ? item.rationale : null;
  };
  const wantsCheck = (item) => Boolean(item?.imageUrl) && !checkFailed.current.has(item.id) && checkedAs.current.get(item.id) !== shownAs(item)
    && (!item.beacons || !linesFor(item));
  const toCheck = checksReady && quotesStatus && view === "cover" ? [items[index], items[index + 1]].filter(wantsCheck) : [];
  const toCheckKey = toCheck.map((i) => i.id).join();
  useEffect(() => {
    if (!toCheckKey || checking.current) return;
    checking.current = true;
    (async () => {
      for (const it of toCheck) {
        await whenIdle();
        try {
          checkedAs.current.set(it.id, shownAs(it));
          let { item } = await post(`/api/items/${it.id}/verify`);
          if (linesModel.current && item.rationale?.source !== "model") {
            const r = await post(`/api/items/${it.id}/rationale-fill`, {}).catch(() => null);
            if (r?.reason === "no-model") linesModel.current = false;
            else if (r?.drafted && r.item) item = r.item;
          }
          const check = { beacons: item.beacons, composeAttestedAt: item.composeAttestedAt, beaconsVersion: item.beaconsVersion, rationale: item.rationale ?? null };
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...check } : i)));
        } catch { checkFailed.current.add(it.id); }
      }
      checking.current = false;
      setCheckTick((t) => t + 1); // look again: she may have moved on meanwhile
    })();
  }, [toCheckKey, checkTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The boxes she has dragged on this cover this session leave the deck's safe hold, like the original's
  // positionedTextIds (1.13.8): never saved, and cleared when the cover changes.
  const [free, setFree] = useState(() => new Set());
  useEffect(() => { setFree(new Set()); }, [current?.id]);
  const freeBox = useCallback((i) => setFree((f) => (f.has(i) ? f : new Set([...f, i]))), []);
  useEffect(() => { if (slide > activeSlides.length) setSlide(activeSlides.length); }, [activeSlides.length, slide]);

  // 1.14.1 (Arjang #790): the cover fills the column edge to edge (1.13.4's phone fit is gone). The magnifier's button
  // sits in the action row and opens the zoom through zoomRef. While the Spotify card is open, the header and the view
  // switch move up out of its way, so the cover never moves. Color lock rides on Randomize layout, on by default.
  const zoomRef = useRef(null);
  const [playerUp, setPlayerUp] = useState(false);
  const [colorLock, setColorLock] = useState(true);

  const patchItem = (item) => setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));

  // Each queued cover's own color (1.26.0, Arjang #1092, Quill #1140): picked once from its photo by the house palette,
  // one cover at a time while she's idle, and never over a color she picked herself (the server keeps hers). The cover
  // open in the editor waits for the next run.
  const editingId = useRef(null);
  editingId.current = draft?.id ?? null;
  const coloring = useRef(false);
  const colorTried = useRef(new Set());
  useEffect(() => {
    if (coloring.current) return;
    const todo = items.filter((i) => i.status === "queue" && i.imageUrl && !i.textColorSet && !i.colorAuto && !colorTried.current.has(i.id));
    if (!todo.length) return;
    coloring.current = true;
    (async () => {
      for (const it of todo) {
        await whenIdle();
        if (editingId.current === it.id) continue;
        colorTried.current.add(it.id);
        const tone = await photoTone(imageUrlFor(it), it);
        if (!tone) continue;
        try {
          const r = await post(`/api/items/${it.id}/auto-color`, { textColor: pickHouseColor(tone, seeded(it.id)) });
          const c = r?.item;
          if (c) setItems((prev) => prev.map((i) => (i.id === c.id ? { ...i, textColor: c.textColor, extraTexts: c.extraTexts, colorAuto: c.colorAuto, textColorSet: c.textColorSet } : i)));
        } catch { /* it's tried again next time the app opens */ }
      }
      coloring.current = false;
    })();
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const bumpHistory = () => setHistoryTick((t) => t + 1);

  // Every change goes through here, so undo and redo can play it back the same way.
  async function applyChange(itemId, ch) {
    let item = null;
    if (ch.lock) applyPalette(await post("/api/text-lock", ch.lock)); // the queue's font and color (1.20.0)
    if (ch.style) item = (await post(`/api/items/${itemId}/style`, ch.style)).item;
    if (ch.style?.textColor) applyPalette(await api("/api/palette")); // a new color shows in her recent colors (1.26.0)
    if (ch.edit) item = (await post(`/api/items/${itemId}/edit`, ch.edit)).item;
    if (ch.imageEdit) item = (await post(`/api/items/${itemId}/image-edit`, ch.imageEdit)).item;
    if (ch.rate) item = (await post(`/api/items/${itemId}/rate`, ch.rate)).item;
    // The T icon's tap, undo and redo (1.13.9): this post's own quote, with its mark; set false takes the mark back off.
    if (ch.showQuote != null) item = (await post(`/api/items/${itemId}/quote-toggle`, { showQuote: ch.showQuote, set: ch.set !== false })).item;
    if (ch.remix) item = (await post(`/api/items/${itemId}/remix-fields`, { fields: ch.remix })).item; // a remix on the spot (1.21.0)
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
      if (entry.done) await entry.done.catch(() => {}); // a swipe's own calls land first, so this step comes after them
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
  // The swipe (1.34.0, Arjang Nov 26: "exactly like Tinder"). Right approves, left passes, by a drag on the cover or the
  // heart and X buttons, which send the card off the same way. The card leaves the list the moment it flies, and its
  // decision goes to the server behind it, with a note she typed but didn't post, as one step for Undo up top. One that
  // fails comes back with a toast. Rewind takes back her last swipe in this list and flies the card back in.
  const canSwipe = (dir) => {
    if (!current || busy || draft || enterFrom) return false;
    if (current.status === (dir > 0 ? "approved" : "rejected")) { say(dir > 0 ? "Already approved." : "Already passed."); return false; }
    return true;
  };
  function settle() {
    inFlight.current -= 1;
    if (!inFlight.current) load({ keep: true }).catch(() => {}); // once all are in, the list matches the server again
  }
  function commitSwipe(dir, id) {
    const item = itemsNow.current.find((i) => i.id === id);
    const decision = dir > 0 ? "approved" : "rejected";
    if (!item || item.status === decision) return false;
    const pe = pendingEditFor(item); // a note she typed but didn't post goes with the decision
    delete pending.current[item.id];
    const entry = { label: dir > 0 ? "Like" : "Pass", itemId: id, swipe: dir, item,
      before: { status: item.status, ...(pe ? { edit: pe.before } : {}) }, after: { status: decision, ...(pe ? { edit: pe.after } : {}) } };
    leaving.current.add(id);
    const left = itemsNow.current.filter((i) => i.id !== id).length;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setIndex((i) => Math.max(0, Math.min(i, left - 1))); // the next cover takes its spot, or the one before at the end
    history.current.push(entry);
    swipes.current.push(entry);
    bumpHistory();
    inFlight.current += 1;
    entry.done = (async () => {
      if (pe) await post(`/api/items/${id}/edit`, pe.after);
      await post(`/api/items/${id}/decide`, { decision });
    })();
    entry.done.catch((e) => {
      history.current.remove(entry);
      swipes.current = swipes.current.filter((x) => x !== entry);
      bumpHistory();
      leaving.current.delete(id);
      // It didn't happen, so the card comes back on top, from the side it left by.
      if (!itemsNow.current.some((i) => i.id === id)) bringBack(item, dir);
      say(`Couldn't ${dir > 0 ? "approve" : "pass"} that cover: ${e.message}`);
    }).finally(() => { leaving.current.delete(id); settle(); });
    return true;
  }
  // Puts a cover back on top, right where she is, flying in from one side: the cover she was on goes back underneath.
  function bringBack(item, dir) {
    const spot = Math.min(indexNow.current, itemsNow.current.filter((i) => i.id !== item.id).length);
    setItems((prev) => { const rest = prev.filter((i) => i.id !== item.id); const at = Math.min(spot, rest.length); return [...rest.slice(0, at), item, ...rest.slice(at)]; });
    setIndex(spot);
    setEnterFrom({ id: item.id, dir });
  }
  // Rewind (1.34.0, Tinder's yellow arrow): her last swipe in this list that Undo up top hasn't taken back already.
  const rewindable = () => [...swipes.current].reverse().find((e) => history.current.includes(e)) || null;
  const rewinding = useRef(false);
  async function rewind() {
    if (rewinding.current || draft || enterFrom || stageApi.current?.busy?.()) return;
    const entry = rewindable();
    if (!entry) return;
    rewinding.current = true;
    const at = history.current.remove(entry);
    swipes.current = swipes.current.filter((x) => x !== entry);
    bumpHistory();
    const back = { ...entry.item, status: entry.before.status };
    bringBack(back, entry.swipe);
    inFlight.current += 1;
    try {
      await entry.done?.catch(() => {}); // its own calls land first
      if (entry.before.edit) await post(`/api/items/${entry.itemId}/edit`, entry.before.edit);
      await post(`/api/items/${entry.itemId}/decide`, { decision: entry.before.status });
    } catch (e) {
      history.current.insert(entry, at);
      swipes.current.push(entry);
      bumpHistory();
      setItems((prev) => prev.filter((i) => i.id !== back.id));
      setEnterFrom(null);
      say(`Couldn't rewind that: ${e.message}`);
    } finally {
      rewinding.current = false;
      settle();
    }
  }
  // A rewound cover that never lands on the card (the list moved under it) doesn't hold the deck up.
  useEffect(() => {
    if (!enterFrom) return undefined;
    const t = setTimeout(() => setEnterFrom(null), 4000);
    return () => clearTimeout(t);
  }, [enterFrom]);
  const flyCard = (dir) => { stageApi.current?.fly(dir); };
  const swipe = view === "cover" && current ? {
    onSwipe: commitSwipe, canSend: canSwipe, onIntent: setIntent, enterFrom, onEntered: () => setEnterFrom(null),
  } : null;
  // Skip (1.32.0, room #1248, Quill #1249, the original's skipCover): the whole cover, every photo with it, goes to the very
  // end of the queue, and nothing else about it changes: no verdict, no field, no new row. The next cover comes up; she
  // sees this one again only after every other queued cover. Skipping it again sends it to the end again.
  async function skip() {
    if (!current || busy || current.status !== "queue") return;
    const id = current.id;
    setBusy(true);
    await attempt(async () => {
      const { item } = await post(`/api/items/${id}/skip`, {});
      setItems((prev) => { const was = prev.find((i) => i.id === id); return [...prev.filter((i) => i.id !== id), { ...was, ...item }]; });
      say("Skipped. It's at the end of the queue.");
    });
    setBusy(false);
  }
  // The remix menu (1.17.0; Rose #796 and #797, Quill #798). Since 1.21.0 (Big Edit item 16) Submit remixes the cover she's
  // on, right away, as one step for Undo. One that can't pick changes nothing, and the sheet stays open to say why.
  // A remix a page from before 1.21.0 started is still made in the background: once it's done, the page puts it right
  // after the cover she's on, so it comes next wherever she got to, and she stays where she is.
  const where = useRef({ list, id: null });
  where.current = { list, id: current?.id ?? null };
  useEffect(() => { if (remixOpen && (!current || view !== "cover")) setRemixOpen(false); }, [remixOpen, current, view]);
  const closeRemix = useCallback(() => {
    setRemixOpen(false);
    requestAnimationFrame(() => document.querySelector(".remixBtn")?.focus({ preventScroll: true }));
  }, []);
  // Answers true once the cover has changed, or the reason it didn't, for the sheet to show.
  async function submitRemix(parts) {
    const src = current;
    if (!src) return "This cover isn't here anymore.";
    try {
      const { item, before, after } = await post(`/api/items/${src.id}/remix-now`, parts);
      patchItem(item);
      history.current.push({ label: "Remix", itemId: item.id, before: { remix: before }, after: { remix: after } });
      bumpHistory();
      closeRemix();
      say("Remixed. Undo is up top.");
      return true;
    } catch (e) { return e.message || "That remix didn't work. Try again."; }
  }
  const settling = useRef(false);
  const waitingFor = useRef(new Set()); // the remixes this page is waiting for
  const settleRemixes = useCallback(async () => {
    if (settling.current) return;
    settling.current = true;
    try {
      const { remixes } = await api("/api/remixes");
      let landed = 0, failed = null, elsewhere = 0;
      // One that left the list was placed or shown by another page of hers (her phone and her computer): reload for it too.
      for (const id of [...waitingFor.current]) if (!remixes.some((r) => r.id === id)) { waitingFor.current.delete(id); elsewhere += 1; }
      for (const r of remixes) {
        if (r.status === "pending") { waitingFor.current.add(r.id); continue; }
        waitingFor.current.delete(r.id);
        const here = where.current; // off the queue, it goes to the front of the queue
        // The other page may have placed it a moment before this one asks: it's in the queue either way.
        await post(`/api/remixes/${r.id}/ack`, r.status === "done" ? { after: here.list === "queue" ? here.id : null } : {}).catch(() => {});
        if (r.status === "done") landed += 1; else failed = r.error;
      }
      setRemixing(remixes.filter((r) => r.status === "pending"));
      if (landed || failed || elsewhere) {
        if (where.current.id != null) pendingId.current = where.current.id;
        await load();
        if (landed || failed) say(failed ? `A remix didn't land. ${failed}` : landed === 1 ? "Your remix is next." : `Your ${landed} remixes are next.`);
      }
    } catch { /* the next look tries again */ }
    settling.current = false;
  }, [load, say]);
  useEffect(() => {
    if (!remixing.length) return undefined;
    const t = setInterval(settleRemixes, 1200);
    return () => clearInterval(t);
  }, [remixing.length, settleRemixes]);
  // A remix from before this page opened: one that's done goes next, one still being made is waited for.
  useEffect(() => { if (loads === 1) settleRemixes(); }, [loads]); // eslint-disable-line react-hooks/exhaustive-deps
  // Download (1.21.0, Big Edit items 10 and 18): one tap saves the cover, on a phone too, with no share sheet. The cover is
  // drawn ahead while she looks at it (as the deck shows it, held boxes and all, with the queue's look), so the save
  // starts inside her tap: Safari, and a page shown inside another app, let only a tap save a file.
  const ahead = useRef({ key: null, blob: null });
  const drawnKey = current ? JSON.stringify([withLook(current, look), quoteOn, [...free]]) : null;
  useEffect(() => {
    if (!current || !coverReady || draft || ahead.current.key === drawnKey) return undefined;
    let alive = true;
    const cover = withLook(current, look), on = quoteOn, held = free;
    const t = setTimeout(() => {
      renderCover(cover, { quoteOn: on, free: held }).then((blob) => { if (alive) ahead.current = { key: drawnKey, blob }; }).catch(() => {});
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [drawnKey, coverReady, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const anchorSave = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  // 1.31.0 (room #1235, Quill #1236): on a phone the cover goes to the share sheet, the original's downloadCover way, so
  // Save Image puts it in Photos. iOS and in-app browsers ignore a download link for a drawn file (it lands in Files or
  // nowhere). No web page can write to Photos without that Save tap. A computer, or a phone that can't share files,
  // downloads as before. Closing the share sheet isn't an error.
  const touchDevice = () => typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window)
    && Boolean(window.matchMedia?.("(pointer: coarse)").matches);
  // 1.31.1 (Quill #1279): one file or a carousel's files. Several go to the share sheet together ("Slides ready").
  const saveFiles = async (files) => {
    if (touchDevice() && navigator.share && navigator.canShare) {
      const shared = files.map(({ blob, name }) => new File([blob], name, { type: blob.type || "image/jpeg" }));
      if (navigator.canShare({ files: shared })) {
        try {
          say(files.length > 1 ? "Slides ready. Choose Save." : "Cover ready. Choose Save Image.");
          await navigator.share({ files: shared, title: files[0].name });
        } catch (e) {
          if (e?.name === "AbortError") return; // she closed the sheet
          // A sheet the browser wouldn't open after the cover took a moment to draw: the drawn cover is kept, so the
          // next tap opens the sheet right away.
          if (e?.name === "NotAllowedError") { say(`${files.length > 1 ? "Slides" : "Cover"} ready. Tap download again to save.`); return; }
          for (const f of files) anchorSave(f.blob, f.name);
        }
        return;
      }
    }
    for (const f of files) anchorSave(f.blob, f.name);
  };
  const saveFile = (blob, name) => saveFiles([{ blob, name }]);
  // This slide or All slides (1.31.1, Quill #1279; 1.32.1, Quill #1290: the original's downloadCover scope): with
  // carousel slides, Download asks which. The cover is drawn. A slide is its own file as stored, fetched raw like the
  // original (a video is its mp4), with one fork difference: a carousel photo can carry text of its own here (1.20.0,
  // Big Edit item 3, which the original's slides don't have), and that photo is drawn with its text, the way it posts.
  // "All slides" means all of them, videos too. A slide that can't be fetched stops the download and says which.
  const [downloadAsk, setDownloadAsk] = useState(false);
  const slidesAhead = useRef({ key: "", files: null });
  const downloadCover = () => {
    const name = `${displayTitle(current.title)}-cover.jpg`;
    if (ahead.current.key === drawnKey && ahead.current.blob) { saveFile(ahead.current.blob, name); return; }
    attempt(async () => { // not drawn yet: draw it now, and keep it for a second tap
      const blob = await renderCover(withLook(current, look), { quoteOn, free });
      ahead.current = { key: drawnKey, blob };
      await saveFile(blob, name);
    });
  };
  const slideHasText = (s) => (current.extraTexts || []).some((b) => b.slide === s.at && String(b.quote ?? "").trim());
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov" };
  const slideFile = async (s) => {
    const n = activeSlides.indexOf(s) + 2, base = `${displayTitle(current.title)}-slide-${n}`;
    if (s.mediaType !== "video" && slideHasText(s)) {
      try { return { blob: await renderCover(withLook(current, look), { quoteOn, free, slideAt: s.at }), name: `${base}.jpg` }; }
      catch { throw new Error(`Slide ${n} couldn't be drawn with its text.`); }
    }
    let res;
    try { res = await fetch(s.mediaUrl); } catch { res = null; }
    if (!res?.ok) throw new Error(`Slide ${n} didn't download. Try again.`);
    const blob = await res.blob();
    return { blob, name: `${base}.${EXT[blob.type] || (s.mediaType === "video" ? "mp4" : "jpg")}` };
  };
  const downloadThis = () => {
    setDownloadAsk(false);
    const s = slide > 0 ? activeSlides[slide - 1] : null;
    if (!s) { downloadCover(); return; }
    attempt(async () => saveFiles([await slideFile(s)]));
  };
  const downloadAll = () => {
    setDownloadAsk(false);
    const key = `${drawnKey}|${activeSlides.map((s) => s.mediaUrl).join(",")}`;
    if (slidesAhead.current.key === key && slidesAhead.current.files) { saveFiles(slidesAhead.current.files); return; }
    attempt(async () => {
      const files = [{ blob: await renderCover(withLook(current, look), { quoteOn, free }), name: `${displayTitle(current.title)}-cover.jpg` }];
      for (const s of activeSlides) files.push(await slideFile(s)); // in order; one that fails stops it and says which
      slidesAhead.current = { key, files }; // kept, so a second tap opens the sheet at once
      await saveFiles(files);
    });
  };
  const download = () => { if (activeSlides.length) setDownloadAsk(true); else downloadCover(); };
  useEffect(() => { setDownloadAsk(false); }, [current?.id]);
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
  // After a randomize the button has focus again (1.29.0, Quill #1216), so Enter or Space runs it once more on a computer.
  // Never pulled out of a field she moved into while it ran.
  const randomizeBtn = useRef(null);
  const refocusRandomize = () => requestAnimationFrame(() => {
    const el = document.activeElement;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (!typing && randomizeBtn.current && el !== randomizeBtn.current) randomizeBtn.current.focus({ preventScroll: true });
  });
  const randomize = () => attempt(async () => {
    // The original's six layouts, kept inside the safe zone (1.8). Layout only: never the color, the font or the weight.
    // With Color lock off (1.14.1, Arjang #790 item 4) it also picks a new color from the palette.
    const img = await loadImage(imageUrlFor(current));
    const drawn = withLook(current, look);
    const box = effectiveStyle(drawn);
    const measure = canvasMeasureAt(box) || ((px) => (t) => t.length * px * 0.5);
    const patch = randomizeLayout({ ...box, quote: current.quote || "" }, img.naturalWidth / img.naturalHeight, measure);
    // Her colors first, then the 11 (1.20.0). The color is this cover's own (1.26.0).
    const colors = [...palette.brandColors, ...palette.palette.filter((c) => !palette.brandColors.some((b) => b.hex.toUpperCase() === c.hex.toUpperCase()))];
    const others = colorLock ? [] : colors.filter((c) => c.hex.toUpperCase() !== String(box.textColor || "").toUpperCase());
    if (others.length) patch.textColor = others[Math.floor(Math.random() * others.length)].hex;
    const before = { style: pickStyle(drawn, Object.keys(patch)) }, after = { style: patch };
    await record("Randomize", current.id, before, after);
  }).finally(refocusRandomize);
  // Takes one of her custom colors off her list (1.9.1). Covers that use it keep it.
  const removeCustomColor = (hex) => attempt(async () => {
    applyPalette(await post("/api/palette/custom-colors/remove", { hex }));
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
  // Hold and drag (1.20.0, Big Edit item 9): the lifted box follows her thumb, and letting go saves the spot as one step.
  const moveText = (index, h, v, _at, w = null) => { if (!current) return; movingNow.current = { id: current.id, index, h, v, w }; setMoving(movingNow.current); };
  const dropText = () => {
    const m = movingNow.current;
    movingNow.current = null;
    const item = current;
    if (!m || !item || m.id !== item.id) { setMoving(null); return; }
    const was = effectiveStyle(item);
    const change = m.index === -1
      ? [{ style: { horizontalPosition: was.horizontalPosition, verticalPosition: was.verticalPosition, ...(m.w != null ? { textWidth: was.textWidth } : {}) } }, { style: placed(m) }]
      : [{ style: { extraTexts: item.extraTexts || [] } }, { style: { extraTexts: placeBox(item, m).extraTexts } }];
    attempt(() => record("Move text", item.id, ...change)).finally(() => setMoving(null));
  };
  const pan = (key, value) => patchItem({ ...current, [key]: value });
  const panDone = () => attempt(async () => {
    patchItem((await post(`/api/items/${current.id}/story-framing`, { storyPanX: current.storyPanX, storyPanY: current.storyPanY })).item);
  });

  // ---------- The editor: every change saves as she goes (1.8), each save one undo step ----------
  // What the editor works on: the cover with its full style and its photo edits filled in.
  // A queued cover opens with the queue's look on it (1.20.0), and the lock as she set it, so a change knows what it changes.
  const editorCopy = (raw) => {
    const item = withLook(raw, lookOf(paletteNow.current));
    return JSON.parse(JSON.stringify({ ...item, ...effectiveStyle(item), imageEdit: { contrast: "normal", mosaics: [], ...(item.imageEdit || {}) },
      lockRaw: { ...paletteNow.current.lock } }));
  };
  // An undo or redo inside the editor (1.13.5): the editor shows the cover as it now is, with nothing waiting to save.
  function refreshDraft(item) {
    const fresh = editorCopy(item);
    draftSaved.current = JSON.parse(JSON.stringify(fresh));
    draftNow.current = fresh;
    setDraft(fresh);
    setActiveBox((b) => (b >= (fresh.extraTexts || []).length ? -1 : b));
  }
  // The editor opens on the photo she's looking at (1.20.0, Big Edit item 3): the cover, or the carousel photo she swiped
  // to, with that photo's own text. A tap on a carousel photo's text names the photo (at); the pencil uses the one on screen.
  function startEdit(box = -1, at) {
    if (!current) return;
    let photo = null;
    if (at !== undefined && at !== null) photo = at;
    else if (at === undefined && !story && slide > 0) {
      const s = activeSlides[slide - 1];
      if (s?.mediaType === "video") { say("Text goes on photos. This one is a video."); return; }
      photo = s ? s.at : null;
    }
    setStory(false);
    const opened = editorCopy(current);
    draftSaved.current = JSON.parse(JSON.stringify(opened));
    draftNow.current = opened;
    setSaveState("idle");
    setDraft(opened);
    setEditSlide(photo);
    setActiveBox(photo === null ? box : box >= 0 ? box : (opened.extraTexts || []).findIndex((b) => b.slide === photo));
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
    setEditSlide(null);
    setPickMode(false);
    // Back to the cover she just changed, wherever the editor left the page.
    requestAnimationFrame(() => document.querySelector(".stage")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  const setDraftItem = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setBox = (patch) => setDraft((d) => {
    // 1.26.0 (Arjang #1092): a font or color changes this text on this cover only. There's no queue lock any more.
    return activeBox === -1 ? { ...d, ...patch } : { ...d, extraTexts: d.extraTexts.map((b, i) => (i === activeBox ? { ...b, ...patch } : b)) };
  });
  const setImageEdit = (patch) => setDraft((d) => ({ ...d, imageEdit: { ...(d.imageEdit || {}), ...patch } }));
  const moveBox = (box, h, v, w = null) => setDraft((d) => (box === -1 ? { ...d, ...placed({ h, v, w }) }
    : { ...d, extraTexts: d.extraTexts.map((b, i) => (i === box ? { ...b, ...placed({ h, v, w }) } : b)) }));
  // The text boxes on the photo the editor is on: up to 5 on each photo (1.20.0).
  const boxesHere = (d) => (d?.extraTexts || []).filter((b) => (editSlide === null ? b.slide == null : b.slide === editSlide)).length;
  function newBox() {
    if (!draft || boxesHere(draft) >= MAX_BOXES) return;
    const main = effectiveStyle(draft);
    const at = draft.extraTexts.length;
    // A new text box starts in TikTok Sans Medium (1.28.0, room #1194 and #1199: Medium 500, the original's default), with
    // the rest of the cover's look.
    const font = (draft.status === "queue" && lookOf(paletteNow.current).textFont) || "tiktok"; // the queue's font, if she picked one (1.20.0)
    const box = { ...pickStyle(draft, STYLE_KEYS), textFont: font, fontWeight: 500, quote: "Your text", verticalPosition: main.verticalPosition > 55 ? 22 : 78, lineCount: 0,
      ...(editSlide === null ? {} : { slide: editSlide, verticalPosition: 50, horizontalPosition: 50 }) }; // on a carousel photo, its middle
    setDraft((d) => ({ ...d, extraTexts: [...d.extraTexts, box] }));
    setActiveBox(at);
  }
  function removeBox() {
    const left = draft.extraTexts.filter((_, i) => i !== activeBox);
    setDraft((d) => ({ ...d, extraTexts: d.extraTexts.filter((_, i) => i !== activeBox) }));
    // On a carousel photo the next box there is picked, or none; on the cover, the quote.
    setActiveBox(editSlide === null ? -1 : left.findIndex((b) => b.slide === editSlide));
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
    const lock = now.status === "queue" ? changedFields(base.lockRaw || {}, now.lockRaw || {}, LOOK_KEYS) : null; // 1.20.0
    if (!style && !edit && !imageEdit && !flip && !lock) return null;
    const before = {}, after = {};
    if (style) { before.style = style.before; after.style = style.after; }
    if (edit) { before.edit = edit.before; after.edit = edit.after; }
    if (imageEdit) { before.imageEdit = imageEdit.before; after.imageEdit = imageEdit.after; }
    if (flip) { before.showQuote = Boolean(base.showQuote); after.showQuote = Boolean(now.showQuote); }
    if (lock) { before.lock = lock.before; after.lock = lock.after; }
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
        if (ch.style?.after.textColor || ch.style?.after.extraTexts) api("/api/palette").then(applyPalette).catch(() => {});
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
    // A color from the photo is a color like any other: after a 50% preset the text is 100% again (1.20.0).
    if (hex) setBox(colorPatch(withDefaults(activeBox === -1 ? draft : draft?.extraTexts?.[activeBox] || {}), hex));
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
  // A cover found by search (1.33.0) opens in its own list: the deck switches lists when it has to, then lands on it.
  const [searchOpen, setSearchOpen] = useState(false);
  const pendingOpen = useRef(null);
  useEffect(() => {
    if (pendingOpen.current == null) return;
    const at = items.findIndex((i) => i.id === pendingOpen.current);
    if (at >= 0) { setIndex(at); pendingOpen.current = null; }
  }, [items]);
  function openFound(item) {
    setSearchOpen(false);
    if (item.status === list) { openFromLibrary(item); return; }
    pendingOpen.current = item.id;
    switchList(item.status);
    setView("cover");
  }
  function switchList(next) {
    if (next === list) return;
    swipes.current = []; // Rewind brings back swipes from the list she's in; Undo up top still has them
    setEnterFrom(null);
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
      if (draft || zoom || infoOpen || sheet || remixOpen || view !== "cover") return;
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
    <div className={draft ? "app editing" : "app"}>
      {view === "songs" ? (
        <SongsView forCover={songsFrom === "cover" ? current : null} closeLabel={songsFrom === "cover" ? "Back to the cover" : "Back to all covers"}
          onClose={closeSongs} onUse={putSongOnCover} />
      ) : view === "library" ? (
        <LibraryView list={list} setList={switchList} items={items} counts={counts} pollenOn={Boolean(pollen?.connected)} canClose
          look={look} quoteOverlay={quotesStatus?.quoteOverlay ?? null} quotesUnlocked={Boolean(quotesStatus?.unlocked)}
          onOpen={openFromLibrary} onUpload={uploadPhotos} onClose={() => setView("cover")} onSongs={symphony?.connected ? () => showSongs("library") : null}
          onSchedule={(ids, stop) => setSheet({ items: items.filter((i) => ids.includes(i.id)), stop })} loadError={loadErrorBar} listFailed={Boolean(loadError?.items)} />
      ) : (
        <>
        <main className="review" inert={zoom || remixOpen ? true : undefined}>
          <CoverHeader list={list} count={counts?.[list] ?? items.length} position={index + 1} total={items.length}
            canUndo={history.current.canUndo()} canRedo={history.current.canRedo()} locked={Boolean(draft)} away={playerUp}
            onBack={showLibrary} onInfo={() => setInfoOpen(true)} onSearch={() => setSearchOpen(true)} onUndo={() => step("undo")} onRedo={() => step("redo")} />
          {!current ? (
            loadError?.items ? (
            <div className="emptyCover">{loadErrorBar}</div>
            ) : (
            <div className="emptyCover">
              <p className="emptyTitle">{list === "queue" ? "Your queue is clear." : list === "approved" ? "No approved covers yet." : "Nothing passed yet."}</p>
              <p className="hint">Add photos, or ask your Muse to bring in your Drive photos. No connectors needed.</p>
              <label className="primaryBtn asLabel">
                <Icon name="photoAdd" size={20} /> Add photos
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; if (files.length) uploadPhotos(files); }} />
              </label>
              <button type="button" className="secondaryBtn" onClick={() => setView("library")}>See all covers</button>
            </div>
            )
          ) : (
            <>
              {loadErrorBar}
              {/* While the editor sheet is open, the review screen stays behind it, seen but not reachable. */}
              <div className="behind" inert={draft ? true : undefined}>
                <ModeSwitch story={story} setStory={setStory} away={playerUp} />
                <SongRow item={current} onShuffle={() => regenerate("song")} onSetSong={setSong} onDraft={(v) => setPending(current.id, "song", v)}
                  onSongs={symphony?.connected ? () => showSongs("cover") : null} onPlayer={setPlayerUp} />
              </div>
              <CoverStage item={shown} quoteOn={quoteOn} slides={activeSlides} slide={slide} setSlide={setSlide} story={story && !draft}
                editing={Boolean(draft)} editSlide={editSlide} activeBox={activeBox} onStartEdit={(box, at) => startEdit(box, at)} onSelectBox={setActiveBox} onMoveBox={moveBox}
                pickMode={pickMode} onPick={onPick} onMosaicsChange={(mosaics) => setImageEdit({ mosaics })} onDrawn={setDrawnId}
                onZoom={setZoom} zoomRef={zoomRef} onTapOff={() => sheetDismiss.current?.()} free={free} onFree={freeBox} onMoveText={moveText} onDropText={dropText}
                under={under} underQuoteOn={underQuoteOn} swipe={swipe} swipeRef={stageApi} />
              <div className="behind" inert={draft ? true : undefined}>
                <SwipeRow item={current} intent={intent} busy={busy || !coverReady} canRewind={Boolean(rewindable())} onRewind={rewind}
                  onNope={() => flyCard(-1)} onLike={() => flyCard(1)} onSkip={list === "queue" ? skip : null} />
                <ActionRow item={current} busy={busy || !coverReady} onRemix={() => setRemixOpen(true)} onDownload={download}
                  quote={{ on: quoteOn, locked: !quotesStatus?.unlocked, onTap: tapQuote, onHold: holdQuotes }}
                  onComment={() => { noteRef.current?.focus(); noteRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }} onEdit={() => startEdit(-1)}
                  onZoom={zoomable ? () => zoomRef.current?.() : null} />
                {downloadAsk && ( /* 1.31.1: This slide or All slides, like the original */
                  <div className="downloadAsk" role="group" aria-label="Download">
                    <button type="button" className="secondaryBtn" onClick={downloadThis}>This slide</button>
                    <button type="button" className="secondaryBtn" onClick={downloadAll}>All slides</button>
                    <button type="button" className="linkBtn" onClick={() => setDownloadAsk(false)}>Cancel</button>
                  </div>
                )}
                {remixing.length > 0 && (
                  <p className="remixMarker" role="status"><span className="loadingDot" aria-hidden="true" />
                    {remixing.length === 1 ? "Your remix is on its way. It comes next." : `${remixing.length} remixes are on their way. They come next.`}</p>
                )}
                {current.lastRemix?.status === "failed" && <p className="problem remixNote">This cover's last remix didn't land. {current.lastRemix.error}</p>}
                {/* Item 28 (1.21.0): an approved cover's one big Schedule button, or where it stands once it's with Pollen. */}
                {current.status === "approved" && pollen?.connected && (selectable(current)
                  ? <button type="button" className="scheduleBig" onClick={() => setSheet({ items: [current], stop: () => {} })}>Schedule</button>
                  : <p className="pollenState" role="status">{badgeFor(current.pollen)?.text}</p>)}
                {story && <StoryControls item={current} onPan={pan} onPanDone={panDone} />}
                <Steppers slide={slide} total={activeSlides.length + 1} onSlide={setSlide} onAddSlide={addSlide} onRemoveSlide={removeSlide}
                  canPrevPost={index > 0} canNextPost={index < items.length - 1} onPrevPost={() => goTo(index - 1)} onNextPost={() => goTo(index + 1)} />
                <div className="randomizeBar">
                  <button type="button" ref={randomizeBtn} className="randomizeMain" onClick={randomize}><Icon name="sparkle" size={20} /> Randomize layout</button>
                  <button type="button" className="colorLock" aria-pressed={colorLock} onClick={() => setColorLock((on) => !on)}>
                    <Icon name={colorLock ? "lock" : "unlock"} size={16} /> Color lock
                  </button>
                </div>
                {/* Under Randomize layout (1.21.0, Big Edit item 15): the caption, then the overlay text, then the note. */}
                <CaptionRow item={current} ctas={ctas} onCta={setCta} onSave={saveCaption} onRedo={() => regenerate("caption")} onDraft={(v) => setPending(current.id, "caption", v)} />
                <TitleRow item={current} />
                {list === "approved" && current.pollen?.error && ["failed", "not_sent"].includes(current.pollen.status) && <p className="problem">{current.pollen.error}</p>}
                <NoteComposer item={current} onPost={postNote} onDraft={(v) => setPending(current.id, "note", v)} inputRef={noteRef} />
                <ComposeCheck item={current} lines={linesFor(current)} onRecheck={recheck} busy={busy} />
                <RateQuality item={current} onRate={rate} onSwap={swapPhoto} onRestore={restorePhoto} searchPhotos={searchPhotos} />
              </div>
              {draft && (
                <EditorSheet onDismiss={finishEdit} status={saveState} dismissRef={sheetDismiss}
                  history={{ canUndo: history.current.canUndo(), canRedo: history.current.canRedo(), onUndo: () => step("undo"), onRedo: () => step("redo") }}>
                  <CoverEditor draft={draft} activeBox={activeBox} setActiveBox={setActiveBox} setBox={setBox} setItem={setDraftItem} setImageEdit={setImageEdit}
                    palette={palette.palette} brandColors={palette.brandColors} locked={draft.status === "queue"} fonts={palette.fonts} customColors={palette.customColors} quotesUnlocked={Boolean(quotesStatus?.unlocked)}
                    pickMode={pickMode} setPickMode={setPickMode} onRemoveBox={removeBox} photo={editSlide}
                    onNewBox={newBox} onAddMosaic={addMosaic} canAddBox={boxesHere(draft) < MAX_BOXES} onRemoveCustomColor={removeCustomColor} />
                </EditorSheet>
              )}
            </>
          )}
          <BrandFoot />
        </main>
        {zoom && current && (
          <ZoomView item={shown} quoteOn={quoteOn} slideUrl={zoom.slideUrl} slideAt={zoom.slideAt ?? null} source={zoom.source} free={free}
            onClose={() => { setZoom(null); requestAnimationFrame(() => document.querySelector(".zoomBtn")?.focus({ preventScroll: true })); }} />
        )}
        </>
      )}

      {searchOpen && <SearchSheet onPick={openFound} onClose={() => setSearchOpen(false)} />}
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

      {remixOpen && current && view === "cover" && (
        <RemixSheet quotesLocked={!quotesStatus?.unlocked} onSubmit={submitRemix} onClose={closeRemix} />
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast.text}</div>}
    </div>
  );
}
