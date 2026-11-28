// Arrivals (1.40.0, Arjang #1452 and #1454). Meta's webhook tells the Bee Hive the moment a DM or a comment is made on
// her Instagram, and the Bee Hive keeps it. This brings those into her Chats: when Chats opens, and each time its held
// read comes back (at most every 20 seconds, only while Chats shows), it asks the Bee Hive what came in since the last
// one it took. Instagram itself is never asked. It needs her Pollen code and a Bee Hive that says inbox in its hello.
import { askHive, hiveFeatures } from "./pollen.js";
import { applyArrivals, wakeReads } from "./dm.js";
import { currentSpace, runIn, store } from "./store.js";

const EVERY_MS = Number(process.env.COVER_REVIEW_ARRIVALS_MS) > 0 ? Number(process.env.COVER_REVIEW_ARRIVALS_MS) : 20_000;
const PAGES = 5;
const running = new Set();
const lastTry = new Map();

const on = () => Boolean(store.settings.pollen?.code) && hiveFeatures().inbox === true;
function state() {
  if (!store.db.dmArrivals || typeof store.db.dmArrivals !== "object") store.db.dmArrivals = {};
  return store.db.dmArrivals;
}
const iso = (t) => (typeof t === "number" ? new Date(t).toISOString() : null);

/** For the page: whether arrivals are on, when the Bee Hive was last asked, what came in and any problem. */
export function arrivalsStatus() {
  const s = state();
  // Why it's off, so the page can say so instead of a slow Refresh with no reason (room #1514).
  const off_reason = on() ? null : !store.settings.pollen?.code ? "pollen_not_connected" : "hive_without_inbox";
  return { on: on(), off_reason, checked_at: iso(s.checkedAt), last_result: s.lastResult ?? null, last_result_at: iso(s.lastResultAt),
    totals: s.totals ?? null, last_error: s.lastError ?? null, last_arrival_at: s.lastArrivalAt ?? null };
}

/** Asks the Bee Hive for every arrival since the last one taken, and brings them in. */
export async function catchUp() {
  if (!on()) return { ok: false, reason: "off" };
  const s = state();
  const total = { comments_new: 0, comments_seen: 0, replies_added: 0, replies_retimed: 0, replies_waiting: 0, dms_added: 0, dms_waiting: 0, errors: 0 };
  let changed = false;
  try {
    for (let page = 0; page < PAGES; page += 1) {
      const data = await askHive("inbox", { after: s.cursor ?? null, limit: 100, self_replies: true }); // her own replies too (room #1555)
      const events = Array.isArray(data.events) ? data.events : [];
      const counts = applyArrivals(events);
      for (const k of Object.keys(total)) total[k] += counts[k] || 0;
      if (counts.comments_new || counts.dms_added || counts.comments_seen || counts.replies_added || counts.replies_retimed) changed = true;
      if (events.length) s.lastArrivalAt = events.at(-1).at ?? s.lastArrivalAt ?? null;
      if (typeof data.cursor === "string") s.cursor = data.cursor;
      if (!data.more) break;
    }
    // An empty poll keeps the last result that brought something in, so a catch-up's counts aren't lost to the next
    // poll 20 seconds later (room #1550). totals adds up everything taken since arrivals turned on.
    const took = Object.values(total).some((n) => n > 0);
    const totals = s.totals && typeof s.totals === "object" ? s.totals : {};
    for (const k of Object.keys(total)) totals[k] = (totals[k] || 0) + total[k];
    Object.assign(s, { checkedAt: Date.now(), lastError: null, totals, ...(took || !s.lastResult ? { lastResult: total, lastResultAt: Date.now() } : {}) });
  } catch (e) {
    Object.assign(s, { checkedAt: Date.now(), lastError: String(e?.message || e).slice(0, 300) });
  }
  store.saveDb();
  if (changed) wakeReads(currentSpace());
  return { ok: !s.lastError, ...total };
}

/** Starts a catch-up for this account unless one ran in the last 20 seconds or one is running. Never waits for it. */
export function catchUpSoon() {
  const space = currentSpace();
  if (running.has(space) || Date.now() - (lastTry.get(space) || 0) < EVERY_MS || !on()) return;
  running.add(space);
  lastTry.set(space, Date.now());
  runIn(space, () => catchUp()).catch(() => {}).finally(() => running.delete(space));
}
