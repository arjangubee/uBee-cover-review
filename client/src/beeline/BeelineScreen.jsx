import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../icons.jsx";
import { useSession } from "../session.js";
import * as api from "./beelineApi.js";
import {
  agentKey, ago, askCss, durText, fmt, PLACEHOLDER, pokeReach, sessionState, sessionText, sizeText, why,
} from "./beelineText.js";
import "./beeline.css";

// The Beeline screen (1.16): Arjang's Beeline page inside Cover Review. The room live, his posts, 👍, pokes and asks,
// with a device key he makes on his Beeline page. Pause, close, invites and key resets stay on that page.

const MAX_ATTACH = 10;
const MAX_UPLOAD = 52428800; // 50 MB per video or file
const PHOTO_MAX = 3 * 1024 * 1024; // Beeline's limit per photo
const PHOTO_EDGE = 1800;
const DOUBLE_TAP_MS = 320;
const SEAT = { claude: "#E8E2D6", muse: "#FF7AB6" };
const HEX = /^#[0-9a-f]{6}$/i;
const LIVE = new Set(["listening", "thinking", "working", "here"]);
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FINE = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: fine)").matches;
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const HINT = FINE ? "Return adds a line. " + (MAC ? "⌘" : "Ctrl") + " Return sends." : "Return adds a line. Tap Send to send.";

export default function BeelineScreen({ active = true }) {
  // The device key is kept for the account signed in on this browser (1.15.0), so another account here never has it.
  const { handle } = useSession();
  const [device, setDevice] = useState(() => api.savedDevice(handle));
  const [lost, setLost] = useState(false);
  if (!device) return <ConnectCard lost={lost} onConnected={(d) => { api.saveDevice(d, handle); setLost(false); setDevice(d); }} />;
  return (
    <Room key={device.key} device={device} active={active}
      onLost={() => { api.forgetDevice(handle); setLost(true); setDevice(null); }}
      onDisconnect={() => { api.forgetDevice(handle); setLost(false); setDevice(null); }} />
  );
}

/* ---------- connecting this device ---------- */

function ConnectCard({ lost, onConnected }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(lost ? "That key stopped working, so it may have been revoked. Make a new one on your Beeline page." : "");
  const [busy, setBusy] = useState(false);

  const connect = async (e) => {
    if (e) e.preventDefault();
    const key = api.cleanKey(value);
    if (!api.looksLikeKey(key)) { setError("That isn't a device key. Device keys start with bld_."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await api.me(key);
      const d = { key, name: (r.device && r.device.name) || "This device", room: (r.room && r.room.id) || "", at: Date.now() };
      setValue("");
      onConnected(d);
    } catch (err) {
      setError(err.status === 401 ? "That key didn't work. Make a new one on your Beeline page." : err.message);
    } finally {
      setBusy(false);
    }
  };
  const paste = async () => {
    try {
      setValue(api.cleanKey(await navigator.clipboard.readText()));
      setError("");
    } catch {
      setError("Paste didn't work here. Press and hold the field, then tap Paste.");
    }
  };

  return (
    <div className="blRoot blConnect">
      <form className="blConnectCard" onSubmit={connect}>
        <h2>Connect this device</h2>
        <p>The Beeline is the room where your agents work together. Make a key on your Beeline page under Connect a device, then paste it here.</p>
        <label className="blField">
          <span>Device key</span>
          <input value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} placeholder="bld_..." autoComplete="off"
            autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-invalid={error ? "true" : undefined} aria-describedby="blConnectNote" />
        </label>
        <div className="blConnectActions">
          <button type="button" className="blLinkBtn" onClick={paste}>Paste</button>
          <button type="submit" className="blPrimary" disabled={busy || !value.trim()}>{busy ? "Connecting…" : "Connect"}</button>
        </div>
        {error ? <p className="blProblem" role="alert">{error}</p> : null}
        <p className="blNote" id="blConnectNote">The key stays on this device. Anyone with it can post as you, so keep it out of chats and screenshots.</p>
      </form>
    </div>
  );
}

/* ---------- the room ---------- */

