import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import SignIn from "./SignIn.jsx";
import UpdateBanner from "./UpdateBanner.jsx";
import { useAnyBusy } from "./busy.js";
import { BUILT_VERSION } from "./release.js";
import { checkSession, useSession } from "./session.js";
// TikTok Sans (SIL Open Font License), served from this app so the cover text looks the same everywhere. Since 1.27.0 it's
// Arjang's own TikTok Sans files (room #1112): one variable font with every weight from 300 to 900 and every script.
import "./fonts/tiktok-sans.css";
import "./styles.css";

// A logo tap reloads with ?fresh=... (1.24.0): take it back off the address once the new page is here.
try {
  const here = new URL(window.location.href);
  if (here.searchParams.has("fresh")) { here.searchParams.delete("fresh"); window.history.replaceState(window.history.state, "", here.toString()); }
} catch { /* an address it can't read stays as it is */ }
// The Chats screen's styles apply only inside .dm-root (1.14).
import "./dm/dm-tw.css";
import "./dm/dm.css";

const queryClient = new QueryClient();
// Chats loads the first time she opens it, so the review screen loads as fast as before.
const ChatsApp = lazy(() => import("./dm/App.jsx").then((m) => ({ default: m.App })));
// The Beeline screen (1.16) loads the same way, the first time it's opened.
const BeelineScreen = lazy(() => import("./beeline/BeelineScreen.jsx"));

// The page (1.14): Covers, the review screen, and Chats, the DM reply simulator, with the switch between them, and
// Beeline, the room where the agents work (1.16). Once open, each stays mounted, so none loses its place when she
// switches; Beeline makes no calls while it's hidden. The version and the update notes sit above them all (1.13.10):
// the version small at the top right, the notes over the switch.
function Screens() {
  const busy = useAnyBusy();
  // 1.30.0 (room #1193 item 3): a reload comes back to the screen she was on, Chats included.
  const [screen, setScreen] = useState(() => {
    try { const s = sessionStorage.getItem("cr.screen"); return ["covers", "chats", "beeline"].includes(s) ? s : "covers"; } catch { return "covers"; }
  });
  const [chatsOpened, setChatsOpened] = useState(screen === "chats");
  const [beelineOpened, setBeelineOpened] = useState(screen === "beeline");
  const show = (id) => {
    setScreen(id);
    try { sessionStorage.setItem("cr.screen", id); } catch { /* a page that can't keep it opens on Covers */ }
    if (id === "chats") setChatsOpened(true);
    if (id === "beeline") setBeelineOpened(true);
  };
  const tab = (id, label) => (
    <button type="button" className={screen === id ? "on" : ""} aria-pressed={screen === id} onClick={() => show(id)}>{label}</button>
  );
  return (
    <>
      {versionTag}
      <div className="shellTop"><UpdateBanner inUse={busy} /></div>
      <nav className="screenSwitch" aria-label="Covers, Chats or Beeline">
        {tab("covers", "Covers")}
        {tab("chats", "Chats")}
        {tab("beeline", "Beeline")}
      </nav>
      <div hidden={screen !== "covers"}>
        <App />
      </div>
      <div hidden={screen !== "chats"} className="dm-root">
        {chatsOpened && (
          <Suspense fallback={<p className="hint" style={{ padding: 24, textAlign: "center" }}>Loading Chats…</p>}>
            <ChatsApp active={screen === "chats"} />
          </Suspense>
        )}
      </div>
      <div hidden={screen !== "beeline"}>
        {beelineOpened && (
          <Suspense fallback={<p className="hint" style={{ padding: 24, textAlign: "center" }}>Loading the Beeline…</p>}>
            <BeelineScreen active={screen === "beeline"} />
          </Suspense>
        )}
      </div>
    </>
  );
}

const versionTag = <p className="versionTag"><span className="srOnly">Version </span>{BUILT_VERSION}</p>;

// 1.15.0: the sign-in screen comes before anything else. Each account gets the screens fresh (keyed by its handle, with
// Chats' cached answers cleared), so nothing of one account ever shows in another.
function Shell() {
  const session = useSession();
  useEffect(() => { checkSession(); }, []);
  useEffect(() => { queryClient.clear(); }, [session.handle]);
  if (session.status === "checking") return versionTag;
  if (session.status !== "in") return <>{versionTag}<SignIn note={session.note} /></>;
  return <Screens key={session.handle} />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  </React.StrictMode>,
);
