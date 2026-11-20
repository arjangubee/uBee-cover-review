// Safe-zone crossing locks while she drags a text box (1.13.8, Quill #687, from the original's onQuotePointerMove and
// beginUnlockedQuoteGesture). A block catches on a safe edge only when its own edge crosses that edge during the drag,
// never by being near it. Caught, the block's edge sits on the safe edge until she pulls it more than LOCK_BREAK past,
// then it lets go. A drag that starts with an edge within LOCK_START of a safe edge starts caught on it. Everything is
// one axis at a time, in client pixels: `half` is the block's half width or height, `lo` and `hi` the safe edges.

export const LOCK_BREAK = 8;
export const LOCK_START = 1.5;

const edges = (center, half, lo, hi) => ({ inLo: center - half - lo, inHi: hi - (center + half) }); // above 0: inside

/** The lock state a drag starts with. */
export function startAxis(center, half, lo, hi) {
  const { inLo, inHi } = edges(center, half, lo, hi);
  const lock = Math.abs(inLo) <= LOCK_START ? "lo" : Math.abs(inHi) <= LOCK_START ? "hi" : null;
  return { lock, prevLo: inLo, prevHi: inHi };
}

/** One move of the drag: where the block's center goes on this axis, and the state for the next move. */
export function lockAxis(state, center, half, lo, hi) {
  const { inLo, inHi } = edges(center, half, lo, hi);
  let lock = state?.lock ?? null;
  if (lock === "lo" && Math.abs(inLo) > LOCK_BREAK) lock = null;
  if (lock === "hi" && Math.abs(inHi) > LOCK_BREAK) lock = null;
  if (!lock && state) {
    const crossed = (prev, now) => prev != null && (prev > 0) !== (now > 0) && Math.abs(now) <= LOCK_BREAK;
    if (crossed(state.prevLo, inLo)) lock = "lo";
    else if (crossed(state.prevHi, inHi)) lock = "hi";
  }
  const at = lock === "lo" ? lo + half : lock === "hi" ? hi - half : center;
  return { center: at, state: { lock, prevLo: inLo, prevHi: inHi } };
}
