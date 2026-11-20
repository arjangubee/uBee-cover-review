// Quotes on a cover (1.13.9; Arjang via Rose #693 and #694, Quill #695 and #696). Every post shows its quote unless she
// turned it off for that post with a tap on the T icon, which marks it (showQuoteSet). Holding the T icon is global
// hide: the 1.13.3 setting quoteOverlay set to false hides every quote at display time and never writes a post, and
// holding again unsets it. True is no longer a state of its own: unset and true both let each post decide. The server
// reads the same rule for the compose check and the caption prompt.

/** The setting's value: true, false, or null when it isn't set. */
export const overlayOf = (v) => (typeof v === "boolean" ? v : null);

/** True while global hide is on. */
export const globalHide = (overlay) => overlayOf(overlay) === false;

/** The post's own choice: on, unless she turned it off for this post. */
export const ownQuote = (item) => (item?.showQuoteSet ? Boolean(item.showQuote) : true);

/** True when the cover's quote shows: hidden on every cover under global hide, otherwise the post's own choice. */
export function quoteShown(item, overlay) {
  return globalHide(overlay) ? false : ownQuote(item);
}
