// Downloaded songs (1.11, Arjang #477 and #480, Quill #482, Symphony #481 and #491). A folder on this computer holds
// Symphony's manifest.json and its hook clips (hooks/<id>.m4a). The folder is empty by default and set by the space's
// Muse, so nothing changes until one is connected. With one, new covers and Shuffle pick from its songs, a typed song
// on the list gets its clip, and the song row plays the clip from this app's own address. The manifest is read again
// whenever it changes, so a new export shows up without a restart.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, sep } from "node:path";
import { store } from "./store.js";

export const CLIP_TYPES = { ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".webm": "audio/webm" };
export const MISSING_CLIP = "This cover's song clip isn't in the songs folder. Shuffle the song or reconnect the folder.";
const MANIFEST = "manifest.json";

class SongsError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const songsFolder = () => (typeof store.settings.songsFolder === "string" && store.settings.songsFolder) || null;

/** A clip's path inside the folder, cleaned: relative, forward slashes, no "." or ".." parts, an audio type. Else null. */
export function cleanClipPath(file) {
  const f = String(file ?? "").trim().replace(/\\/g, "/");
  if (!f || f.length > 300 || f.startsWith("/") || /^[a-z]:/i.test(f) || f.includes("\0")) return null;
  const parts = f.split("/");
  if (parts.some((p) => !p || p.startsWith("."))) return null;
  return CLIP_TYPES[extname(f).toLowerCase()] ? parts.join("/") : null;
}

/** The clip's full path on this computer, when the folder is connected and the file is really in it. Else null. */
export function clipPath(file, folder = songsFolder()) {
  const rel = cleanClipPath(file);
  if (!rel || !folder) return null;
  try {
    const root = realpathSync(folder);
    const abs = realpathSync(join(root, rel));
    return abs.startsWith(root + sep) && statSync(abs).isFile() ? abs : null;
  } catch { return null; }
}

export const clipUrl = (file) => `/api/songs/clips/${String(file).split("/").map(encodeURIComponent).join("/")}`;
export const clipType = (file) => CLIP_TYPES[extname(String(file)).toLowerCase()] || "application/octet-stream";

/** A hook as { start, end } in song seconds, or null when it isn't one. */
export function cleanHook(hook) {
  const start = Number(hook?.start), end = Number(hook?.end);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start ? { start, end } : null;
}

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// One manifest entry, in Symphony's camelCase or in snake_case. Left out: no artist or title, hook times that don't
// make sense, or a hook clip that isn't an audio file inside the folder.
function readSong(raw, folder) {
  if (!raw || typeof raw !== "object") return null;
  const pick = (...keys) => keys.map((k) => raw[k]).find((v) => v != null);
  const artist = String(pick("artist") ?? "").trim(), title = String(pick("title") ?? "").trim();
  const hook = cleanHook({ start: num(pick("hookStart", "hook_start")), end: num(pick("hookEnd", "hook_end")) });
  const hookFile = cleanClipPath(pick("hookFile", "hook_file"));
  if (!artist || !title || !hook || !hookFile || !clipPath(hookFile, folder)) return null;
  const songFile = cleanClipPath(pick("songFile", "song_file"));
  const spotifyUrl = String(pick("spotifyUrl", "spotify_url") ?? "");
  const starts = pick("previewStart", "preview_start");
  const previewStart = starts && typeof starts === "object"
    ? Object.fromEntries(Object.entries(starts).filter(([, v]) => num(v) != null).map(([k, v]) => [k, num(v)])) : null;
  const replayPeak = num(pick("replayPeak", "replay_peak"));
  return {
    id: String(pick("id") ?? "").trim() || hookFile, artist, title, hookStart: hook.start, hookEnd: hook.end, hookFile, clipUrl: clipUrl(hookFile),
    spotifyUrl: /^https:\/\/open\.spotify\.com\//.test(spotifyUrl) ? spotifyUrl : "",
    ...(songFile && clipPath(songFile, folder) ? { songFile } : {}),
    ...(previewStart && Object.keys(previewStart).length ? { previewStart } : {}),
    ...(replayPeak != null ? { replayPeak } : {}),
  };
}

let cache = { key: null, songs: [] };
function readManifest(folder) {
  const file = join(folder, MANIFEST);
  const st = statSync(file);
  const key = `${folder}|${st.mtimeMs}|${st.size}`;
  if (cache.key === key) return cache.songs;
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(doc) ? doc : Array.isArray(doc?.songs) ? doc.songs : null;
  if (!list) throw new SongsError("That folder's manifest.json has no songs list. It has to be { songs: [...] }.");
  const seen = new Set();
  const songs = [];
  for (const raw of list) {
    const s = readSong(raw, folder);
    if (s && !seen.has(s.id)) { seen.add(s.id); songs.push(s); }
  }
  cache = { key, songs };
  return songs;
}

