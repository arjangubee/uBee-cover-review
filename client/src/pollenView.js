// How a cover's Pollen status reads in the Approved grid and the Schedule sheet.

export const NAMES = { instagram: "Instagram", facebook: "Facebook", threads: "Threads", x: "X", tiktok: "TikTok", pinterest: "Pinterest",
  telegram: "Telegram", discord: "Discord", tumblr: "Tumblr", substack: "Substack", youtube: "YouTube" };
// Each channel's badge (1.21.0, Big Edit item 28): its letters on the platform's own color, black and white until she
// taps it on. Letters, not the platforms' logos, so nothing here copies their artwork. Shared by both schedule sheets.
const BADGES = { instagram: ["IG", "#E1306C"], facebook: ["f", "#1877F2"], threads: ["@", "#FFFFFF", "#000"], x: ["X", "#FFFFFF", "#000"],
  tiktok: ["TT", "#FE2C55"], pinterest: ["P", "#E60023"], telegram: ["TG", "#26A5E4"], discord: ["DC", "#5865F2"], tumblr: ["t", "#36465D"],
  substack: ["S", "#FF6719"], youtube: ["YT", "#FF0000"] };
export const badgeOf = (platform) => BADGES[platform] || [String(platform || "?").slice(0, 2).toUpperCase(), "#8E8E93"];

export const LOCKED = ["waiting", "leased", "booked", "posted"]; // already with Pollen: can't be picked again

/** "2026-11-24" -> "Tue Nov 24". The day is a calendar day, so it's read in UTC and never shifts a day. */
export function formatDay(day) {
  if (!day) return "";
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
}

/** The little badge on a tile: text, a tone for color, and the longer reason for a tap or hover. */
export function badgeFor(p) {
  if (!p) return null;
  switch (p.status) {
    case "waiting":
    case "leased": return { text: "Waiting for Pollen", tone: "wait", why: "Pollen books it the next time uBee's computer is awake." };
    case "booked": {
      const day = formatDay(p.bookedDay);
      return { text: `Booked ${day}`.trim(), label: "Booked", detail: day || null, tone: "ok", why: "Pollen posts it that day." };
    }
    case "posted": return { text: "Posted", tone: "ok", why: "It's live." };
    case "failed": return { text: "Didn't book", tone: "bad", why: p.error || "Pollen couldn't book this cover." };
    case "not_sent": return { text: "Not sent", tone: "bad", why: p.error || "It didn't reach uBee. Schedule it again." };
    default: return null;
  }
}

export const selectable = (item) => !(item?.pollen && LOCKED.includes(item.pollen.status));
