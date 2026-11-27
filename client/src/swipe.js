// Swipe to decide (1.34.0, Arjang, Nov 26: "exactly like Tinder"), measured frame by frame from his screen recording.
// Drag the cover right to approve, left to pass. The card follows the finger and tilts like a card held at that spot;
// a big heart (right) or X (left) shows on it, faint at first, then solid and bigger once letting go would send it.
// A flick sends it from a shorter drag. Short of that it springs back.

export const SWIPE = {
  slop: 10, // px a press moves before it counts as a swipe (or as a scroll, when it goes up or down)
  lead: 16, // px of drag before the heart or X button takes the lead
  commit: 0.25, // of the card's width: past this the heart or X turns solid and letting go sends the card
  tilt: 14, // degrees of tilt per card width of drag (about 3 degrees at the commit line, as in the recording)
  flick: 0.6, // px per ms: a let-go this fast sends the card short of the commit line
  flickMin: 24, // px: a flick has to travel at least this far first
};

/**
 * The card's tilt in degrees for a drag of dx px on a card w px wide. Held low, its top trails the finger; held high,
 * its bottom does, the way a card held at that spot swings.
 */
export function tiltFor(dx, w, heldLow) {
  if (!(w > 0)) return 0;
  return (dx / w) * SWIPE.tilt * (heldLow ? -1 : 1);
}

/** How far toward sending the card: 0 at rest, 1 at the commit line, more past it. */
export function progressFor(dx, w) {
  return w > 0 ? Math.abs(dx) / (w * SWIPE.commit) : 0;
}

/**
 * The heart or X on the card for a drag at progress p: hidden at first, then faint and a little smaller while it only
 * leans, then solid and bigger from the commit line on, growing as the drag goes on.
 */
export function stampFor(p) {
  if (!(p > 0.04)) return { opacity: 0, scale: 0.8, solid: false };
  if (p < 1) return { opacity: 0.18 + 0.47 * p, scale: 0.8 + 0.12 * p, solid: false };
  return { opacity: 1, scale: Math.min(1.5, 1 + (p - 1) * 0.35), solid: true };
}

/** Which way letting go sends the card: 1 right (approve), -1 left (pass), or 0 back to the middle. */
export function releaseFor(dx, vx, w) {
  if (!(w > 0) || !dx) return 0;
  if (Math.abs(dx) >= w * SWIPE.commit) return Math.sign(dx);
  if (Math.abs(vx) >= SWIPE.flick && Math.abs(dx) >= SWIPE.flickMin && Math.sign(vx) === Math.sign(dx)) return Math.sign(dx);
  return 0;
}

// A two-finger swipe on a trackpad (1.39.0, Quill #1384) comes as wheel events, not as a pointer.
export const WHEEL = {
  slop: 10, // px of wheel travel before a swipe picks its way: sideways moves the card, up or down scrolls the page
  end: 160, // ms with no wheel event that ends a swipe short of the line: the card springs back
  settle: 450, // ms with no wheel event before the next swipe can start, once one has sent a card or been refused
};

/**
 * What one wheel event moves, in px: x the way the fingers went (right positive), y as sent. With natural scrolling,
 * the Mac's default, a wheel's deltaX points against the fingers. Safari says which with webkitDirectionInvertedFromDevice;
 * Chrome doesn't, so natural is assumed. Lines count as 16 px and a page as the card's width.
 */
export function wheelStep(e, cardW = 400) {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cardW : 1;
  const x = (Number(e.deltaX) || 0) * unit, y = (Number(e.deltaY) || 0) * unit;
  return { x: e.webkitDirectionInvertedFromDevice === false ? x : -x, y };
}

/** Speed in px per ms over the last 100 ms of samples [{ t, x, y }], newest last. */
export function velocityOf(samples) {
  if (!samples?.length) return { x: 0, y: 0 };
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 1; i >= 0 && last.t - samples[i].t <= 100; i--) first = samples[i];
  const dt = last.t - first.t;
  return dt > 0 ? { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt } : { x: 0, y: 0 };
}

/**
 * Where a sent card goes and how fast: past the edge with room for its tilt, turning a little further the way it was
 * turning, at the flick's own speed (never slower than a quick throw), in 170 to 340 ms.
 */
export function flyFor({ dir, dx = 0, dy = 0, vx = 0, vy = 0, w, h, tilt = 0 }) {
  const x = dir * (w + h * 0.5 + 40);
  const speed = Math.max(Math.abs(vx), 1.6);
  const ms = Math.round(Math.min(340, Math.max(170, Math.abs(x - dx) / speed)));
  const y = dy + Math.max(-h / 2, Math.min(h / 2, vy * ms * 0.5));
  const turn = tilt ? Math.sign(tilt) : dir;
  return { x, y, tilt: tilt + turn * 8, ms };
}

// A light tap of the phone. Android: the Vibration API. iPhone Safari has none, but since iOS 18 a switch toggled
// through its label taps the system haptic engine; newer iOS only allows that right after a touch starts or ends, never
// in the middle of a drag, so there the tap comes as she lets go and the card goes (buzzesMidDrag says which).
export const buzzesMidDrag = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
let hapticLabel = null;
export function haptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.vibrate(12)) return;
  } catch { /* no vibration here */ }
  try {
    if (typeof document === "undefined") return;
    if (!hapticLabel || !hapticLabel.isConnected) {
      hapticLabel = document.createElement("label");
      hapticLabel.setAttribute("aria-hidden", "true");
      hapticLabel.style.cssText = "position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      hapticLabel.append(input);
      // The page never hears these clicks.
      const quiet = (e) => e.stopPropagation();
      hapticLabel.addEventListener("click", quiet);
      input.addEventListener("click", quiet);
      document.body.append(hapticLabel);
    }
    hapticLabel.click();
  } catch { /* no haptics here */ }
}
