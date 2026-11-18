// How a cover's Pollen status reads in the Approved grid and the Schedule sheet.

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
