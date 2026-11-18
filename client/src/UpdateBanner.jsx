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
  const fromCommit = useRef(null);

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

  // While updating, follow the server until the new version answers, then reload.
  useEffect(() => {
    if (phase === "idle") return undefined;
    const t = setInterval(async () => {
      try {
        if (phase === "updating") {
          const s = await (await fetch("/api/update")).json();
          if (s.state === "failed") { setError(s.error); setPhase("idle"); setU(s); return; }
          if (s.state === "restarting") setPhase("restarting");
          return;
        }
        const h = await (await fetch("/api/health")).json();
        if (h.commit && h.commit !== fromCommit.current) window.location.reload();
      } catch {
        if (phase === "updating") setPhase("restarting"); // the old version just shut down
      }
    }, 1500);
    return () => clearInterval(t);
  }, [phase]);

  async function updateNow() {
    setError(null);
    fromCommit.current = u?.current?.commit || null;
    setPhase("updating");
    try {
      const r = await (await fetch("/api/update/apply", { method: "POST" })).json();
      if (!r.ok) { setError(r.error || "The update didn't start."); setPhase("idle"); }
    } catch {
      setPhase("restarting");
    }
  }

  const last = u?.lastUpdate;
  if (phase === "idle" && last && !seen(last.at) && u?.current?.commit === last.to) {
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
