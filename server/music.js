// Save and Hide (1.15.0, Symphony #737, ruled in #742). Everyone gets the copy's shared library; a signed-in account's
// changes are its own adjustments on top, never a change to the library. They're keyed by Symphony's song id (like
// brooks--neon-moon), which stays the same across daily feeds, so an adjustment survives a refresh, and one for a song that
// left the feed does nothing. They change the picks: new covers and Shuffle never pick a hidden song and try her saved
// songs before the rest. A song is saved or hidden, never both: saving a hidden song unhides it, and hiding a saved one
// unsaves it.
import { store } from "./store.js";

const ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(String).filter((x) => ID.test(x)))] : []);

/** Her saved and hidden song ids. */
export function musicOf() {
  const m = store.settings.music || {};
  return { saved: ids(m.saved), hidden: ids(m.hidden) };
}

/** The songs a pick can take, in the list's own order: her saved songs, then the rest, with hidden songs left out. */
export function pickable(songs) {
  const { saved, hidden } = musicOf();
  const keep = songs.filter((s) => !hidden.includes(s.id));
  return { saved: keep.filter((s) => saved.includes(s.id)), rest: keep.filter((s) => !saved.includes(s.id)) };
}

export function registerMusic(app) {
  app.get("/api/music", (_req, res) => res.json(musicOf()));
  // { id, on }: on true saves (or hides) the song, false takes that back.
  app.post("/api/music/:kind", (req, res) => {
    const kind = req.params.kind === "save" ? "saved" : req.params.kind === "hide" ? "hidden" : null;
    if (!kind) return res.status(404).json({ error: "There's only save and hide here." });
    const id = String(req.body?.id ?? "");
    if (!ID.test(id)) return res.status(400).json({ error: "That isn't a Symphony song id." });
    const m = musicOf();
    const other = kind === "saved" ? "hidden" : "saved";
    m[kind] = m[kind].filter((x) => x !== id);
    if (req.body?.on === true) { m[kind].push(id); m[other] = m[other].filter((x) => x !== id); }
    store.settings.music = m;
    store.saveSettings();
    res.json(m);
  });
}
