// Talking to the app's own server. Errors carry the server's plain-words reason.
// 1.15.0: every call goes with the page's copy of the session, and a call that comes back signed out takes the page back
// to the sign-in screen.
import { authHeaders, signedOut } from "./session.js";

export async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: authHeaders(options.headers || {}) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && body.signedIn === false) signedOut();
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export function upload(path, field, file, fields = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, String(v)); // text fields go before the file
  form.append(field, file);
  return api(path, { method: "POST", body: form });
}
