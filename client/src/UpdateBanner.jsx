import { useCallback, useEffect, useRef, useState } from "react";

const SEEN_KEY = "cover-review-update-seen";

function seen(at) {
  try { return localStorage.getItem(SEEN_KEY) === at; } catch { return false; }
}
function markSeen(at) {
  try { localStorage.setItem(SEEN_KEY, at); } catch { /* storage off, the note just shows again */ }
}

// The big UPDATE NOW banner. The server checks GitHub every 2 minutes; this asks the
// server every minute and whenever the window gets focus.
export default function UpdateBanner() {
  const [u, setU] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | updating | restarting
  const [error, setError] = useState(null);
  const fromBoot = useRef(null);
  const clickedAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/update");
      if (r.ok) setU(await r.json());
    } catch { /* the app is restarting or offline */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); window.removeEventListener("focus", refresh); };
  }, [refresh]);

  // While updating, follow the server until the NEW process answers, then reload. The old
  // process can still answer for a moment, and the new one starts fresh (state idle), so the
  // signal is a different boot id, or an idle server whose last update is this one.
  useEffect(() => {
    if (phase === "idle") return undefined;
    const t = setInterval(async () => {
      try {
        const s = await (await fetch("/api/update", { cache: "no-store" })).json();
        const h = await (await fetch("/api/health", { cache: "no-store" })).json();
        const newProcess = (fromBoot.current && h.boot && h.boot !== fromBoot.current)
          || (s.state === "idle" && s.lastUpdate && Date.parse(s.lastUpdate.at) >= clickedAt.current);
        if (newProcess) {
          const page = await fetch("/", { cache: "no-store" });
          if (page.ok) window.location.reload();
          return;
        }
        if (s.state === "failed") { setError(s.error); setPhase("idle"); setU(s); return; }
        if (s.state === "restarting") setPhase("restarting");
      } catch {
        setPhase("restarting"); // the old version just shut down; keep waiting for the new one
      }
    }, 1500);
    return () => clearInterval(t);
  }, [phase]);

  async function updateNow() {
    setError(null);
    clickedAt.current = Date.now() - 5000; // small allowance for clock drift between page and app
    try { fromBoot.current = (await (await fetch("/api/health", { cache: "no-store" })).json()).boot || null; }
    catch { fromBoot.current = null; }
    setPhase("updating");
    try {
      const r = await (await fetch("/api/update/apply", { method: "POST" })).json();
      if (!r.ok) { setError(r.error || "The update didn't start."); setPhase("idle"); }
    } catch {
      setPhase("restarting");
    }
  }

  const last = u?.lastUpdate;
  // A newer version always wins over the "Updated" note.
  if (phase === "idle" && !u?.available && !error && last && !seen(last.at) && u?.current?.commit === last.to) {
    return (
      <div className="updateNote">
        <span>
          Updated to version {last.version}.
          {last.savedPatch ? " A local fix from your Muse clashed with it and was saved in data/backups. Tell your Muse: check my Cover Review update." : ""}
        </span>
        <button className="ghost mini" onClick={() => { markSeen(last.at); setU({ ...u, lastUpdate: null }); }}>Got it</button>
      </div>
    );
  }

  if (phase === "updating" || phase === "restarting") {
    return (
      <div className="updateBanner busy" role="status">
        <strong>{phase === "updating" ? "Updating..." : "Almost done, restarting the app..."}</strong>
        <span>Keep this page open. It reloads by itself in about a minute.</span>
      </div>
    );
  }

  if (!u?.available && !error) return null;

  const news = u?.whatsNew || [];
  return (
    <div className="updateBanner" role="alert">
      <strong>{error ? "The update didn't finish" : "New version ready"}</strong>
      {error ? <span>{error}</span> : (
        <ul>
          {news.slice(0, 3).map((line) => <li key={line}>{line}</li>)}
          {news.length > 3 && <li>and {news.length - 3} more</li>}
        </ul>
      )}
      <button className="updateNow" onClick={updateNow}>{error ? "TRY AGAIN" : "UPDATE NOW"}</button>
    </div>
  );
}
