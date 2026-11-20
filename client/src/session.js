// Who is signed in (1.15.0). The server keeps the session in a cookie it renews on every visit. The page keeps a copy of
// the token in its own storage and sends it as Authorization: Bearer, so a host where the cookie doesn't get through
// still knows her. Neither ever runs out; Log out ends both.
import { useSyncExternalStore } from "react";

const KEY = "cr-session";
let state = { status: "checking", handle: null, owner: false, restrictSignups: false, note: "" };
const listeners = new Set();
function emit(next) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useSession = () => useSyncExternalStore(subscribe, () => state);
export const currentSession = () => state;

function storedToken() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}
function keepToken(token) {
  try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch { /* storage off: the cookie still works */ }
}
/** The headers a call to this app's server goes with: the page's copy of the session, when it has one. */
export function authHeaders(extra = {}) {
  const t = storedToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : { ...extra };
}

const signedIn = (j) => emit({ status: "in", handle: j.handle, owner: Boolean(j.owner), restrictSignups: Boolean(j.restrictSignups), note: "" });
const out = (note = "") => emit({ status: "out", handle: null, owner: false, note });

/** On load: is she signed in? The visit renews the cookie too. */
export async function checkSession() {
  try {
    const r = await fetch("/api/session", { headers: authHeaders(), cache: "no-store" });
    const j = await r.json();
    if (j.signedIn) signedIn(j);
    else { keepToken(""); out(); }
  } catch { out("This app isn't answering right now. Try again in a moment."); }
}

/** Signs a username in. Answers { needsClaim, counts } when the page has to ask whether old covers are hers first. */
export async function signIn(handle, claim) {
  let r;
  try {
    r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(claim === undefined ? { handle } : { handle, claim }) });
  } catch { throw new Error("This app isn't answering right now. Try again in a moment."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "That didn't work. Try again.");
  if (j.needsClaim) return j;
  keepToken(j.token);
  signedIn(j);
  return j;
}

/** Ends the session on the server and here. Nothing of hers is deleted. */
export async function signOut() {
  try { await fetch("/api/session", { method: "DELETE", headers: authHeaders() }); } catch { /* the page forgets it either way */ }
  keepToken("");
  out();
}

/** A call came back signed out (a session ended elsewhere): back to the sign-in screen. */
export function signedOut() {
  keepToken("");
  if (state.status === "in") out("You were signed out. Sign in again to keep going.");
}

export const setRestrictSignups = (on) => emit({ restrictSignups: Boolean(on) });
