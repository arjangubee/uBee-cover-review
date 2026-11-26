import { useEffect, useRef, useState } from "react";
import Icon from "./icons.jsx";
import { LOCKED, NAMES, badgeFor, badgeOf } from "./pollenView.js";
import { DateTimeWheels, atTimeOfDay, timeOfDay, whenLabel } from "./Wheels.jsx";

const ASLEEP_MS = 90 * 1000; // no answer after this long: uBee's computer is probably asleep
const POLL_MS = 5000;
const WAITING = ["waiting", "leased"];
const MIN_LEAD_MS = 5 * 60 * 1000; // the server's floor too
const NO_TIME = "Pollen can't post at a time you pick yet. It needs an update from uBee first.";
const NO_REELS = "Pollen can't make reels from a cover yet. It needs an update from uBee first.";

/** Where one format of a cover stands with Pollen, with the day and time she picked. */
export function formatStatus(r) {
  const b = badgeFor(r);
  if (!b) return null;
  const at = r.scheduledAt ? whenLabel(r.scheduledAt) : "";
  if (r.status === "booked") return { ...b, text: at ? `Booked for ${at}` : b.text };
  if (WAITING.includes(r.status)) return { ...b, text: at ? `${b.text}, for ${at}` : b.text };
  if (b.tone === "bad" && r.error) return { ...b, text: `${b.text}: ${r.error}` };
  return b;
}

