// Style rules shared by the server and its checks. No imports, so a check can load it on its own.

// Opacity runs 25 to 100, like the original's editor and updateCoverStyle (1.8.1, Quill #283). A cover saved lower
// before 1.8.1 keeps its number while that same number comes back unchanged (another field was edited); the floor
// applies the next time her opacity itself changes.
export const OPACITY_RANGE = [25, 100];

/** The opacity to store when `incoming` arrives for a text whose stored opacity is `stored` (undefined for new text). */
export function nextOpacity(incoming, stored) {
  const n = Number(incoming);
  if (stored != null && n === Number(stored)) return n;
  return Math.min(OPACITY_RANGE[1], Math.max(OPACITY_RANGE[0], n));
}
