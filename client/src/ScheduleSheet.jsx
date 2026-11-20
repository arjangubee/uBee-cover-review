import { useEffect, useRef, useState } from "react";
import { postedCaption } from "./captionCall.js";
import { badgeFor } from "./pollenView.js";
import { renderCover } from "./renderCover.js";

const ASLEEP_MS = 90 * 1000; // no answer after this long: uBee's computer is probably asleep
const POLL_MS = 5000;
const NAMES = { instagram: "Instagram", facebook: "Facebook", threads: "Threads", x: "X", tiktok: "TikTok", pinterest: "Pinterest",
  telegram: "Telegram", discord: "Discord", tumblr: "Tumblr", substack: "Substack" };
const WAITING = ["waiting", "leased"];

// The Schedule sheet: her channels with photo channels on, every picked cover drawn exactly as it will
// post, caption problems before anything is sent, then each cover's booked day as Pollen answers.
export default function ScheduleSheet({ items, ctas = [], quotesUnlocked, api, post, onClose, onDone }) {
  const [channels, setChannels] = useState(null);
  const [on, setOn] = useState({});
  const [rows, setRows] = useState(() => items.map((item) => ({ item, thumb: null, problems: [], hasSlides: false, rendered: false, renderError: null, result: null })));
  const [message, setMessage] = useState(null);
  const [phase, setPhase] = useState("preparing"); // preparing, ready, sending, sent
  const [sentAt, setSentAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const urls = useRef([]);
  const patchRow = (id, patch) => setRows((rs) => rs.map((r) => (r.item.id === id ? { ...r, ...patch } : r)));

  useEffect(() => {
    let alive = true;
    api("/api/pollen/channels?refresh=1").then((ch) => {
      if (!alive) return;
      if (!ch.connected) { setMessage(ch.message || "Pollen isn't connected yet."); setChannels([]); return; }
      setChannels(ch.channels);
      setOn(Object.fromEntries(ch.channels.map((c) => [c.id, Boolean(c.default_on && c.ready)])));
      if (ch.stale && ch.message) setMessage(ch.message);
    }).catch((e) => { if (alive) { setMessage(e.message); setChannels([]); } });

    (async () => {
      const check = await post("/api/pollen/check", { itemIds: items.map((i) => i.id) }).catch(() => ({ items: [] }));
      if (!alive) return;
      for (const c of check.items) patchRow(c.itemId, { problems: c.problems, hasSlides: c.hasSlides, caption: c.caption, songStays: c.hasSongClip && !c.songGoes });
      for (const item of items) {
        if (!alive) return; // the sheet was closed: stop drawing
        try {
          const blob = await renderCover(item, { quoteOn: Boolean(item.showQuote && quotesUnlocked) });
          const form = new FormData();
          form.append("image", blob, "cover.jpg");
          await api(`/api/items/${item.id}/render`, { method: "POST", body: form });
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          if (alive) patchRow(item.id, { thumb: url, rendered: true });
        } catch (e) {
          if (alive) patchRow(item.id, { renderError: e.message || "Couldn't draw this cover." });
        }
      }
      if (alive) setPhase((p) => (p === "preparing" ? "ready" : p));
    })();
    return () => { alive = false; urls.current.forEach((u) => URL.revokeObjectURL(u)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendable = rows.filter((r) => r.rendered && !r.problems.length && !r.result);
  const pickedChannels = (channels || []).filter((c) => on[c.id]).map((c) => c.id);
  const waiting = rows.some((r) => WAITING.includes(r.result?.status));

  async function send() {
    setPhase("sending");
    setMessage(null);
    for (const r of sendable) {
      try {
        const out = await post("/api/pollen/schedule", { itemIds: [r.item.id], channelIds: pickedChannels });
        patchRow(r.item.id, { result: out.results[0] });
      } catch (e) {
        patchRow(r.item.id, { result: { status: "not_sent", error: e.message } });
      }
    }
    setSentAt(Date.now());
    setPhase("sent");
  }

  useEffect(() => {
    if (phase !== "sent" || !waiting) return undefined;
    const t = setInterval(async () => {
      setNow(Date.now());
      try {
        await post("/api/pollen/sync");
        const { items: fresh } = await api("/api/items?status=approved");
        setRows((rs) => rs.map((r) => {
          const f = fresh.find((x) => x.id === r.item.id);
          return f?.pollen && WAITING.includes(r.result?.status) ? { ...r, result: { ...f.pollen } } : r;
        }));
      } catch { /* keep checking */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const asleep = phase === "sent" && waiting && sentAt && now - sentAt >= ASLEEP_MS;
  const label = sendable.length ? `Schedule ${sendable.length} ${sendable.length === 1 ? "cover" : "covers"}` : "Schedule";

  function status(r) {
    if (r.result) {
      if (r.result.status === "refused") return <span className="state bad">Not sent: {r.result.error}</span>;
      const b = badgeFor(r.result);
      return b ? <span className={`state ${b.tone}`} title={b.why}>{b.text}{b.tone === "bad" && r.result.error ? `: ${r.result.error}` : ""}</span> : null;
    }
    if (r.problems.length) return <span className="problem">Fix the caption first: {r.problems.join(" ")}</span>;
    if (r.renderError) return <span className="problem">{r.renderError}</span>;
    return <span className="state wait">{r.rendered ? "Ready" : "Getting it ready"}</span>;
  }

  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget && phase !== "sending") (phase === "sent" ? onDone : onClose)(); }}>
      <div className="sheet" role="dialog" aria-label="Schedule with Pollen">
        <div className="sheetHead">
          <h2>Schedule with Pollen</h2>
          <button className="ghost mini" onClick={phase === "sent" ? onDone : onClose} disabled={phase === "sending"}>Close</button>
        </div>
        <p className="hint">Pollen books each cover on the first day with no photo post, starting a week out. One photo post a day, never two.</p>

        <label>Post to</label>
        {channels === null && <p className="hint">Getting your channels</p>}
        <div className="channels">
          {(channels || []).map((c) => (
            <label key={c.id} className={c.ready ? "channel" : "channel off"}>
              <input type="checkbox" data-channel={c.id} checked={Boolean(on[c.id])} disabled={!c.ready || phase !== "ready"}
                onChange={(e) => setOn((o) => ({ ...o, [c.id]: e.target.checked }))} />
              <span>{NAMES[c.platform] || c.platform}</span>
              <span className="hint">{c.ready ? c.handle || "" : "needs reconnecting"}</span>
            </label>
          ))}
        </div>
        {rows.some((r) => r.hasSlides) && <p className="hint">Covers with slides go out as the cover alone for now. Carousels come next.</p>}
        {rows.some((r) => r.songStays && !r.problems.length) && <p className="hint">Covers with a downloaded song go out without the song for now. Songs come next.</p>}

        <label>{items.length === 1 ? "Cover" : `${items.length} covers`}</label>
        <div className="sheetCovers">
          {rows.map((r) => (
            <div key={r.item.id} className="sheetCover">
              {r.thumb ? <img src={r.thumb} alt="" /> : <span className="ph" />}
              <div className="meta">
                <span className="cap">{(r.caption ?? postedCaption(r.item, ctas)) || "No caption"}</span>
                {status(r)}
              </div>
            </div>
          ))}
        </div>

        {asleep && <p className="asleep">uBee's computer seems to be asleep. Your covers are saved and book as soon as it wakes up. You can close this.</p>}
        {message && <p className="problem">{message}</p>}

        <div className="sheetActions">
          {phase === "sent"
            ? <button onClick={onDone}>Done</button>
            : <button onClick={send} disabled={phase !== "ready" || !sendable.length || !pickedChannels.length}>{phase === "sending" ? "Sending" : label}</button>}
        </div>
      </div>
    </div>
  );
}
