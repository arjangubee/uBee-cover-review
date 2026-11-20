// Symphony's screens inside Cover Review (1.12): the data side, kept apart from the screens so it can be tested
// without a browser. The songs come from GET /api/symphony, and their clips play from this app's own address.

export const clock = (sec) => (sec == null ? "" : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`);

export const clipAddress = (id, part = 0) => `/api/symphony/clips/${encodeURIComponent(id)}${part ? `?part=${part}` : ""}`;

/** A song's popular parts, the hook first. */
export const partsOf = (s) => (s?.hook ? (s.hook.parts?.length ? s.hook.parts : [{ start: s.hook.start, end: s.hook.end }]) : []);

/** What plays a moment of the song: the clip of the part that covers it, else an app preview that does. */
export function sourceFor(s, from, to) {
  const parts = partsOf(s);
  for (let i = 0; i < parts.length; i++) {
    if (s.clips?.[i] && from >= parts[i].start - 0.5 && from < parts[i].end - 0.5 && to <= parts[i].end + 0.5) {
      return { url: clipAddress(s.id, i), at: from - parts[i].start, songStart: parts[i].start, clip: { id: s.id, part: i } };
    }
  }
  for (const k of ["apple", "spotify"]) {
    const start = s.previewStart?.[k], url = s.previewUrl?.[k];
    if (url && start != null && from >= start - 0.5 && from < start + 29) return { url, at: Math.max(0, from - start), songStart: start };
  }
  return null;
}

/** The player's line for what's playing: the hook, another part, or just the times. */
export function partLabel(s, from, to) {
  const idx = partsOf(s).findIndex((p) => Math.abs(p.start - from) < 0.6);
  if (idx === 0) return { idx, label: `Hook ${clock(from)} to ${clock(to)}` };
  if (idx > 0) return { idx, label: `Part ${idx + 1} · ${clock(from)} to ${clock(to)}` };
  return { idx: 0, label: `${clock(from)} to ${clock(to)}` };
}

export const SORTS = [["data", "Most data"], ["popular", "Most popular"], ["recent", "Recently added"]];

/** The Library's order: measured songs first, then most data, most popular, or newest added. */
export function librarySorted(songs, sort = "data") {
  const measured = (a, b) => Number(Boolean(b.hook)) - Number(Boolean(a.hook));
  const by = {
    data: (a, b) => measured(a, b) || (b.depth?.score || 0) - (a.depth?.score || 0) || (b.popularity || 0) - (a.popularity || 0),
    popular: (a, b) => measured(a, b) || (b.popularity || 0) - (a.popularity || 0),
    recent: (a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")),
  };
  return [...songs].sort(by[sort] || by.data);
}

/** The genres with the most measured songs, for the Library's chips. */
export function topGenres(songs, limit = 8) {
  const n = {};
  for (const s of songs) if (s.hook && s.genre) n[s.genre] = (n[s.genre] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([g]) => g);
}

export function searchSongs(songs, q, limit = 60) {
  const t = String(q || "").trim().toLowerCase();
  if (!t) return [];
  return songs.filter((s) => `${s.artist} ${s.title}`.toLowerCase().includes(t)).slice(0, limit);
}

/** New hot's rows: each song with its badges, in New hot's order. */
export function hotList(data) {
  const byId = new Map((data?.songs || []).map((s) => [s.id, s]));
  return (data?.hot?.rows || []).filter((r) => byId.has(r.id)).map((r) => ({ ...byId.get(r.id), badges: r.badges || [] }));
}

export const statusLine = (s) => (s.hook ? `Hook ${clock(s.hook.start)}` : s.error ? "Not found" : s.analyzed ? "No hook found" : "Measuring soon");

/** A song a cover can take: it has a hook and the hook's clip. */
export const canUse = (s) => Boolean(s?.hook && s.clips?.[0]);
export const onCover = (item, s) => Boolean(item && s && item.songFile === `symphony:${s.id}`);

/** The Symphony song id in a cover's songFile ("symphony:<id>"), else null. Its clip plays from clipSource (1.13.2). */
export function symphonyIdOf(file) {
  const m = /^symphony:([a-z0-9][a-z0-9-]{0,119})$/.exec(String(file ?? ""));
  return m ? m[1] : null;
}

/** The edit Use on this cover sends: the song whole, clip and hook included, the way undo sends a song back. */
export function coverSongEdit(s) {
  const spotify = s.links?.spotify || "";
  return {
    song: `${s.artist} - ${s.title}`, songFile: `symphony:${s.id}`, songHook: { start: s.hook.start, end: s.hook.end },
    songPreviewUrl: clipAddress(s.id), songSpotifyUrl: /^https:\/\/open\.spotify\.com\//.test(spotify) ? spotify : "", songSource: "downloaded",
  };
}

/** The replay graph's outline across the song, for the scrubber: an SVG path in a box N wide and 10 tall. */
export function replayPath(bins) {
  if (!Array.isArray(bins) || !bins.length) return null;
  return `M0,10 ${bins.map((v, i) => `L${i + 0.5},${(10 - (Math.max(0, Math.min(99, v)) / 99) * 9).toFixed(2)}`).join(" ")} L${bins.length},10Z`;
}

/** How a chart move reads: new, up or down since yesterday, or the same. */
export function moveText(move) {
  if (move === "NEW") return "New today";
  if (move && move !== "=") return `${move.startsWith("-") ? "Down" : "Up"} ${move.replace(/^[+-]/, "")} since yesterday`;
  return "Same as yesterday";
}
