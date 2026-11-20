// Where a Symphony clip plays from (1.13.2, Rose's #594, Claude's #597 and #618). The page asks
// GET /api/symphony/clip-url before it plays a clip. This app answers with its own clip address. A ported space answers
// with an address its own host can serve, since a space's host may not answer /api/... page requests. An address that
// comes back is kept for the visit, so a replay starts at once. One that can expire comes with expiresAt, and is asked
// for again two minutes before it does.
import { api } from "../api.js";

const MARGIN_MS = 2 * 60 * 1000;
const ready = new Map(); // "id:part" -> { url, expiresAt }
const asking = new Map(); // "id:part" -> the answer on its way
const key = (id, part) => `${id}:${Number(part) || 0}`;
const fresh = (r) => Boolean(r) && (!r.expiresAt || Date.now() < r.expiresAt - MARGIN_MS);
// expiresAt comes as milliseconds since 1970 or as an ISO date string (Quill #641). Anything else counts as none.
const msOf = (v) => {
  const ms = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
};

/** The address known for this clip right now, else null (never asked, or about to expire). */
export function clipNow(id, part = 0) {
  const r = ready.get(key(id, part));
  return fresh(r) ? r.url : null;
}

/** The address this clip plays from, or null when the server has none for it right now. */
export function clipSource(id, part = 0) {
  const k = key(id, part);
  const known = ready.get(k);
  if (fresh(known)) return Promise.resolve(known.url);
  if (!asking.has(k)) {
    asking.set(k, api(`/api/symphony/clip-url?id=${encodeURIComponent(id)}&part=${Number(part) || 0}`)
      .then((d) => {
        const url = d?.found && typeof d.url === "string" ? d.url : "";
        if (url) ready.set(k, { url, expiresAt: msOf(d.expiresAt) }); else ready.delete(k);
        return url || null;
      })
      .catch(() => null)
      .finally(() => asking.delete(k)));
  }
  return asking.get(k);
}

// iOS lets an audio element start only during a tap. Starting a silent sound on the element during the tap lets the
// same element start the clip a moment later, once its address is back. Players skip the silent sound's events.
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
export const isSilent = (a) => Boolean(a?.src && a.src === SILENT);
export function unlockAudio(a) {
  if (!a) return;
  a.src = SILENT;
  a.play().catch(() => {});
}