// Schedule Post (1.38.0, Arjang Nov 26). Her channels across the top as badges: in color when they're on, black and
// white when she switches one off, and her choice saves as she taps. Then two cards, Post and Reel, each with its own day
// and time wheels; the Reel's Trial is on by default where her Instagram can run trial reels. The big Schedule Post at the
// bottom is her final approval: the cover is drawn as it shows, its carousel photos too, and Pollen books each format
// at its time. `cover` is what she saw when she opened it: the item, its slides, and how to draw them.
export default function SchedulePostSheet({ cover, api, post, onConnect, onClose, onDone }) {
  const { item, slides, drawCover, drawSlide } = cover;
  const hasSongClip = Boolean(item.songFile);
  const postLocked = Boolean(item.pollen && LOCKED.includes(item.pollen.status));
  const reelLocked = Boolean(item.pollenReel && LOCKED.includes(item.pollenReel.status));
  const [state, setState] = useState(null); // the channels answer: connected, channels, features, prefs
  const [problem, setProblem] = useState(null);
  const [picks, setPicks] = useState({ on: [], off: [] }); // channels she turned on or off herself
  const [postOn, setPostOn] = useState(false);
  const [reelOn, setReelOn] = useState(false);
  const [postAt, setPostAt] = useState(() => atTimeOfDay("18:00"));
  const [reelAt, setReelAt] = useState(() => atTimeOfDay("19:00"));
  const [trial, setTrial] = useState(true);
  const [phase, setPhase] = useState("loading"); // loading, ready, sending, sent
  const [results, setResults] = useState(null);
  const [sentAt, setSentAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const closeBtn = useRef(null);
  const saveTimer = useRef(null);
  const saving = useRef({});
  const busy = phase === "sending";
  const close = phase === "sent" ? onDone : onClose;

  const load = async () => {
    try {
      const ch = await api("/api/pollen/channels?refresh=1");
      setState(ch);
      if (ch.connected) {
        const p = ch.prefs || {};
        setPicks({ on: p.on || [], off: p.off || [] });
        setPostOn(!postLocked && (p.post ?? true));
        setReelOn(!reelLocked && (p.reel ?? true) && Boolean(ch.features?.reels) && hasSongClip);
        if (p.postTime) setPostAt(atTimeOfDay(p.postTime));
        if (p.reelTime) setReelAt(atTimeOfDay(p.reelTime));
        setTrial(p.trial ?? true);
      }
      setProblem(ch.stale && ch.message ? ch.message : null);
    } catch (e) {
      setProblem(e.message);
      setState({ connected: false });
    }
    setPhase("ready");
  };
  useEffect(() => { load(); closeBtn.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) { e.preventDefault(); close(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, close]);
  // Her choices save as she makes them: channels at once, the rest a moment after the last change.
  const remember = (patch, wait = 400) => {
    saving.current = { ...saving.current, ...patch };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const body = saving.current;
      saving.current = {};
      post("/api/pollen/prefs", body).catch(() => {});
    }, wait);
  };
  useEffect(() => () => { // closing saves anything still waiting
    clearTimeout(saveTimer.current);
    if (Object.keys(saving.current).length) post("/api/pollen/prefs", saving.current).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const channels = state?.channels || [];
  const features = state?.features || {};
  const isOn = (c) => c.ready && (picks.on.includes(c.id) || (c.default_on && !picks.off.includes(c.id)));
  const toggle = (c) => {
    const turnOn = !isOn(c);
    const next = { on: picks.on.filter((x) => x !== c.id), off: picks.off.filter((x) => x !== c.id) };
    if (turnOn && !c.default_on) next.on.push(c.id);
    if (!turnOn && c.default_on) next.off.push(c.id);
    setPicks(next);
    remember(next, 0);
  };
  const postChannels = channels.filter((c) => c.photo && isOn(c));
  const reelChannels = channels.filter((c) => c.video && isOn(c));
  const trialHere = reelChannels.some((c) => c.platform === "instagram");
  const trialCan = reelChannels.some((c) => c.platform === "instagram" && c.trial);
  const photos = slides.filter((s) => s.mediaType !== "video");
  const videos = slides.length - photos.length;
  const tooSoon = (d) => d.getTime() < now + MIN_LEAD_MS;
  const names = (list) => list.map((c) => NAMES[c.platform] || c.platform).join(", ");

  const postWhy = postLocked ? null : !postChannels.length ? "Turn on a channel that takes photo posts."
    : tooSoon(postAt) ? "Pick a time at least 5 minutes from now." : null;
  const reelWhy = reelLocked ? null : !features.reels ? NO_REELS
    : !hasSongClip ? "A reel needs a song with its hook clip. Pick one with the note by the song."
      : !reelChannels.length ? "Turn on a channel that takes reels." : tooSoon(reelAt) ? "Pick a time at least 5 minutes from now." : null;
  const canSend = phase === "ready" && state?.connected && features.scheduleAt && (postOn || reelOn) && !(postOn && postWhy) && !(reelOn && reelWhy);

  async function send() {
    if (!canSend) return;
    setPhase("sending");
    setProblem(null);
    try {
      await drawCover(); // drawn the way it shows, then kept for Pollen
      if (photos.length && (reelOn || features.slides)) for (const s of photos) await drawSlide(s);
      const out = await post("/api/pollen/schedule-post", {
        itemId: item.id, channelIds: channels.filter(isOn).map((c) => c.id),
        post: postOn ? { at: postAt.toISOString() } : null,
        reel: reelOn ? { at: reelAt.toISOString(), trial: trialCan && trial } : null,
      });
      const at = { post: postAt, reel: reelAt };
      setResults(Object.fromEntries(Object.entries(out.results).map(([f, r]) => [f, { ...r, scheduledAt: at[f].toISOString() }])));
      setSentAt(Date.now());
      setPhase("sent");
    } catch (e) {
      setProblem(e.message);
      setPhase("ready");
    }
  }

  // While Pollen hasn't answered, check every few seconds and show each format as it lands.
  const waiting = results && Object.values(results).some((r) => WAITING.includes(r.status));
  useEffect(() => {
    if (phase !== "sent" || !waiting) return undefined;
    const t = setInterval(async () => {
      setNow(Date.now());
      try {
        await post("/api/pollen/sync");
        const { items: fresh } = await api("/api/items?status=approved");
        const f = fresh.find((x) => x.id === item.id);
        if (f) setResults((rs) => ({ ...(rs.post && f.pollen ? { post: f.pollen } : rs.post ? { post: rs.post } : {}),
          ...(rs.reel && f.pollenReel ? { reel: f.pollenReel } : rs.reel ? { reel: rs.reel } : {}) }));
      } catch { /* keep checking */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // the 5 minute floor moves with the clock while the sheet is open
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const asleep = phase === "sent" && waiting && sentAt && now - sentAt >= ASLEEP_MS;

  const line = (r) => {
    const s = r && formatStatus(r);
    return s ? <p className={`state ${s.tone} postResult`} title={s.why}>{s.text}</p> : null;
  };
  // One format's card: its tick button on top (the time she picked beside it), then its wheels and notes while it's on.
  // A format already with Pollen shows where it stands instead. `blocked`: it can't be turned on here, and `why` says so.
  const card = ({ key, name, on, setOn, locked, blocked = false, at, setAt, timeKey, why, stored, notes, extra = null }) => (
    <div className={on ? "remixOption postOption on" : "remixOption postOption"}>
      <button type="button" className="remixToggle" aria-pressed={on} disabled={phase !== "ready" || locked || blocked}
        onClick={() => { setOn(!on); remember({ [key]: !on }); }}>
        <span className="tick">{on && <Icon name="checkCircle" size={24} />}</span>{name}
        {on && <span className="postWhen">{whenLabel(at)}</span>}
      </button>
      {locked && line(stored)}
      {!locked && on && phase !== "sent" && (
        <>
          <DateTimeWheels label={name} value={at} onChange={(d) => { setAt(d); remember({ [timeKey]: timeOfDay(d) }); }} />
          {extra}
          {notes.filter(Boolean).map((t) => <p key={t} className="hint postNote">{t}</p>)}
          {why && <p className="problem postNote">{why}</p>}
        </>
      )}
      {!locked && blocked && why && <p className="hint postNote">{why}</p>}
      {results?.[key] && line(results[key])}
    </div>
  );

  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="sheet postSheet" role="dialog" aria-modal="true" aria-labelledby="postSheetTitle">
        <div className="sheetHead">
          <h2 id="postSheetTitle">Schedule Post</h2>
          <button ref={closeBtn} className="ghost mini" onClick={close} disabled={busy}>Close</button>
        </div>

        {phase === "loading" && <p className="hint">Getting your channels</p>}
        {phase !== "loading" && !state?.connected && (
          <form className="postConnect" onSubmit={async (e) => {
            e.preventDefault();
            setProblem(null);
            try { await onConnect(code.trim()); setCode(""); setPhase("loading"); await load(); } catch (err) { setProblem(err.message); }
          }}>
            <p className="hint">{state?.revoked ? "That Pollen code doesn't work anymore. Ask uBee for a new one." : "Connect Pollen with the code from uBee, and Schedule Post sends your covers to it."}</p>
            <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pollen code" aria-label="Pollen code" autoComplete="off" />
            <button type="submit" className="primaryBtn" disabled={code.trim().length < 32}>Connect</button>
          </form>
        )}

        {state?.connected && (
          <>
            <p className="sheetLabel" id="postSheetTo">Post to</p>
            <div className="channelChips" role="group" aria-labelledby="postSheetTo">
              {channels.map((c) => {
                const [letters, color, ink = "#fff"] = badgeOf(c.platform);
                const only = c.photo && !c.video ? ", photo posts only" : !c.photo && c.video ? ", reels only" : "";
                return (
                  <button type="button" key={c.id} className="channelChip" data-channel={c.id} aria-pressed={isOn(c)} disabled={!c.ready || phase !== "ready"}
                    onClick={() => toggle(c)} aria-label={`${NAMES[c.platform] || c.platform}${c.handle ? `, ${c.handle}` : ""}${c.ready ? only : ", needs reconnecting"}`}>
                    <span className="channelBadge" aria-hidden="true" style={{ "--brand": color, "--ink": ink }}>{letters}</span>
                    <span className="channelName">{NAMES[c.platform] || c.platform}</span>
                    <span className="channelHandle">{c.ready ? c.handle || "" : "Needs reconnecting"}</span>
                  </button>
                );
              })}
            </div>
            {!channels.length && <p className="hint">No channels in Pollen yet. Ask uBee to connect yours.</p>}
            {!features.scheduleAt && <p className="problem postNote">{NO_TIME}</p>}

            <div className="postOptions">
              {card({ key: "post", name: "Post", on: postOn, setOn: setPostOn, locked: postLocked, at: postAt, setAt: setPostAt, timeKey: "postTime",
                why: postWhy, stored: item.pollen, notes: [
                  postChannels.length ? `Goes to ${names(postChannels)}.` : null,
                  photos.length ? (features.slides ? `With its ${photos.length} carousel ${photos.length === 1 ? "photo" : "photos"}.` : "Goes as the cover alone for now. Its carousel photos come once Pollen takes them.") : null,
                  item.song ? "A photo post can't carry a song through any posting app, so the song goes on the reel." : null,
                ] })}
              {card({ key: "reel", name: "Reel", on: reelOn, setOn: setReelOn, locked: reelLocked, blocked: !features.reels || !hasSongClip,
                at: reelAt, setAt: setReelAt, timeKey: "reelTime", why: reelWhy, stored: item.pollenReel, notes: [
                  reelChannels.length ? `Goes to ${names(reelChannels)}.` : null,
                  `Pollen makes it from the cover${photos.length ? ` and its ${photos.length === 1 ? "photo" : "photos"}` : ""} over the song's hook.`,
                  videos ? "Videos in the carousel stay out for now." : null,
                ],
                extra: trialHere && (
                  <>
                    <label className="scheduleSwitch trialSwitch">
                      <input type="checkbox" role="switch" checked={trialCan && trial} disabled={!trialCan || phase !== "ready"}
                        onChange={(e) => { setTrial(e.target.checked); remember({ trial: e.target.checked }); }} />
                      <span className="switchTrack" aria-hidden="true"><span className="switchKnob" /></span>
                      <span>Trial</span>
                    </label>
                    <p className="hint postNote">{trialCan ? "Instagram shows a trial reel to people who don't follow you first, then shares it with your followers if it does well." : "Trial reels aren't on for your Instagram yet."}</p>
                  </>
                ) })}
            </div>
          </>
        )}

        {asleep && <p className="asleep">uBee's computer seems to be asleep. Your post is saved and books as soon as it wakes up. You can close this.</p>}
        {problem && <p className="problem postNote" role="alert">{problem}</p>}
        {state?.connected && <div className="sheetActions">
          {phase === "sent"
            ? <button onClick={onDone}>Done</button>
            : <button className="pollenPost" onClick={send} disabled={!canSend}>{busy ? "Scheduling" : "Schedule Post"}</button>}
        </div>}
      </div>
    </div>
  );
}

/** The big button that took the Overlay Text row's place (1.38.0), with where each format stands under it. */
export function SchedulePostButton({ item, onOpen }) {
  const lines = [["Post", item.pollen], ["Reel", item.pollenReel]].map(([name, r]) => [name, r && formatStatus(r)]).filter(([, s]) => s);
  return (
    <div className="schedulePostRow">
      <button type="button" className="scheduleBig" onClick={onOpen} aria-haspopup="dialog">Schedule Post</button>
      {lines.map(([name, s]) => <p key={name} className={`state ${s.tone} postStatus`} title={s.why}>{name}: {s.text}</p>)}
    </div>
  );
}
