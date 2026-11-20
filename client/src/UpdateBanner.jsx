import { useCallback, useEffect, useRef, useState } from "react";
import { BUILT_VERSION, RELEASE_URL, releaseBanner } from "./release.js";

const SEEN_KEY = "cover-review-update-seen";

function seen(at) {
  try { return localStorage.getItem(SEEN_KEY) === at; } catch { return false; }
}
function markSeen(at) {
  try { localStorage.setItem(SEEN_KEY, at); } catch { /* storage off, the note just shows again */ }
}

// A text box with the cursor in it counts as busy too, so an update never restarts the app under her typing.
function typing() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(String(el.type).toLowerCase());
}

const TOUCH_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
const REPORT_EVERY_MS = 15000; // a tap is passed on at most this often, and the last one always goes
const BUSY_EVERY_MS = 20000; // while an editor, a sheet or a text box is open
const FOLLOW_EVERY_MS = 1500;

// Updates (1.13.10, Arjang #729, Quill #733 and #746).
// A copy run from git updates itself at a quiet moment. This page tells the app when she taps, types, scrolls or
// wheels, and, while an editor, a sheet or a text box is open, that she's busy. The app waits for a quiet minute,
// backs up her data, updates and restarts. This page follows it and reloads itself once the new version answers, or
// right after she closes what she has open. UPDATE NOW is a small "Update now" for anyone who doesn't want to wait.
// A copy without git (her space) can't pull from GitHub: her Muse brings each version in, so the page only says a new
// version is out, with a small link to copy the ask in case a port was missed.
export default function UpdateBanner({ inUse = false }) {
  const [u, setU] = useState(null);
  const [hosted, setHosted] = useState(null); // { version, whatsNew, ask } for a copy without git
  const [copied, setCopied] = useState(null); // null | "copied" | "manual": a tap always shows a result (1.8)
  const askRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | updating | restarting
  const [error, setError] = useState(null);
  const bootAtLoad = useRef(null); // the app process this page came from
  const reloading = useRef(false);
  const busyNow = useRef(() => false);
  busyNow.current = () => inUse || typing();

  // Reload once the page is free: nothing open and no cursor in a text box. A restarted app may be a new version.
  const reloadWhenFree = useCallback(() => {
    if (reloading.current) return;
    reloading.current = true;
    const go = async () => {
      if (busyNow.current()) { setTimeout(go, FOLLOW_EVERY_MS); return; }
      try {
        const page = await fetch("/", { cache: "no-store" });
        if (page.ok) { window.location.reload(); return; }
      } catch { /* not back yet */ }
      setTimeout(go, FOLLOW_EVERY_MS);
    };
    go();
  }, []);

  const refresh = useCallback(async () => {
    let s = null;
    try {
      const r = await fetch("/api/update", { cache: "no-store" });
      if (r.ok) s = await r.json();
    } catch { /* the app is restarting, offline, or has no server updater */ }
    if (s?.git) {
      setU(s);
      setHosted(null);
      if (s.boot && bootAtLoad.current == null) bootAtLoad.current = s.boot;
      if (s.state === "updating" || s.state === "restarting") setPhase(s.state);
      else if (s.boot && s.boot !== bootAtLoad.current) reloadWhenFree();
      return;
    }
    setU(s);
    try {
      const r = await fetch(RELEASE_URL, { cache: "no-store" });
      setHosted(r.ok ? releaseBanner(await r.json(), BUILT_VERSION) : null);
    } catch { /* GitHub unreachable: try again next time */ }
  }, [reloadWhenFree]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); window.removeEventListener("focus", refresh); };
  }, [refresh]);

  // While the app updates, follow it until the new process answers (a new boot id), then reload when she's free.
  useEffect(() => {
    if (phase === "idle") return undefined;
    const t = setInterval(async () => {
      try {
        const s = await (await fetch("/api/update", { cache: "no-store" })).json();
        if (s.boot && bootAtLoad.current && s.boot !== bootAtLoad.current) { reloadWhenFree(); return; }
        if (s.state === "failed") { setError(s.error); setPhase("idle"); setU(s); return; }
        if (s.state === "restarting") setPhase("restarting");
      } catch {
        setPhase("restarting"); // the old version just shut down; keep waiting for the new one
      }
    }, FOLLOW_EVERY_MS);
    return () => clearInterval(t);
  }, [phase, reloadWhenFree]);

  // Her activity, for a git copy's quiet moment: every tap, key, scroll or wheel at most every 15 seconds (the last one
  // always goes), and "busy" right away when an editor, a sheet or a text box opens, then every 20 seconds while it's open.
  const send = useRef(() => {});
  const isGit = Boolean(u?.git);
  useEffect(() => {
    if (!isGit) return undefined;
    let lastTouch = Date.now(), lastSent = 0, trailing = null;
    send.current = () => {
      lastSent = Date.now();
      fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busy: busyNow.current(), idleMs: Date.now() - lastTouch }) }).catch(() => {});
    };
    const touched = () => {
      lastTouch = Date.now();
      const wait = REPORT_EVERY_MS - (lastTouch - lastSent);
      if (wait <= 0) send.current();
      else if (!trailing) trailing = setTimeout(() => { trailing = null; send.current(); }, wait);
    };
    for (const e of TOUCH_EVENTS) window.addEventListener(e, touched, { capture: true, passive: true });
    window.addEventListener("focusin", touched, true);
    const beat = setInterval(() => { if (busyNow.current()) send.current(); }, BUSY_EVERY_MS);
    return () => {
      for (const e of TOUCH_EVENTS) window.removeEventListener(e, touched, { capture: true });
      window.removeEventListener("focusin", touched, true);
      clearInterval(beat);
      clearTimeout(trailing);
      send.current = () => {};
    };
  }, [isGit]);
  useEffect(() => { if (isGit && inUse) send.current(); }, [isGit, inUse]);

  async function updateNow() {
    setError(null);
    setPhase("updating");
    try {
      const r = await (await fetch("/api/update/apply", { method: "POST" })).json();
      if (!r.ok) { setError(r.error || "The update didn't start."); setPhase("idle"); }
    } catch {
      setPhase("restarting");
    }
  }

  // The fallback line for a missed port: copy it, or show it ready to press and hold. A tap is never a silent no-op.
  useEffect(() => {
    if (copied !== "manual" || !askRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(askRef.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [copied]);
  async function copyAsk() {
    let ok = false;
    try { await navigator.clipboard.writeText(hosted.ask); ok = true; } catch { /* blocked here: try the old way */ }
    if (!ok) {
      try {
        const t = document.createElement("textarea");
        t.value = hosted.ask;
        t.setAttribute("readonly", "");
        t.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
        document.body.appendChild(t);
        t.select();
        ok = document.execCommand("copy");
        t.remove();
      } catch { ok = false; }
    }
    setCopied(ok ? "copied" : "manual");
  }

  if (phase === "updating" || phase === "restarting") {
    return (
      <div className="updateBanner busy" role="status">
        <strong>{phase === "updating" ? "Updating..." : "Almost done, restarting the app..."}</strong>
        <span>Keep this page open. It reloads by itself in about a minute.</span>
      </div>
    );
  }

  if (hosted && !u?.git) {
    return (
      <div className="updateNote hosted" role="status">
        <span>Version {hosted.version} is out. Your Muse brings it in.</span>
        <button type="button" className="linkBtn small" onClick={copyAsk}>Copy the ask</button>
        {copied === "copied" && <span className="copyNote">Copied. Paste it to your Muse.</span>}
        {copied === "manual" && (
          <span className="copyNote">Press and hold the line to copy it, then paste it to your Muse: <span ref={askRef} className="askLine small">{hosted.ask}</span></span>
        )}
      </div>
    );
  }

  const failedNow = error || u?.state === "failed";
  if (failedNow) {
    const f = u?.failed || {};
    return (
      <div className="updateNote failed" role="alert">
        <span>
          <strong>Couldn&apos;t update to {f.to || u?.latest?.version || "the new version"}.</strong> You&apos;re still on {f.from || BUILT_VERSION}, and nothing was lost.
          {(error || u?.error) && <span className="why"> {error || u?.error}</span>}
        </span>
        <button className="ghost mini" onClick={updateNow}>Try again</button>
      </div>
    );
  }

  const last = u?.lastUpdate;
  // A newer version always wins over the "Updated" note.
  if (!u?.available && last && !seen(last.at) && u?.current?.commit === last.to) {
    return (
      <div className="updateNote">
        <span>
          {last.auto ? "Updated itself" : "Updated"} to version {last.version}.
          {last.savedPatch ? " A local fix from your Muse clashed with it and was saved in data/backups. Tell your Muse: check my Cover Review update." : ""}
        </span>
        <button className="ghost mini" onClick={() => { markSeen(last.at); setU({ ...u, lastUpdate: null }); }}>Got it</button>
      </div>
    );
  }

  if (!u?.available) return null;
  return (
    <div className="updateNote" role="status">
      <span>{u.latest?.version ? `Version ${u.latest.version} is ready.` : "A new version is ready."} It installs itself after a quiet minute.</span>
      <button className="ghost mini" onClick={updateNow}>Update now</button>
    </div>
  );
}
