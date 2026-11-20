import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { downloadedSongs, songFields } from "./songs.js";
import { DATA_DIR, store } from "./store.js";

// ---------- Quotes: uBee default pack by default, creator can override ----------
export function loadQuotes() {
  const own = join(DATA_DIR, "quotes.json");
  if (existsSync(own)) {
    try { return JSON.parse(readFileSync(own, "utf8")).map((q) => (typeof q === "string" ? { text: q, source: "creator" } : q)); } catch { /* fall through */ }
  }
  return JSON.parse(readFileSync(join(DATA_DIR, "default-quotes.json"), "utf8"));
}
export function suggestQuote(item, quotes) {
  if (!quotes.length) return "";
  // Deterministic rotation by item id so re-renders stay stable.
  return quotes[item.id % quotes.length].text;
}

// ---------- Songs: Spotify library first, Instagram trending by default ----------
// The shipped seed (trending-instagram.json) is never written, so app updates never collide
// with it. Refreshes from the creator's Muse land in trending.json, which wins when present.
export function loadTrending() {
  for (const f of ["trending.json", "trending-instagram.json"]) {
    const p = join(DATA_DIR, f);
    if (!existsSync(p)) continue;
    try { return JSON.parse(readFileSync(p, "utf8")); } catch { /* try the next one */ }
  }
  return { songs: [], updated_at: null, source: "unavailable" };
}
export function saveTrending(payload) {
  const doc = { songs: payload.songs || [], updated_at: new Date().toISOString(), source: payload.source || "claude-instagram-refresh" };
  writeFileSync(join(DATA_DIR, "trending.json"), JSON.stringify(doc, null, 1));
  return doc;
}
export function suggestSong(item) {
  // 1.11: with a songs folder connected, songs come from its downloaded list first, each with its hook clip.
  const downloaded = downloadedSongs();
  if (downloaded.length) return songFields(downloaded[item.id % downloaded.length]);
  const none = { songFile: null, songHook: null };
  const lib = store.settings.spotifyLibrary || [];
  if (lib.length) {
    const s = lib[item.id % lib.length];
    return { song: `${s.artist} - ${s.title}`, songSource: "spotify", songPreviewUrl: String(s.previewUrl || ""), songSpotifyUrl: String(s.spotifyUrl || ""), ...none };
  }
  const trending = loadTrending().songs || [];
  if (trending.length) {
    const s = trending[item.id % trending.length];
    return { song: `${s.artist} - ${s.title}`, songSource: "trending", songPreviewUrl: String(s.previewUrl || ""), songSpotifyUrl: String(s.spotifyUrl || ""), ...none };
  }
  return { song: "", songSource: "none", songPreviewUrl: "", songSpotifyUrl: "", ...none };
}

// ---------- Voice profile: learned from the creator's own captions, with consent ----------
export function buildVoiceProfile(samples) {
  const clean = samples.map((s) => String(s || "").trim()).filter(Boolean);
  if (!clean.length) return null;
  const words = clean.join(" ").split(/\s+/);
  const avgWords = Math.round(words.length / clean.length);
  const emojiCount = (clean.join(" ").match(/\p{Extended_Pictographic}/gu) || []).length;
  const lower = clean.filter((s) => s === s.toLowerCase()).length;
  const freq = {};
  for (const w of words) { const k = w.toLowerCase().replace(/[^a-z0-9']/g, ""); if (k.length > 3) freq[k] = (freq[k] || 0) + 1; }
  const signatureWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
  return {
    sampleCount: clean.length,
    avgWords,
    usesEmoji: emojiCount >= clean.length / 3,
    mostlyLowercase: lower >= clean.length / 2,
    signatureWords,
    builtAt: new Date().toISOString(),
  };
}

// uBee clients post through Pollen, which refuses emoji and dash pivots in captions.
export function isUbeeClient() {
  return store.settings.workspace?.mode === "ubee_shared" || Boolean(store.settings.pollen);
}
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u203C\u2049\u2122\u2139\u2194-\u21AA\u231A-\u23FF\u24C2\u25AA-\u25FE\u3030\u303D\u3297\u3299]/gu;

// Offline caption generator. Works with zero keys and zero connectors.
// If an LLM key is configured, the user's Muse can replace this with a model call
// through generateCaptionWithLLM (kept as a documented hook, never required).
// uBee clients get the quote as written, minus any emoji: no dash tail, no sparkle.
export function generateCaption(item, profile) {
  const quote = (item.quote || "").trim();
  const base = quote || "new post, who dis";
  const ubee = isUbeeClient();
  let out = ubee ? base.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim() || "new post, who dis" : base;
  if (!profile) return out;
  if (profile.mostlyLowercase) out = out.charAt(0).toLowerCase() + out.slice(1);
  if (ubee) return out;
  if (profile.signatureWords && profile.signatureWords.length && !out.includes(profile.signatureWords[0])) {
    out = `${out} - ${profile.signatureWords.slice(0, 2).join(" ")} energy today`;
  }
  if (profile.usesEmoji) out = `${out} \u2728`;
  return out;
}

// ---------- DUMP sorting: buckets the Muse creates in Drive / locally ----------
export const BUCKETS = ["Images", "Videos", "Quotes", "Music", "Voice Profile", "Captions", "Other"];
const EXT_BUCKET = {
  ".jpg": "Images", ".jpeg": "Images", ".png": "Images", ".webp": "Images", ".heic": "Images", ".gif": "Images",
  ".mp4": "Videos", ".mov": "Videos", ".m4v": "Videos", ".webm": "Videos",
  ".mp3": "Music", ".wav": "Music", ".m4a": "Voice Profile", ".aac": "Music",
  ".txt": "Quotes", ".md": "Quotes", ".csv": "Quotes", ".json": "Quotes", ".docx": "Quotes", ".pdf": "Quotes",
};
const NAME_HINTS = [
  [/voice|memo|note to self/i, "Voice Profile"],
  [/caption/i, "Captions"],
  [/quote|hook/i, "Quotes"],
  [/song|beat|demo/i, "Music"],
];
export function classifyFile(name, mimetype = "") {
  if (mimetype.startsWith("image/")) return "Images";
  if (mimetype.startsWith("video/")) return "Videos";
  if (mimetype.startsWith("audio/")) return "Music";
  for (const [re, bucket] of NAME_HINTS) if (re.test(name)) return bucket;
  return EXT_BUCKET[extname(name).toLowerCase()] || "Other";
}
