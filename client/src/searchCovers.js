// Search covers (1.33.0, Arjang Nov 26): by a word or by a cover's number. A word is looked for in the photo's
// description first, then its title, quote, song, caption, why and note, in any case and in its simple forms (bike finds
// biking, sunset finds sunsets). Every word searched must be there. A number finds the cover with that number, with or
// without zeros in front (003 finds 3), and a title with that number in it.

const STATUS_ORDER = { queue: 0, approved: 1, rejected: 2 };
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "").replace(/e$/, "");
const wordsOf = (text) => String(text ?? "").toLowerCase().match(/[a-z0-9']+/g) || [];

/** How well a cover matches: 0 for no match, higher for a better one. */
export function searchScore(item, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q || !item) return 0;
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    if (Number(item.id) === n) return 3;
    return (String(item.title ?? "").match(/\d+/g) || []).some((d) => Number(d) === n) ? 2 : 0;
  }
  const lead = wordsOf(item.description), rest = wordsOf([item.title, item.quote, item.song, item.caption, item.why?.text,
    ...(Array.isArray(item.why?.tags) ? item.why.tags : []), item.note].filter(Boolean).join(" "));
  const has = (list, w) => { const s = stem(w); return list.some((x) => x.startsWith(w) || (s.length >= 3 && stem(x).startsWith(s))); };
  let score = 1;
  for (const w of wordsOf(q)) {
    if (has(lead, w)) score += 1;
    else if (!has(rest, w)) return 0;
  }
  return score;
}

/** The covers that match, best first, then the queue before approved and passed, then by number. */
export function searchCovers(items, query, limit = 60) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (STATUS_ORDER[a.item.status] ?? 3) - (STATUS_ORDER[b.item.status] ?? 3) || a.item.id - b.item.id)
    .slice(0, limit)
    .map((x) => x.item);
}
