// One switch for every cover's quote (1.13.3; Arjang's #621 and #630, Quill's #624). The setting quoteOverlay is
// true, false or unset. Set, it decides for every cover. Unset, each cover's own showQuote decides, with 1.13.0's
// carry-over default underneath, exactly as before. The switch never rewrites a cover's own choice. The server reads
// the same rule for the compose check and the caption prompt.

/** The switch's value: true, false, or null when it isn't set. */
export const overlayOf = (v) => (typeof v === "boolean" ? v : null);

/** True when the cover's quote shows: the switch when it's set, else the cover's own choice. */
export function quoteShown(item, overlay) {
  const o = overlayOf(overlay);
  return o === null ? Boolean(item?.showQuote) : o;
}