/** The downloaded songs, or none when no folder is connected or its manifest can't be read right now. */
export function downloadedSongs() {
  const folder = songsFolder();
  if (!folder) return [];
  try { return readManifest(folder); } catch { return []; }
}

export function songsStatus() {
  const folder = songsFolder();
  if (!folder) return { connected: false, folder: null, songs: [] };
  try { return { connected: true, folder, songs: readManifest(folder) }; } catch {
    return { connected: true, folder, songs: [], error: "The songs folder's manifest.json can't be read right now." };
  }
}

/** Connects the folder (a full path holding manifest.json), or disconnects it with null. Covers keep their songs. */
export function connectSongsFolder(folder) {
  if (folder == null || String(folder).trim() === "") {
    delete store.settings.songsFolder;
    store.saveSettings();
    return { ok: true, ...songsStatus() };
  }
  const f = String(folder).trim();
  if (!isAbsolute(f)) throw new SongsError("Send the songs folder as a full path, like /Users/you/Music/Symphony.");
  let st = null;
  try { st = statSync(f); } catch { /* not there */ }
  if (!st || !st.isDirectory()) throw new SongsError("That folder isn't there, or it's not a folder.");
  if (!existsSync(join(f, MANIFEST))) throw new SongsError("That folder has no manifest.json yet. Symphony writes it after its first update.");
  let songs;
  try { songs = readManifest(f); } catch (e) { throw new SongsError(e instanceof SongsError ? e.message : "That folder's manifest.json can't be read."); }
  store.settings.songsFolder = f;
  store.saveSettings();
  return { ok: true, connected: true, folder: f, songs };
}

const nameOf = (s) => `${s.artist} - ${s.title}`;
const same = (a, b) => String(a ?? "").trim().replace(/\s+/g, " ").toLowerCase() === String(b ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The downloaded song with this name ("Artist - Title", any case), or null. */
export function findDownloaded(song) {
  if (!String(song ?? "").trim()) return null;
  return downloadedSongs().find((s) => same(nameOf(s), song)) || null;
}

/** The song fields a cover gets from a downloaded song. */
export function songFields(s) {
  return { song: nameOf(s), songSource: "downloaded", songPreviewUrl: s.clipUrl, songSpotifyUrl: s.spotifyUrl || "",
    songFile: s.hookFile, songHook: { start: s.hookStart, end: s.hookEnd } };
}

/** After a song is typed or set by her Muse: a song on the list gets its clip, any other song drops it. */
export function matchSongClip(item) {
  const hit = findDownloaded(item.song);
  if (hit) {
    const { song: _name, ...fields } = songFields(hit); // her words for the name stay as she typed them
    if (!fields.songSpotifyUrl) delete fields.songSpotifyUrl; // a link sent with the song stays when the list has none
    Object.assign(item, fields);
    return;
  }
  item.songFile = null;
  item.songHook = null;
  if (item.songSource === "downloaded") item.songSource = "";
}

/** The name and hook Pollen gets with a cover's clip: from the manifest when the song is still on it. */
export function songMeta(item) {
  const hit = downloadedSongs().find((s) => s.hookFile === item.songFile);
  const [artist, ...rest] = String(item.song || "").split(" - ");
  return { artist: hit?.artist || artist.trim(), title: hit?.title || rest.join(" - ").trim(),
    hook_start: item.songHook?.start ?? hit?.hookStart ?? null, hook_end: item.songHook?.end ?? hit?.hookEnd ?? null };
}

export function registerSongs(app) {
  app.get("/api/songs", (_req, res) => res.json(songsStatus()));
  app.post("/api/songs/folder", (req, res) => {
    try { res.json(connectSongsFolder(req.body?.folder)); } catch (e) { res.status(e.status || 400).json({ ok: false, error: e.message }); }
  });
  // Only an audio clip inside the connected folder, never anything else on this computer.
  app.get("/api/songs/clips/*", (req, res) => {
    const abs = clipPath(req.params[0]);
    if (!abs) return res.status(404).json({ error: "clip not found" });
    res.set("Content-Type", clipType(abs));
    res.sendFile(abs, { dotfiles: "allow", headers: { "Cache-Control": "private, max-age=300" } }, (e) => {
      if (e && !res.headersSent) res.status(404).json({ error: "clip not found" });
    });
  });
}
