// Snap guides (1.24.0, Arjang #1083, Quill #1085). While a text box is dragged, its left edge, center and right edge
// catch the canvas's vertical center line and its thirds, and its top, middle and bottom catch the horizontal ones.
// Center lines win over thirds when both are in reach. X and Y snap on their own, and past the reach the box is free.

/** The reach of a guide, in screen px (CSS px, so it holds at any pixel density and zoom). */
export const SNAP_PX = 6;

/** Every guide line, for the overlay: the vertical center and thirds, then the horizontal ones. */
export const GUIDE_IDS = ["xc", "x1", "x2", "yc", "y1", "y2"];

/** The guides of a w x h canvas, per axis: the center line first, then the two thirds. Made once per drag. */
export function guidesFor(w, h) {
  return {
    x: [{ id: "xc", at: w / 2, center: true }, { id: "x1", at: w / 3, center: false }, { id: "x2", at: (2 * w) / 3, center: false }],
    y: [{ id: "yc", at: h / 2, center: true }, { id: "y1", at: h / 3, center: false }, { id: "y2", at: (2 * h) / 3, center: false }],
  };
}

// One axis: the box's low edge, center and high edge against each line. Writes the snapped center and its guide.
function snapAxis(c, half, lines, threshold, out, key, guideKey) {
  let best = null, bestDist = Infinity, shift = 0;
  for (let i = 0; i < lines.length; i++) {
    const g = lines[i];
    for (let k = -1; k <= 1; k++) {
      const d = g.at - (c + k * half);
      const dist = d < 0 ? -d : d;
      if (dist > threshold) continue;
      if (best === null || (g.center && !best.center) || (g.center === best.center && dist < bestDist)) {
        best = g;
        bestDist = dist;
        shift = d;
      }
    }
  }
  out[key] = c + shift;
  out[guideKey] = best;
}

/**
 * snap(position, bounds, guides, threshold): the dragged box's center { x, y }, its half size { halfW, halfH }, the
 * guides from guidesFor and the reach in px. Returns { x, y, xGuide, yGuide }: the center after snapping and the guide
 * each axis caught (null when free). It writes into `out` when given, so a drag makes no new objects as it moves.
 */
export function snap(position, bounds, guides, threshold, out = {}) {
  snapAxis(position.x, bounds.halfW, guides.x, threshold, out, "x", "xGuide");
  snapAxis(position.y, bounds.halfH, guides.y, threshold, out, "y", "yGuide");
  return out;
}

// The "Snap to guides" setting, on by default, kept on this device.
const KEY = "cr.snapGuides";
export function snapGuidesOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSnapGuidesOn(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage off: snapping stays on */ }
}