function Room({ device, active, onLost, onDisconnect }) {
  const key = device.key;
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [agents, setAgents] = useState(() => new Map());
  const [sessions, setSessions] = useState([]);
  const [asks, setAsks] = useState([]);
  const [relay, setRelay] = useState(null);
  const [messages, setMessages] = useState([]);
  const [rx, setRx] = useState(() => new Map());
  const [ft, setFt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const [pokeNote, setPokeNote] = useState("");
  const [pokeLocal, setPokeLocal] = useState(() => new Map());
  const [armed, setArmed] = useState(null); // "disconnect", or "ask:7", while its second tap is due
  const [unseen, setUnseen] = useState(false);
  const [view, setView] = useState(null);
  const st = useRef({ after: 0, rev: 0, v: "", rxHold: new Map(), stick: true, lastTap: null });
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const noteTimer = useRef(0);
  const armTimer = useRef(0);
  const lostRef = useRef(onLost);
  lostRef.current = onLost;
  const closeView = useCallback(() => setView(null), []);

  const owner = (members.find((m) => m.handle === "owner") || {}).name || "Arjang";
  const roomId = (room && room.id) || device.room || "";
  const since = (sec) => (sec == null ? null : sec + Math.round((Date.now() - fetchedAt) / 1000));

  const applyFeed = useCallback((res) => {
    const f = res.feed || {};
    setFt(res.ft || "");
    setRoom(f.room || null);
    setMembers(Array.isArray(f.members) ? f.members : []);
    setAgents(new Map((Array.isArray(f.agents) ? f.agents : []).map((a) => [String(a.key), a])));
    setSessions(Array.isArray(f.sessions) ? f.sessions : []);
    setAsks(Array.isArray(f.asks) ? f.asks : []);
    setRelay(f.relay || null);
    setFetchedAt(Date.now());
    const fresh = (Array.isArray(f.messages) ? f.messages : []).filter((m) => m.id > st.current.after);
    if (fresh.length) {
      st.current.after = fresh[fresh.length - 1].id;
      setMessages((prev) => prev.concat(fresh).slice(-400));
    }
    const r = res.reactions;
    if (r && Array.isArray(r.list) && r.list.length) {
      const hold = st.current.rxHold;
      setRx((prev) => {
        const next = new Map(prev);
        for (const it of r.list) {
          const id = Number(it.m);
          if (it.own && (hold.get(id) || 0) > Date.now()) continue;
          const m = new Map(next.get(id) || []);
          const k = it.own ? "own" : String(it.k);
          if (it.on) m.set(k, { e: it.e, who: it.who, own: !!it.own }); else m.delete(k);
          next.set(id, m);
        }
        return next;
      });
    }
    if (r && Number(r.rev) > st.current.rev) st.current.rev = Number(r.rev);
    setLoaded(true);
  }, []);

  // One long wait on Beeline at a time while the screen shows. Hidden, it stops, and catches up when it's back.
  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    const ctl = new AbortController();
    const visible = () => new Promise((resolve) => {
      if (!document.hidden) { resolve(); return; }
      const on = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", on); resolve(); } };
      document.addEventListener("visibilitychange", on);
    });
    (async () => {
      let fails = 0;
      while (!stopped) {
        await visible();
        if (stopped) break;
        try {
          const s = st.current;
          // After a failure, ask once with no wait, so the status shows the way back as soon as Beeline answers.
          const res = await api.feed(key, { after: s.after, r: s.rev, v: s.v, wait: s.v && !fails ? 25 : 0 }, ctl.signal);
          fails = 0;
          setOffline(false);
          if (!res.same) applyFeed(res);
          s.v = res.v || "";
        } catch (e) {
          if (stopped || (e && e.name === "AbortError")) break;
          if (e && e.status === 401) { lostRef.current(); break; }
          fails += 1;
          setOffline(true);
          await sleep(Math.min(30000, 1500 * 2 ** Math.min(fails, 5)));
        }
      }
    })();
    return () => { stopped = true; ctl.abort(); };
  }, [active, key, applyFeed]);

  // Ages on screen ("4 min ago") move on between answers.
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [active]);

  // The screen fills the space under the switch, above the Muse app's tab bar on a phone (--host-bar), and shrinks
  // with the phone's keyboard. It fits again when the update note above the switch comes or goes.
  useLayoutEffect(() => {
    if (!active) return undefined;
    const fit = () => {
      const el = rootRef.current;
      if (!el) return;
      const vv = window.visualViewport;
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--host-bar")) || 0;
      const h = (vv ? vv.height : window.innerHeight) - bar - (el.getBoundingClientRect().top + window.scrollY);
      const px = Math.max(360, Math.round(h)) + "px";
      if (el.style.height !== px) el.style.height = px;
    };
    fit();
    const vv = window.visualViewport;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(document.body);
    window.addEventListener("resize", fit);
    if (vv) vv.addEventListener("resize", fit);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", fit);
      if (vv) vv.removeEventListener("resize", fit);
    };
  }, [active, loaded]);

  // New messages: follow them when she's at the bottom, otherwise show the pill.
  const nearBottom = () => {
    const l = listRef.current;
    return !l || l.scrollHeight - l.scrollTop - l.clientHeight < 140;
  };
  const toBottom = (smooth) => {
    const l = listRef.current;
    if (l) l.scrollTo({ top: l.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    st.current.stick = true;
    setUnseen(false);
  };
  const count = messages.length;
  useLayoutEffect(() => {
    if (!count) return;
    if (st.current.stick) toBottom(false); else setUnseen(true);
  }, [count]);
  useEffect(() => { if (active && loaded) toBottom(false); }, [active, loaded]);
  const onScroll = () => {
    st.current.stick = nearBottom();
    if (st.current.stick) setUnseen(false);
  };

  // Words for open asks take their colors. The rules follow the asks, so a closed ask's words turn plain everywhere.
  const css = askCss(asks);

  const say = (text, ms) => {
    clearTimeout(noteTimer.current);
    setPokeNote(text);
    noteTimer.current = setTimeout(() => setPokeNote(""), ms || 4000);
  };
  const arm = (what) => {
    clearTimeout(armTimer.current);
    setArmed(what);
    armTimer.current = setTimeout(() => setArmed(null), 4000);
  };

  // A tap pokes the agent. A second tap while its ring is on sends the poke out again.
  const pokeAgent = async (agent, name) => {
    const a = agents.get(agent) || {};
    const again = !!(a.poked || pokeLocal.has(agent));
    setPokeLocal((p) => new Map(p).set(agent, Date.now()));
    say(again ? "Poking " + name + " again" : "Poked " + name);
    try {
      const r = await api.poke(key, agent, again);
      say(pokeReach(r, name, again, relay), 7000);
    } catch (e) {
      setPokeLocal((p) => { const n = new Map(p); n.delete(agent); return n; });
      say("Couldn't poke " + name + ": " + why(e.message), 6000);
    }
  };
  useEffect(() => {
    // A tap's ring holds until the room shows the poke, then follows the room.
    setPokeLocal((p) => {
      if (!p.size) return p;
      const n = new Map(p);
      for (const [k, t] of p) if ((agents.get(k) || {}).poked || Date.now() - t > 8000) n.delete(k);
      return n.size === p.size ? p : n;
    });
  }, [agents]);

  const showMessage = (id, color) => {
    const el = listRef.current && listRef.current.querySelector('[data-id="' + Number(id) + '"]');
    if (!el) { say("That message is older than what this screen holds."); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (color) el.style.setProperty("--ask", color);
    el.classList.add("blLit");
    setTimeout(() => el.classList.remove("blLit"), 2200);
  };
  const closeAsk = async (n) => {
    if (armed !== "ask:" + n) { arm("ask:" + n); return; }
    setArmed(null);
    const drop = () => setAsks((list) => list.filter((q) => Number(q.n) !== Number(n)));
    try {
      await api.closeAsk(key, n);
      drop();
      say("Closed ask " + n + ".");
    } catch (e) {
      if (e.message === "no_ask") { drop(); say("Ask " + n + " was already closed."); return; }
      say("Couldn't close ask " + n + ": " + why(e.message), 6000);
    }
  };

  const setLike = async (id, on) => {
    st.current.rxHold.set(id, Date.now() + 5000);
    setRx((prev) => {
      const next = new Map(prev);
      const m = new Map(next.get(id) || []);
      if (on) m.set("own", { e: "👍", who: owner, own: true }); else m.delete("own");
      next.set(id, m);
      return next;
    });
    try {
      await api.react(key, id, on);
    } catch (e) {
      st.current.rxHold.delete(id);
      say("Your 👍 didn't save: " + why(e.message), 5000);
    }
  };
  const liked = (id) => (rx.get(id) || new Map()).has("own");
  const onBubbleTap = (e, id) => {
    if (e.target.closest("a, button, video, input, textarea")) return;
    const now = Date.now();
    const last = st.current.lastTap;
    if (last && last.id === id && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) {
      st.current.lastTap = null;
      setLike(id, !liked(id));
      return;
    }
    st.current.lastTap = { id, t: now, x: e.clientX, y: e.clientY };
  };

  const status = !room ? "Connecting" : room.status === "paused" ? "Paused" : room.status === "closed" || room.status === "archived" ? "Closed"
    : sessions.some((s) => (s.handle === "claude" || s.handle === "muse") && LIVE.has(sessionState(s))) ? "Live" : "Open";

  return (
    <div className="blRoot" ref={rootRef}>
      <style>{css}</style>
      <header className="blTop">
        <h2 className="blTitle">Beeline</h2>
        <span className={"blStatus blStatus" + status} role="status">
          <span className="blDot" aria-hidden="true" />{offline ? "Reconnecting" : status}
        </span>
        <span className="blDevice">{device.name}</span>
        <button type="button" className={"blLinkBtn blQuiet" + (armed === "disconnect" ? " blArmed" : "")}
          onClick={() => (armed === "disconnect" ? onDisconnect() : arm("disconnect"))}>
          {armed === "disconnect" ? "Tap again to disconnect" : "Disconnect"}
        </button>
      </header>

      <Names sessions={sessions} agents={agents} pokeLocal={pokeLocal} since={since} onPoke={pokeAgent} />
      <p className="blNoteLine" role="status" aria-live="polite">{pokeNote}</p>
      <Asks asks={asks} agents={agents} armed={armed} since={since} onShow={showMessage} onClose={closeAsk} />
      {room && room.status === "paused" ? <p className="blBanner">Paused. The agents are holding their messages.</p> : null}
      {room && (room.status === "closed" || room.status === "archived") ? <p className="blBanner">The room is closed.</p> : null}

      <div className="blListWrap">
        <div className="blList" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages">
          {!loaded ? <Skeleton /> : messages.length ? (
            <Messages messages={messages} members={members} agents={agents} owner={owner} rx={rx} roomId={roomId} ft={ft}
              onTap={onBubbleTap} onLike={setLike} liked={liked} onOpen={setView} />
          ) : <p className="blEmpty">No messages yet. Your agents' messages show up here as they talk.</p>}
        </div>
        {unseen ? (
          <button type="button" className="blNewPill" onClick={() => toBottom(true)}>New messages <Icon name="chevronDown" size={18} /></button>
        ) : null}
      </div>

      <Composer deviceKey={key} onSent={() => { st.current.stick = true; }} />
      {view ? <Viewer item={view} roomId={roomId} ft={ft} onClose={closeView} /> : null}
    </div>
  );
}

/* ---------- who's in the room ---------- */

function Names({ sessions, agents, pokeLocal, since, onPoke }) {
  const list = sessions.filter((s) => s.handle === "claude" || s.handle === "muse");
  if (!list.length) return <p className="blNames blNobody">Nobody's in the room yet.</p>;
  const count = {};
  for (const s of list) count[s.name] = (count[s.name] || 0) + 1;
  return (
    <div className="blNames" aria-label="Who is here. Tap a name to poke that agent.">
      {list.map((s) => {
        const k = sessionState({ ...s, ago: since(s.ago), left_ago: since(s.left_ago) });
        const agent = s.key || agentKey(s.name);
        const a = agents.get(agent) || {};
        const color = HEX.test(a.color || "") ? a.color : SEAT[s.handle] || SEAT.claude;
        const poked = !!(a.poked || pokeLocal.has(agent));
        const name = count[s.name] > 1 && s.tag ? s.name + " · " + s.tag : s.name;
        const what = poked ? "Poked" : sessionText({ ...s, ago: since(s.ago), left_ago: since(s.left_ago) }, k);
        return (
          <button type="button" key={s.id} className={"blWho" + (poked ? " blPoked" : "")} data-s={k} data-k={agent} style={{ "--c": color }}
            onClick={() => onPoke(agent, s.name)} aria-label={(poked ? "Poked " : "Poke ") + s.name + ". " + what}>
            <span className="blLight" aria-hidden="true" />
            <b>{name}</b>{a.emoji ? <span className="blEmo" aria-hidden="true">{a.emoji}</span> : null}
            <span className="blWhat">{what}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- open asks ---------- */

function Asks({ asks, agents, armed, since, onShow, onClose }) {
  const list = asks.filter((q) => Number(q.n) > 0 && HEX.test(q.color || ""));
  if (!list.length) return null;
  return (
    <div className="blAsks" aria-label="Open asks for you. Tap one to see the latest message about it.">
      <span className="blAsksLabel">Open asks</span>
      {list.map((q) => {
        const a = agents.get(String(q.key || "")) || {};
        const age = since(q.ago);
        const isArmed = armed === "ask:" + q.n;
        return (
          <span className="blAskChip" key={q.n} style={{ "--ask": q.color }}>
            <button type="button" className="blAskGo" disabled={!q.last_msg}
              onClick={() => onShow(q.last_msg, q.color)}
              aria-label={"Ask " + q.n + " from " + (q.agent || "an agent") + ": " + q.title + (q.last_msg ? ". Show the latest message about it." : ". No message marks it yet.")}>
              <span className="blAskNum">{q.n}</span>
              <span className="blAskTitle">{q.title}</span>
              <span className="blAskSub">{[a.emoji, age != null ? ago(age).replace(/ ago$/, "") : ""].filter(Boolean).join(" · ")}</span>
            </button>
            <button type="button" className={"blAskX" + (isArmed ? " blArmed" : "")} onClick={() => onClose(q.n)}
              aria-label={isArmed ? "Tap again to close ask " + q.n : "Close ask " + q.n}>
              {isArmed ? "Close?" : <Icon name="close" size={16} />}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/* ---------- messages ---------- */

const sameDay = (a, b) => a.toDateString() === b.toDateString();
function dayLabel(d) {
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Messages({ messages, members, agents, owner, rx, roomId, ft, onTap, onLike, liked, onOpen }) {
  const seat = (handle) => (members.find((m) => m.handle === handle) || {}).name || (handle === "claude" ? "Claude" : "Agent");
  const out = [];
  let prev = null;
  for (const m of messages) {
    const d = new Date(m.at);
    if (!prev || !sameDay(new Date(prev.at), d)) out.push(<p className="blDay" key={"d" + m.id}><span>{dayLabel(d)}</span></p>);
    if (m.sender === "system") {
      out.push(<p className="blSys" key={m.id} data-id={m.id}>{m.body} · {clock.format(d)}</p>);
    } else {
      const mine = m.sender === "owner";
      const name = mine ? "You" : m.label || seat(m.sender);
      const a = agents.get(agentKey(name)) || {};
      const color = mine ? "" : HEX.test(a.color || "") ? a.color : SEAT[m.sender] || SEAT.claude;
      const cont = prev && prev.sender === m.sender && (prev.label || "") === (m.label || "") && Date.parse(m.at) - Date.parse(prev.at) < 180000;
      out.push(
        <Message key={m.id} m={m} mine={mine} name={name} emoji={mine ? "" : a.emoji} color={color} cont={cont} owner={owner}
          rx={rx.get(m.id)} roomId={roomId} ft={ft} onTap={onTap} onLike={onLike} liked={liked(m.id)} onOpen={onOpen} />,
      );
    }
    prev = m;
  }
  return out;
}

function Message({ m, mine, name, emoji, color, cont, owner, rx, roomId, ft, onTap, onLike, liked, onOpen }) {
  const files = m.files || [];
  const body = files.length && PLACEHOLDER.test(String(m.body).trim()) ? "" : m.body;
  const time = clock.format(new Date(m.at));
  return (
    <div className={"blMsg" + (mine ? " blMine" : "") + (cont ? " blCont" : "")} data-id={m.id} style={color ? { "--c": color } : undefined}>
      {!cont ? (
        <p className="blMeta">
          <span className="blName">{name}</span>{emoji ? <span className="blEmo" aria-hidden="true">{emoji}</span> : null}
          <time dateTime={m.at}>{time}</time>
        </p>
      ) : null}
      <div className={"blBubble" + (files.length ? " blHasMedia" : "")} tabIndex={0} onPointerUp={(e) => onTap(e, m.id)}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); onLike(m.id, !liked); } }}
        aria-label={(mine ? "Your message" : "Message from " + name) + " at " + time + ". Double tap, or press Enter, to " + (liked ? "take back your 👍." : "give it your 👍.")}>
        {files.length ? <Media files={files} who={name} roomId={roomId} ft={ft} onOpen={onOpen} /> : null}
        {body ? <div className="blText" dangerouslySetInnerHTML={{ __html: fmt(body, { agent: !mine, owner }) }} /> : null}
      </div>
      <Reactions rx={rx} />
    </div>
  );
}

function Reactions({ rx }) {
  if (!rx || !rx.size) return null;
  const groups = new Map();
  for (const r of rx.values()) {
    const g = groups.get(r.e) || { e: r.e, who: [], own: false };
    g.who.push(r.own ? "You" : r.who || "Someone");
    g.own = g.own || r.own;
    groups.set(r.e, g);
  }
  const list = [...groups.values()].sort((a, b) => (a.e === "👍") - (b.e === "👍"));
  return (
    <p className="blReax">
      {list.map((g) => (
        <span key={g.e} className={"blRx" + (g.own ? " blRxMine" : "")} title={g.who.join(", ")} aria-label={g.e + " from " + g.who.join(", ")}>
          {g.e}{g.who.length > 1 ? <b>{g.who.length}</b> : null}
        </span>
      ))}
    </p>
  );
}

function typeLabel(f) {
  const ext = String(f.name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return ext ? ext[1].toUpperCase() : "File";
}

function Media({ files, who, roomId, ft, onOpen }) {
  const pics = files.filter((f) => f.kind !== "file");
  const docs = files.filter((f) => f.kind === "file");
  return (
    <>
      {pics.length ? (
        <div className={"blPics" + (pics.length > 1 ? " blPicsGrid" : "")}>
          {pics.map((f, i) => {
            const vid = f.kind === "video";
            const gone = f.state === "expired" ? "Expired after 30 days" : f.state === "failed" ? "Didn't finish sending" : "";
            const lone = pics.length === 1;
            const style = lone && f.w && f.h && !gone ? { aspectRatio: f.w + " / " + f.h, width: Math.max(96, Math.round(f.w * Math.min(260 / f.w, 320 / f.h, 1))) + "px" } : undefined;
            const label = (vid ? "Play video" : "Open photo") + (pics.length > 1 ? " " + (i + 1) + " of " + pics.length : "") + " from " + who;
            return (
              <button type="button" key={f.id} className={"blPic" + (vid ? " blVid" : "") + (gone && lone ? " blPicGone" : "")} style={style} disabled={!!gone}
                onClick={() => onOpen({ ...f, who })} aria-label={gone ? label + ". " + gone : label}>
                {!gone ? <Thumb f={f} roomId={roomId} ft={ft} /> : null}
                {vid && !gone ? <span className="blPlay" aria-hidden="true"><Icon name="play" size={22} /></span> : null}
                {vid && f.dur && !gone ? <span className="blDur">{durText(f.dur)}</span> : null}
                {gone ? <span className="blGone">{gone}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {docs.map((f) => {
        const gone = f.state === "expired" ? "Expired after 30 days" : f.state === "failed" ? "Didn't finish sending" : "";
        return gone ? (
          <span key={f.id} className="blDoc blDocGone"><Icon name="file" /><span><b>{f.name || "file"}</b><span>{gone}</span></span></span>
        ) : (
          <a key={f.id} className="blDoc" href={api.fileUrl(roomId, ft, f.id)} download={f.name || "file"}>
            <Icon name="file" /><span><b>{f.name || "file"}</b><span>{typeLabel(f)} · {sizeText(f.bytes)}</span></span>
            <Icon name="download" size={20} />
          </a>
        );
      })}
    </>
  );
}

// The small preview when Beeline has one, else the photo itself. A video's poster often lands a few seconds after the
// video, so a video with no poster yet stays a dark tile and looks again a few times.
const POSTER_RETRY_MS = [2000, 6000, 15000, 40000];
function Thumb({ f, roomId, ft }) {
  const [full, setFull] = useState(false);
  const [tries, setTries] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef(0);
  useEffect(() => { setFull(false); setTries(0); setWaiting(false); }, [roomId, ft, f.id]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const base = api.fileUrl(roomId, ft, f.id, !full);
  if (!base || waiting) return null;
  const onError = () => {
    if (f.kind === "image" && !full) { setFull(true); return; }
    setWaiting(true);
    if (f.kind !== "video" || tries >= POSTER_RETRY_MS.length) return;
    timer.current = setTimeout(() => { setTries((n) => n + 1); setWaiting(false); }, POSTER_RETRY_MS[tries]);
  };
  return <img src={tries ? base + "&n=" + tries : base} alt="" loading="lazy" decoding="async" onError={onError} />;
}

function Viewer({ item, roomId, ft, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    if (closeRef.current) closeRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); };
  }, [onClose]);
  const url = api.fileUrl(roomId, ft, item.id);
  return (
    <div className="blViewer" role="dialog" aria-modal="true" aria-label={(item.kind === "video" ? "Video" : "Photo") + " from " + item.who}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button type="button" ref={closeRef} className="iconBtn blViewerClose" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      {item.kind === "video" ? <video src={url} controls autoPlay playsInline /> : <img src={url} alt={item.name || ""} />}
      <p className="blViewerCap">{item.name ? item.name + " · " : ""}{item.who}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="blSkeleton" aria-label="Loading the room">
      {[62, 44, 78, 36].map((w, i) => <span key={i} className={i % 2 ? "blMine" : ""} style={{ width: w + "%" }} />)}
    </div>
  );
}

/* ---------- writing to the room ---------- */

// Photos go up re-drawn, which also strips hidden data like location, and at most 1800 px on the long edge.
async function preparePhoto(file) {
  if (file.type === "image/gif" && file.size <= PHOTO_MAX) return { blob: file, name: file.name || "photo.gif" };
  let source;
  try {
    source = await createImageBitmap(file);
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error((file.name || "That photo") + " couldn't be read."));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = source.width, h = source.height;
  const s = Math.min(1, PHOTO_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(h * s));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const base = String(file.name || "photo").replace(/\.[^.]*$/, "") || "photo";
  if (file.type === "image/png") {
    const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (png && png.size <= PHOTO_MAX) return { blob: png, name: base + ".png" };
  }
  for (const q of [0.82, 0.7, 0.55]) {
    const jpg = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (jpg && jpg.size <= PHOTO_MAX) return { blob: jpg, name: base + ".jpg" };
  }
  throw new Error((file.name || "That photo") + " is too big to send.");
}

// A video's size and length for the room's tile, and a poster frame for it.
function videoInfo(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (out) => { clearTimeout(t); resolve(out); };
    const t = setTimeout(() => done({ url }), 5000);
    v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
    v.onloadedmetadata = () => done({ url, w: v.videoWidth || 0, h: v.videoHeight || 0, ms: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0 });
    v.onerror = () => done({ url });
  });
}
function posterOf(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const t = setTimeout(() => resolve(null), 6000);
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch { /* the first frame */ } };
    v.onseeked = () => {
      const s = Math.min(1, 640 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((v.videoWidth || 1) * s));
      c.height = Math.max(1, Math.round((v.videoHeight || 1) * s));
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => { clearTimeout(t); resolve(b && b.size <= 262144 ? b : null); }, "image/jpeg", 0.7);
    };
    v.onerror = () => { clearTimeout(t); resolve(null); };
  });
}

function Composer({ deviceKey, onSent }) {
  const [text, setText] = useState("");
  const [tray, setTray] = useState([]);
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState({ text: HINT, err: false });
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const previews = useRef(new Set());

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (text) el.style.height = Math.min(168, el.scrollHeight) + "px";
  }, [text]);
  useEffect(() => () => { for (const u of previews.current) URL.revokeObjectURL(u); }, []);
  const drop = (pred) => setTray((cur) => {
    for (const t of cur) if (pred(t) && t.preview) { URL.revokeObjectURL(t.preview); previews.current.delete(t.preview); }
    return cur.filter((t) => !pred(t));
  });

  const add = (files) => {
    const list = [...files];
    if (!list.length) return;
    setTray((cur) => {
      const room = MAX_ATTACH - cur.length;
      if (list.length > room) setHint({ text: "Up to " + MAX_ATTACH + " photos, videos or files per message.", err: true });
      return cur.concat(list.slice(0, Math.max(0, room)).map((f, i) => {
        const kind = f.type.startsWith("image/") && f.type !== "image/svg+xml" ? "image" : f.type.startsWith("video/") ? "video" : "file";
        const preview = kind === "image" ? URL.createObjectURL(f) : "";
        if (preview) previews.current.add(preview);
        return { id: Date.now() + "-" + i + "-" + f.name, file: f, kind, preview };
      }));
    });
  };
  const remove = (id) => drop((t) => t.id === id);

  const submit = async (e) => {
    if (e) e.preventDefault();
    const words = text.trim();
    if ((!words && !tray.length) || sending) return;
    const big = tray.find((t) => t.kind !== "image" && t.file.size > MAX_UPLOAD);
    if (big) { setHint({ text: big.file.name + " is over 50 MB.", err: true }); return; }
    setSending(true);
    setHint({ text: "Sending…", err: false });
    try {
      const photos = tray.filter((t) => t.kind === "image");
      const others = tray.filter((t) => t.kind !== "image");
      let first = true;
      if (photos.length) {
        setHint({ text: photos.length > 1 ? "Getting the photos ready…" : "Getting the photo ready…", err: false });
        const ready = [];
        for (const p of photos) ready.push(await preparePhoto(p.file));
        await api.sendPhotos(deviceKey, ready, words);
        first = false;
        setText("");
        drop((t) => t.kind === "image");
      }
      for (let i = 0; i < others.length; i++) {
        const t = others[i];
        setHint({ text: "Sending " + (t.kind === "video" ? "the video" : t.file.name) + (others.length > 1 ? " (" + (i + 1) + " of " + others.length + ")" : "") + "…", err: false });
        const info = t.kind === "video" ? await videoInfo(t.file) : null;
        const r = await api.upload(deviceKey, t.file, first ? words : "", info);
        first = false;
        setText("");
        drop((x) => x.id === t.id);
        const vid = t.kind === "video" && /with videos? (\d+)/.exec(r.text || "");
        if (vid && info && info.url) {
          const jpeg = await posterOf(info.url);
          if (jpeg) await api.poster(deviceKey, vid[1], jpeg).catch(() => {});
        }
        if (info && info.url) URL.revokeObjectURL(info.url);
      }
      if (first) await api.send(deviceKey, words);
      setText("");
      setHint({ text: HINT, err: false });
      onSent();
    } catch (err) {
      const ambiguous = err.status === 0 || err.status >= 500;
      setHint({ text: ambiguous ? "Not sure it went through. Check the room before sending again." : "Not sent: " + why(err.message), err: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="blComposer" onSubmit={submit}>
      {tray.length ? (
        <div className="blTray">
          {tray.map((t) => (
            <span className="blTile" key={t.id}>
              {t.preview ? <img src={t.preview} alt="" /> : <span className="blTileIcon"><Icon name={t.kind === "video" ? "video" : "file"} /></span>}
              <span className="blTileName">{t.file.name}</span>
              <button type="button" className="blTileX" onClick={() => remove(t.id)} aria-label={"Remove " + t.file.name} disabled={sending}>
                <Icon name="close" size={16} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="blComposeRow">
        <button type="button" className="iconBtn blAttach" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Add photos, videos or files" disabled={sending}>
          <Icon name="attach" />
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <textarea ref={inputRef} rows={1} value={text} placeholder="Message the room" aria-label="Message the room" enterKeyHint="enter"
          onChange={(e) => { setText(e.target.value); if (hint.err) setHint({ text: HINT, err: false }); }}
          onPaste={(e) => { const files = [...(e.clipboardData ? e.clipboardData.files : [])]; if (files.length) { e.preventDefault(); add(files); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} />
        <button type="submit" className="blSend" disabled={sending || (!text.trim() && !tray.length)}>{sending ? "Sending" : "Send"}</button>
      </div>
      <p className={"blHint" + (hint.err ? " blErr" : "")} role="status">{hint.text}</p>
    </form>
  );
}
