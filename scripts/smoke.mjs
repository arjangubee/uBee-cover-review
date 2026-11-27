// Smoke test: boots the API on a test port and walks the photos-only flow.
// Run with the server stopped: node scripts/smoke.mjs
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captionProblems } from "../server/captionRules.js";
import { nextOpacity } from "../server/styleRules.js";
import { canDraft, captionPrompt, draftProblems, needsDescription } from "../server/captionDrafts.js";
import { bakedCta, cleanCtas, ctaFor, plainCaption, postedCaption } from "../server/captionCtas.js";
import * as sharedCall from "../client/src/captionCall.js";
import { bangRuleOf, capEndings, storyCapture, voiceVersion } from "../server/dmRules.js";
import { askCss, fmt, pokeReach, why } from "../client/src/beeline/beelineText.js";
import { callsFolded, cleanKey, decide, fileUrl, forgetDevice, looksLikeKey, saveDevice, savedDevice, setCallsFolded } from "../client/src/beeline/beelineApi.js";

// Smoke runs in a throwaway data folder, so it never touches a creator's real photos,
// decisions, workspace or settings.
const REPO_DATA = new URL("../data/", import.meta.url).pathname;
const DATA = mkdtempSync(join(tmpdir(), "cr-smoke-"));
for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(DATA, f));
const repoDataBefore = execFileSync("git", ["status", "--porcelain", "--", "data"], { cwd: join(REPO_DATA, "..") }).toString();
const seedBefore = readFileSync(join(DATA, "trending-instagram.json"), "utf8");

// A songs folder in Symphony's shape (1.11): manifest.json at the top, hook clips under hooks/. Three usable songs (one
// written in snake_case), plus entries the app must leave out: a path outside the folder, hook times that don't make
// sense, a clip that isn't there, and a file that isn't audio.
const SONGS = mkdtempSync(join(tmpdir(), "cr-songs-"));
const NO_MANIFEST = mkdtempSync(join(tmpdir(), "cr-nosongs-"));
mkdirSync(join(SONGS, "hooks"));
const CLIP_A = Buffer.from("fake-aac-clip-for-song-a-0123456789"), CLIP_B = Buffer.from("fake-mp3-clip-for-song-b"), CLIP_C = Buffer.from("fake-clip-c");
writeFileSync(join(SONGS, "hooks", "artist-a--song-a.m4a"), CLIP_A);
writeFileSync(join(SONGS, "hooks", "artist-b--song-b.mp3"), CLIP_B);
writeFileSync(join(SONGS, "hooks", "artist-c--song-c.m4a"), CLIP_C);
writeFileSync(join(SONGS, "hooks", "notes.txt"), "not audio");
writeFileSync(join(SONGS, "manifest.json"), JSON.stringify({ updatedAt: "2026-11-20T00:00:00Z", songs: [
  { id: "artist-a--song-a", artist: "Artist A", title: "Song A", hookStart: 44.2, hookEnd: 59.1, previewStart: { apple: 30, deezer: 41.5, spotify: 30 }, replayPeak: 47, hookFile: "hooks/artist-a--song-a.m4a", spotifyUrl: "https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa", isrc: "XX0000000001", hookLabel: "0:44 to 0:59" },
  { id: "artist-b--song-b", artist: "Artist B", title: "Song B", hookStart: 12, hookEnd: 27, hookFile: "hooks/artist-b--song-b.mp3" },
  { id: "artist-c--song-c", artist: "Artist C", title: "Song C", hook_start: 5, hook_end: 20, hook_file: "hooks/artist-c--song-c.m4a" },
  { id: "outside", artist: "Artist D", title: "Song D", hookStart: 1, hookEnd: 9, hookFile: "../outside.m4a" },
  { id: "backwards", artist: "Artist E", title: "Song E", hookStart: 30, hookEnd: 20, hookFile: "hooks/artist-a--song-a.m4a" },
  { id: "missing", artist: "Artist F", title: "Song F", hookStart: 1, hookEnd: 9, hookFile: "hooks/not-there.m4a" },
  { id: "text", artist: "Artist G", title: "Song G", hookStart: 1, hookEnd: 9, hookFile: "hooks/notes.txt" },
] }));
writeFileSync(join(SONGS, "..", "outside.m4a"), "outside the folder");

// A fake Bee Hive: the same four actions the real one answers, plus the signed upload URL and a
// remote photo for the same-origin image route. It records everything so checks can count calls.
const TINY_JPEG = Buffer.from("/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xAClAAADAQEBAQAAAAAAAAAAAAAHBQQGAwIAAQADAQEBAAAAAAAAAAAAAAAHBQQDBgIQAAADBgAKBAwHAQAAAAAAAAIBAwAREgUTBDRBgYKyMjFCISKxwkMURQaTwcMzgweEVFEV0VLSFlXTo2IRAAIBAgMCCAwHAQEAAAAAAAECAxEEBRIAMSETs0FCMgYzInSysXKChIFxNTRRIxQHwbQ2Q3NiYf/AABEIADIAKAMBIgACEQADEQD/2gAMAwEAAhEDEQA/ABcI7xW5USQ4whjN8BBAEgkYhCGNwQhL6iMixNqLeZz5G6CEKrhkA1SFBbmCmYT544TTgdvPc/htZdbiAP7khBWGp3QYUHmESwERENQITLegxFzflI3NogKJFYFZU3LcVu6RHHTr1KcW2Onu+sdxhZRjOKPiMlZYVZQxyJIeF4NZVViwzEdwdE91QadLTy/wuF7leFfMYHmaNmHOSQAIlQ2VmoCKNXduU6ynjJMppdCtg3qsZgIYk+REihUg4hEkEiERuLi89jJ5YrfCEoG3PjDGPgmQQhARmYhCHyhIvqZkTPpwIwHKU0zBbKpqKjIhieVvUVAJM1BCI9UnGKInkW0m4y0dQpsioYLpZRRFSBMTiuSSWENWmIJFrBeYYSiMuISZxY39xa4TGkJMaLWiIzKihrkqXyKQgXeZD3x7+XU8MXB3qlXYMOcNzAmGuXMO9Xm9H2cmm6EwnyMKAVHOAapctsYKZvFUqQmCD/qJz+G1u/3aefN2/lLD8WqAJMpaVnSct67ucRx0u8VacW2Olu+sdxhZdAl/CXHlLn9DQrilzIXLSLHR2AzEfcA/sGa4TutyUzD/AKOk97gti1w8hgFy0rNJIwSpDuxLK5FvLVwd7FiG37xrGX2EqZuiTUpa5Zehpr7CVM3RJqUtcsvQ057JPM/TTfHvn/WJuMGpZl2Wd1WgQ3snna+ZdlndVoEN7J526Ky+ST0vHOoYu3Ht8XTdPULL0t0bmnqFl6W6N5O0+/SG47eX/R/GOvru0XVXGIIHkbnG8JbpFjNn1v4vzVVUIQ2zzN7iqoliM8ajemLssw1LP0BNwN7iE1vEMqxmiNtDc0D6MNdh11UWF/hXBd78ZcTcJn35fuQ9CmWnTO2vJoHT+TzCXd37yhSqVIOdMT4YH6gxOc8trJLOyuFo6YInQv5gltf9TJjH7x/BnxXoGwUk7f2fWYs9WLKLEerdreyl1kk4aoQgJ3bmRBQMrHYPrt1hh8Sz4pHA1QrZt46W6Itygjb/AOa928gmiiQRBt3kb3HURLGZY1Go/bs3+W/1R/sYpyzA0s/TEzJs5LONXcVfcxG0fX3aFGL4zc2uKX8CJCVhuriJSwYsQkrKK0cCtBvoBoMMXZZhqWfoCYRMXZZhqWfoCYMYr2XoSeQaMP5h/P8AV3wibjLXWW94/gz4r0DYKSdv7PrNvfeP4M+K9A2Cknb+z6zHrqT/AA2w9Y/ey6zwn45D6fENovSzA0s/TEzJlsswNLP0xMybKbtZPOby6A3WD45ivh93x76//9k=", "base64");
const CH_IG = "11111111-1111-4111-8111-111111111111";
const CH_SUBSTACK = "22222222-2222-4222-8222-222222222222";
const hive = { code: "smoke-pollen-code-0123456789-abcdefghijklmnop", revoked: false, dropSubmitOnce: false,
  uploads: {}, uploadTypes: {}, requests: [], submits: 0, songs: false, postNow: false, scheduleAt: false };
const CH_YT = "33333333-3333-4333-8333-333333333333";
const hiveServer = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const url = new URL(req.url, "http://hive");
  if (req.method === "GET" && url.pathname === "/photo.jpg") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(TINY_JPEG); }
  if (req.method === "PUT" && url.pathname.startsWith("/upload/")) {
    if (url.searchParams.get("token") !== "t0k") return send(400, { error: "no token" });
    hive.uploads[decodeURIComponent(url.pathname.slice(8))] = raw;
    hive.uploadTypes[decodeURIComponent(url.pathname.slice(8))] = req.headers["content-type"];
    return send(200, { Key: url.pathname.slice(8) });
  }
  if (hive.revoked || req.headers.authorization !== `Bearer ${hive.code}`) return send(401, { error: "That Pollen code doesn't work anymore. Ask uBee for a new one." });
  const body = JSON.parse(raw.toString() || "{}");
  if (body.action === "hello") {
    const features = { ...(hive.songs ? { songs: true } : {}), ...(hive.postNow ? { post_now: true } : {}),
      ...(hive.scheduleAt ? { schedule_at: true, reels: true, slides: true } : {}) };
    // 1.38.0: a Bee Hive that takes times also says which channels take reels, and which can run a trial reel.
    const reels = hive.scheduleAt;
    return send(200, { ok: true, creator: { id: "cr-1", display_name: "Test Creator" }, ...(Object.keys(features).length ? { features } : {}), channels: [
      { id: CH_IG, platform: "instagram", handle: "@smoke_ig", photo: true, ready: true, default_on: true, ...(reels ? { video: true, trial: true } : {}) },
      { id: CH_SUBSTACK, platform: "substack", handle: "smoke", photo: true, ready: true, default_on: false, ...(reels ? { video: false } : {}) },
      ...(reels ? [{ id: CH_YT, platform: "youtube", handle: "smoke-yt", photo: false, video: true, ready: true, default_on: true }] : [])] });
  }
  if (body.action === "upload_url") {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(body.client_key || "")) return send(400, { error: "bad client_key" });
    if (body.kind === "slide") {
      if (!hive.scheduleAt || !Number.isInteger(body.index)) return send(400, { error: "unknown kind" });
      return send(200, { ok: true, path: `cr-1/${body.client_key}-slide-${body.index}.jpg`, signed_url: `${hiveBase}/upload/cr-1/${body.client_key}-slide-${body.index}.jpg?token=t0k`, token: "t0k" });
    }
    if (body.kind === "song") {
      if (!hive.songs) return send(400, { error: "unknown kind" });
      const ext = { "audio/mp4": "m4a", "audio/mpeg": "mp3" }[body.content_type] || "bin";
      return send(200, { ok: true, path: `cr-1/${body.client_key}-song.${ext}`, signed_url: `${hiveBase}/upload/cr-1/${body.client_key}-song.${ext}?token=t0k`, token: "t0k" });
    }
    return send(200, { ok: true, path: `cr-1/${body.client_key}.jpg`, signed_url: `${hiveBase}/upload/cr-1/${body.client_key}.jpg?token=t0k`, token: "t0k" });
  }
  if (body.action === "submit") {
    hive.submits += 1;
    if (!hive.uploads[body.image_path]) return send(400, { error: "the image must be uploaded first" });
    if (body.song && (!hive.songs || !hive.uploads[body.song.path])) return send(400, { error: "the song must be uploaded first" });
    let r = hive.requests.find((x) => x.client_key === body.client_key);
    if (!r) {
      r = { id: `${String(hive.requests.length + 1).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, client_key: body.client_key, caption: body.caption,
        channel_ids: body.channel_ids, width: body.width, height: body.height, has_slides: body.has_slides, status: "waiting", booked_day: null, posts: [], error: null,
        ...(body.song ? { song: body.song } : {}), ...(body.post_now ? { post_now: true } : {}),
        ...(body.format ? { format: body.format, scheduled_at: body.scheduled_at, trial: body.trial ?? null, slides: body.slides || [] } : {}) };
      hive.requests.push(r);
    }
    if (hive.dropSubmitOnce) { hive.dropSubmitOnce = false; return req.socket.destroy(); }
    return send(200, { ok: true, request: { id: r.id, status: r.status } });
  }
  if (body.action === "status") {
    return send(200, { ok: true, requests: hive.requests.filter((r) => (body.ids || []).includes(r.id))
      .map(({ id, status, booked_day, posts, error }) => ({ id, status, booked_day, posts, error, updated_at: new Date().toISOString() })) });
  }
  return send(400, { error: "unknown action" });
});
await new Promise((r) => hiveServer.listen(0, "127.0.0.1", r));
const hiveBase = `http://127.0.0.1:${hiveServer.address().port}`;

// A stand-in Symphony feed (1.12): the real feed's answer for one read code, clip links on its own origin that serve
// audio, and a count of reads so checks can see when the app reads the feed again. Besides two playable songs it lists
// entries the app must leave out or can't play: a song with no hook, one whose clip points elsewhere, a bad id and a
// song with no title.
const SYM_CODE = "smoke-symphony-read-code-0123456789-abcdefgh";
const SYM_CLIP_1 = Buffer.from("fake-symphony-hook-clip-one"), SYM_CLIP_2 = Buffer.from("fake-symphony-part-two"), SYM_CLIP_3 = Buffer.from("fake-symphony-hook-two");
const sym = { reads: 0, revoked: false, expiresIn: 24 * 3600 * 1000 };
const symSongs = (link) => [
  { id: "sym-a--song-one", artist: "Sym Artist A", title: "Song One", artwork: "https://is1-ssl.mzstatic.com/a.jpg", genre: "Pop", durationSec: 180,
    addedAt: "2026-11-18T10:00:00Z", analyzed: true, popularity: 88, watch: "https://www.youtube.com/watch?v=aaaaaaaaaaa&t=44s", isrc: "XX0000000101",
    links: { apple: "https://music.apple.com/us/album/a?i=1", spotify: "https://open.spotify.com/track/symaaaaaaaaaaaaaaaaaaa", youtube: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
    today: { shazam: { rank: 3, move: "NEW" } }, hookStart: 44.4, hookEnd: 59.4, hookLabel: "0:44 to 0:59", level: "high", agree: ["apple", "replay"],
    parts: [{ start: 44.4, end: 59.4 }, { start: 90, end: 105 }], lines: ["first hook line", "second hook line"],
    previewStart: { apple: 44, deezer: 41.5, spotify: null }, previewUrl: { apple: "https://audio-ssl.itunes.apple.com/a.m4a", spotify: "javascript:alert(1)" },
    replayPeak: 47, replay: [0, 10, 99, 120, -5], depth: { score: 6, max: 8, signals: { applePreview: true, replayGraph: true, "bad key!": true } },
    chorusCount: 3, views: 1200000, clipUrls: [link("hooks/sym-a--song-one.m4a"), link("hooks/sym-a--song-one-2.m4a")] },
  { id: "sym-b--song-two", artist: "Sym Artist B", title: "Song Two", artwork: "javascript:alert(1)", genre: "Rap", durationSec: 150,
    addedAt: "2026-11-19T10:00:00Z", analyzed: true, popularity: 40, hookStart: 12, hookEnd: 27, level: "medium",
    clipUrls: [link("hooks/sym-b--song-two.m4a")] },
  { id: "sym-c--no-hook", artist: "Sym Artist C", title: "No Hook Yet", analyzed: false, popularity: 99 },
  { id: "sym-d--elsewhere", artist: "Sym Artist D", title: "Elsewhere", hookStart: 5, hookEnd: 20, clipUrls: ["https://evil.example/x.m4a"] },
  { id: "Bad Id!", artist: "Sym Artist E", title: "Bad", hookStart: 5, hookEnd: 20 },
  { id: "sym-f--no-title", artist: "Sym Artist F", title: "", hookStart: 5, hookEnd: 20 },
];
const symServer = http.createServer((req, res) => {
  const url = new URL(req.url, "http://sym");
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (url.pathname.startsWith("/storage/")) {
    const bytes = { "/storage/hooks/sym-a--song-one.m4a": SYM_CLIP_1, "/storage/hooks/sym-a--song-one-2.m4a": SYM_CLIP_2, "/storage/hooks/sym-b--song-two.m4a": SYM_CLIP_3 }[url.pathname];
    if (!bytes || url.searchParams.get("token") !== "signed") return send(400, { error: "bad link" });
    res.writeHead(200, { "Content-Type": "audio/mp4" });
    return res.end(bytes);
  }
  if (url.pathname !== "/functions/v1/symphony/feed") return send(404, { error: "not found" });
  if (sym.revoked || req.headers.authorization !== `Bearer ${SYM_CODE}`) return send(401, { error: "That code doesn't work." });
  sym.reads += 1;
  return send(200, { version: 1, updatedAt: "2026-11-20T05:06:34.622Z", day: "2026-11-19", linksExpireAt: new Date(Date.now() + sym.expiresIn).toISOString(),
    hot: { date: "2026-11-19", rows: [{ id: "sym-b--song-two", badges: [{ platform: "shazam", text: "New on Shazam" }, { platform: "x" }] }, { id: "ghost", badges: [] }] },
    songs: symSongs((p) => `${symBase}/storage/${p}?token=signed`) });
});
await new Promise((r) => symServer.listen(0, "127.0.0.1", r));
const symBase = `http://127.0.0.1:${symServer.address().port}`;

const PORT = 4199;
const base = `http://localhost:${PORT}`;

// 1.15.0: every call to a copy of the app goes out signed in as that copy's owner, the way the page and her Muse do it
// (POST /api/session, then the token as Authorization: Bearer). scripts/accounts-test.mjs checks the accounts themselves.
const realFetch = globalThis.fetch;
const owners = new Map(); // a copy's address -> the handle its owner signs in with
const tokens = new Map();
async function ownerToken(origin) {
  if (!tokens.has(origin)) {
    const r = await realFetch(`${origin}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: owners.get(origin), claim: true }) });
    const j = await r.json();
    if (!j.token || !j.owner) throw new Error(`smoke couldn't sign in as the owner on ${origin}: ${JSON.stringify(j)}`);
    tokens.set(origin, j.token);
  }
  return tokens.get(origin);
}
globalThis.fetch = async (url, opts = {}) => {
  const origin = new URL(String(url)).origin;
  if (!owners.has(origin) || new URL(String(url)).pathname === "/api/session") return realFetch(url, opts);
  const headers = new Headers(opts.headers || {});
  if (!headers.has("authorization")) headers.set("Authorization", `Bearer ${await ownerToken(origin)}`);
  return realFetch(url, { ...opts, headers });
};
owners.set(new URL(base).origin, "smoke_owner");
const server = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(PORT), COVER_REVIEW_NO_UPDATE_LOOP: "1", COVER_REVIEW_DATA_DIR: DATA,
  COVER_REVIEW_BEE_HIVE_URL: `${hiveBase}/api/public/cover-review`, COVER_REVIEW_POLLEN_SYNC_MS: "3600000", COVER_REVIEW_DM_SYNC_STUCK_MS: "2500",
  COVER_REVIEW_SYMPHONY_URL: `${symBase}/functions/v1/symphony`,
  COVER_REVIEW_PHOTO_ORIGINS: hiveBase }, stdio: "pipe" }); // 1.40.0: the stand-in "remote" photo lives on this computer // 1.40.0: the stand-in "remote" photo lives on this computer
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
async function postJson(path, body) {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error(`${path} answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function newItem(name) {
  const form = new FormData();
  form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), name);
  return (await (await fetch(`${base}/api/items/upload`, { method: "POST", body: form })).json()).created[0];
}
// Another copy on its own server and its own data folder, for checks that need data an older version saved, or quotes
// still locked (1.13.9). fill(dir) writes its data before the server starts.
async function withCopy(port, fill, fn) {
  const dir = mkdtempSync(join(tmpdir(), "cr-copy-"));
  for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(dir, f));
  fill(dir);
  const at = `http://localhost:${port}`;
  // Its owner: the handle in its Instagram connector, if the data it starts with has one, else the first sign-in.
  let connector = null;
  try { connector = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).connectors?.instagram?.handle || null; } catch { /* none */ }
  owners.set(new URL(at).origin, String(connector || "smoke_owner").replace(/^@+/, "").toLowerCase());
  tokens.delete(new URL(at).origin);
  const child = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(port), COVER_REVIEW_NO_UPDATE_LOOP: "1", COVER_REVIEW_DATA_DIR: dir,
    COVER_REVIEW_POLLEN_SYNC_MS: "3600000" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${at}/api/health`)).ok) break; } catch {} await wait(200); }
    await fn({ dir,
      get: async (p) => (await fetch(`${at}${p}`)).json(),
      post: async (p, body) => (await fetch(`${at}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })).json() });
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  // Wait for the server to answer (up to 10 seconds) instead of guessing how long it takes to start.
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await wait(200);
  }
  await check("setup status responds, photos are the only requirement", async () => {
    const s = await (await fetch(`${base}/api/setup/status`)).json();
    assert(s.requirements.photos.required === true, "photos should be required");
    assert(s.requirements.spotify.required === false, "spotify must be optional");
    assert(s.requirements.google_drive.required === false, "drive must be optional");
  });
  await check("default quotes are the uBee pack with real stock", async () => {
    const q = await (await fetch(`${base}/api/quotes`)).json();
    assert(q.quotes.length > 300, `expected 300+ default quotes, got ${q.quotes.length}`);
  });
  await check("connectors registry lists drive, spotify, instagram, pollen, the songs folder and Symphony with Muse steps", async () => {
    const c = await (await fetch(`${base}/api/connectors`)).json();
    const ids = c.connectors.map((x) => x.id).sort().join(",");
    assert(ids === "google_drive,instagram,pollen,songs,spotify,symphony", `unexpected connectors: ${ids}`);
    assert(c.connectors.find((x) => x.id === "songs").claudeSteps.some((t) => t.includes("/api/songs/folder")), "the songs folder steps say how to connect it");
    assert(c.connectors.find((x) => x.id === "symphony").claudeSteps.some((t) => t.includes("/api/connectors/symphony")), "the Symphony steps say how to connect it");
    assert(c.connectors.every((x) => x.claudeSteps.length >= 3), "each connector needs Muse steps");
  });
  await check("drive plan has DUMP and every bucket", async () => {
    const p = await (await fetch(`${base}/api/drive/plan`)).json();
    for (const f of ["DUMP", "Images", "Videos", "Quotes", "Music", "Voice Profile", "Captions", "Approved", "Rejected"]) assert(p.folders.includes(f), `missing folder ${f}`);
  });
  await check("caption consent gates instagram voice samples", async () => {
    const r = await fetch(`${base}/api/voice/samples`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "instagram", samples: ["test caption one two three"] }) });
    assert(r.status === 403, `expected 403 without consent, got ${r.status}`);
    await fetch(`${base}/api/connectors/instagram/consent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captionConsent: true, handle: "@smoketest" }) });
    const ok = await fetch(`${base}/api/voice/samples`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "instagram", samples: ["just a girl and her camera, posting for fun again", "soft launch of the new era, we move"] }) });
    assert(ok.ok, "samples should pass after consent");
    const v = await (await ok.json());
    assert(v.voiceProfile && v.voiceProfile.sampleCount >= 2, "voice profile should build");
  });
  await check("upload, approve with note and rating, caption present", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
    const form = new FormData();
    form.append("photos", new Blob([png], { type: "image/png" }), "smoke-test-photo.png");
    const up = await (await fetch(`${base}/api/items/upload`, { method: "POST", body: form })).json();
    assert(up.created.length === 1, "one item should be created");
    const item = up.created[0];
    assert(item.quote.length > 0, "item should carry a default quote");
    assert(typeof item.caption === "string", "item should carry a caption draft");
    const decided = await (await fetch(`${base}/api/items/${item.id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "approved", rating: 9, note: "thicker thighs on the edit please" }) })).json();
    assert(decided.item.status === "approved" && decided.item.note.includes("thicker thighs"), "decision and note should save");
    const approved = await (await fetch(`${base}/api/items?status=approved`)).json();
    assert(approved.items.some((i) => i.id === item.id), "approved list should contain the item");
  });
  await check("full editor: style, per-part ratings, verify beacons, remix, slides, story framing", async () => {
    const form = new FormData();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
    form.append("photos", new Blob([png], { type: "image/png" }), "full-test.png");
    const up = await (await fetch(`${base}/api/items/upload`, { method: "POST", body: form })).json();
    const item = up.created[0];
    const styled = await (await fetch(`${base}/api/items/${item.id}/style`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textColor: "#FB0909", textFont: "serif", fontSize: 72, opacity: 90, horizontalPosition: 30, verticalPosition: 40 }) })).json();
    assert(styled.item.textColor === "#FB0909" && styled.item.textFont === "serif", "style should save");
    const badColor = await (await fetch(`${base}/api/items/${item.id}/style`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textColor: "red" }) })).json();
    assert(badColor.item.textColor === "#FB0909", "a color that isn't #RRGGBB must be rejected");
    const rated = await (await fetch(`${base}/api/items/${item.id}/rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualityRating: 8, songRating: 7, quoteRating: 9 }) })).json();
    assert(rated.item.quoteRating === 9, "per-part ratings should save");
    const verified = await (await fetch(`${base}/api/items/${item.id}/verify`, { method: "POST" })).json();
    assert(verified.beacons.QUOTE_IN_STOCK === null, "quotes start locked, so no quote is drawn and the stock check doesn't apply (1.13.9, Quill #725)");
    const slideForm = new FormData();
    slideForm.append("slide", new Blob([png], { type: "image/png" }), "slide1.png");
    const withSlide = await (await fetch(`${base}/api/items/${item.id}/slides`, { method: "POST", body: slideForm })).json();
    assert(withSlide.item.slides.length === 1, "slide should attach");
    const framed = await (await fetch(`${base}/api/items/${item.id}/story-framing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyPanX: 20, storyPanY: 80 }) })).json();
    assert(framed.item.storyPanY === 80, "story framing should save");
    // 1.21.0 (room #960, "It should never duplicate."): a remix changes the cover on the spot, one version newer.
    const remix = (await postJson(`/api/items/${item.id}/remix-now`, { quote: { on: true } })).item;
    const queueNow = (await (await fetch(`${base}/api/items?status=queue`)).json()).items;
    assert(remix.id === item.id && remix.revision === 2 && queueNow.filter((i) => i.imageUrl === item.imageUrl).length === 1, "remix should change the cover on the spot, with no copy");
    const enq = await (await fetch(`${base}/api/items/enqueue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ imageUrl: "https://example.com/drive-photo.jpg", driveId: "drive123", title: "drive photo" }, { imageUrl: "https://example.com/blurry.jpg", driveId: "drive999", imageQualityStatus: "quarantined" }] }) })).json();
    assert(enq.created.length === 2 && enq.created[0].quote.length > 0, "drive enqueue should assign a stock quote, never textless");
    assert(enq.created[1].status === "rejected", "quarantined photo must not enter the queue");
    const search = await (await fetch(`${base}/api/photos/search?q=full`)).json();
    assert(search.results.length >= 1, "photo search should find the uploaded photo");
    const cleanup = await (await fetch(`${base}/api/quality/cleanup-textless`, { method: "POST" })).json();
    assert(cleanup.ok === true, "cleanup should run");
  });
  await check("v1.4 style: Lines, text width and height, justify, clamped to their ranges", async () => {
    const item = await newItem("quill-style.png");
    const st = await postJson(`/api/items/${item.id}/style`, { lineCount: 2, textWidth: 60, textHeight: 120, textAlign: "justify" });
    assert(st.item.lineCount === 2 && st.item.textWidth === 60 && st.item.textHeight === 120 && st.item.textAlign === "justify", JSON.stringify(st.item).slice(0, 300));
    const wild = await postJson(`/api/items/${item.id}/style`, { lineCount: 500, textWidth: 500, textHeight: 5, textAlign: "diagonal" });
    assert(wild.item.lineCount === 99 && wild.item.textWidth === 100 && wild.item.textHeight === 60 && wild.item.textAlign === "justify", `clamps: ${wild.item.lineCount} ${wild.item.textWidth} ${wild.item.textHeight} ${wild.item.textAlign}`);
    assert(item.textWidth === 84 && item.textHeight === 100 && Array.isArray(item.extraTexts) && item.extraTexts.length === 0, "new covers get the defaults");
  });
  await check("v1.5 style: Text width and height stretch (10 to 50, default 30) and Lines past 4 save", async () => {
    const item = await newItem("v15-stretch.png");
    assert(item.widthScale === 30 && item.heightScale === 30, `new covers start unstretched: ${item.widthScale} ${item.heightScale}`);
    const st = await postJson(`/api/items/${item.id}/style`, { widthScale: 45, heightScale: 12, lineCount: 7 });
    assert(st.item.widthScale === 45 && st.item.heightScale === 12 && st.item.lineCount === 7, JSON.stringify(st.item).slice(0, 300));
    const wild = await postJson(`/api/items/${item.id}/style`, { widthScale: 80, heightScale: 2 });
    assert(wild.item.widthScale === 50 && wild.item.heightScale === 10, `clamps: ${wild.item.widthScale} ${wild.item.heightScale}`);
    const boxes = await postJson(`/api/items/${item.id}/style`, { extraTexts: [{ quote: "x", widthScale: 40, heightScale: 99 }] });
    assert(boxes.item.extraTexts[0].widthScale === 40 && boxes.item.extraTexts[0].heightScale === 50, JSON.stringify(boxes.item.extraTexts[0]));
  });
  await check("v1.4 colors: a custom color saves and joins her custom colors; palette colors don't", async () => {
    const item = await newItem("quill-color.png");
    const c = await postJson(`/api/items/${item.id}/style`, { textColor: "#123456" });
    assert(c.item.textColor === "#123456", "custom color should save");
    await postJson(`/api/items/${item.id}/style`, { textColor: "#FB0909" });
    const pal = await (await fetch(`${base}/api/palette`)).json();
    assert(pal.palette.length === 11 && pal.customColors[0] === "#123456" && !pal.customColors.includes("#FB0909"), JSON.stringify(pal.customColors));
  });
  await check("v1.4 extra text boxes save cleaned up, at most 5", async () => {
    const item = await newItem("quill-boxes.png");
    const boxes = Array.from({ length: 7 }, (_, i) => ({ quote: `box ${i} ${"x".repeat(i === 0 ? 400 : 0)}`, textColor: "#FB0909", fontSize: 40, horizontalPosition: 20, bogus: "nope" }));
    const r = await postJson(`/api/items/${item.id}/style`, { extraTexts: boxes });
    assert(r.item.extraTexts.length === 5, `kept ${r.item.extraTexts.length}`);
    assert(!("bogus" in r.item.extraTexts[0]) && r.item.extraTexts[0].quote.length <= 300 && r.item.extraTexts[1].textColor === "#FB0909", JSON.stringify(r.item.extraTexts[1]));
    const cleared = await postJson(`/api/items/${item.id}/style`, { extraTexts: [] });
    assert(cleared.item.extraTexts.length === 0, "clearing works");
  });
  await check("v1.4 image edit: contrast and face mosaic boxes are kept clean, other notes stay", async () => {
    const item = await newItem("quill-edit.png");
    const r = await postJson(`/api/items/${item.id}/image-edit`, { contrast: "bw", mosaics: [{ x: 10, y: 10, w: 20, h: 20 }, { x: "a" }], note: "crop tighter" });
    assert(r.item.imageEdit.contrast === "bw" && r.item.imageEdit.mosaics.length === 1 && r.item.imageEdit.note === "crop tighter", JSON.stringify(r.item.imageEdit));
    const bad = await postJson(`/api/items/${item.id}/image-edit`, { contrast: "sepia" });
    assert(bad.item.imageEdit.contrast === "bw", "an unknown contrast keeps the last good one");
  });
  await check("v1.4 why it matches: her Muse records it, enqueue can carry it", async () => {
    const item = await newItem("quill-why.png");
    const r = await postJson(`/api/items/${item.id}/why`, { text: "The photo is the room itself.", tags: ["intimate", "hook ~0:30", 7], audience: "rug followers", source: "Act 1 #16" });
    assert(r.item.why.text === "The photo is the room itself." && r.item.why.tags.join("|") === "intimate|hook ~0:30|7" && r.item.why.audience === "rug followers", JSON.stringify(r.item.why));
    const empty = await fetch(`${base}/api/items/${item.id}/why`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: " " }) });
    assert(empty.status === 400, `empty why should be refused, got ${empty.status}`);
    const enq = await postJson(`/api/items/enqueue`, { items: [{ imageUrl: "https://example.com/why.jpg", driveId: "smoke-why-1", title: "why", why: { text: "Because.", tags: ["a"] } }] });
    assert(enq.created[0].why && enq.created[0].why.text === "Because.", JSON.stringify(enq.created[0].why));
  });
  await check("v1.4 setup status counts the queue, approved and rejected", async () => {
    const s2 = await (await fetch(`${base}/api/setup/status`)).json();
    const all = await Promise.all(["queue", "approved", "rejected"].map(async (st) => (await (await fetch(`${base}/api/items?status=${st}`)).json()).items.length));
    assert(s2.counts && s2.counts.queue === all[0] && s2.counts.approved === all[1] && s2.counts.rejected === all[2], JSON.stringify(s2.counts));
  });
  await check("v1.4 a song with a preview in the pool brings its preview along", async () => {
    await postJson(`/api/trending/refresh`, { songs: [{ title: "Preview Song", artist: "Tester", previewUrl: "https://example.com/preview.mp3" }], source: "smoke" });
    const item = await newItem("quill-song.png");
    assert(item.song === "Tester - Preview Song" && item.songPreviewUrl === "https://example.com/preview.mp3", `${item.song} ${item.songPreviewUrl}`);
    const shuffled = await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else" });
    assert(shuffled.item.songPreviewUrl === "", "a typed song drops the old preview");
  });
  await check("v1.6 a song's Spotify link travels with it from the pool; a typed song drops it; her Muse can attach one", async () => {
    const link = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC";
    await postJson(`/api/trending/refresh`, { songs: [{ title: "Linked Song", artist: "Tester", spotifyUrl: link }], source: "smoke" });
    const item = await newItem("spotify-song.png");
    assert(item.song === "Tester - Linked Song" && item.songSpotifyUrl === link, `${item.song} ${item.songSpotifyUrl}`);
    const typed = await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else" });
    assert(typed.item.songSpotifyUrl === "", "a typed song drops the old link");
    const attached = await postJson(`/api/items/${item.id}/edit`, { songSpotifyUrl: link });
    assert(attached.item.songSpotifyUrl === link && attached.item.song === "Someone - Else", "a link can be attached without changing the song");
    await postJson(`/api/connectors/spotify/sync-library`, { tracks: [{ title: "Lib Song", artist: "Her", spotifyUrl: link }] });
    const shuffled = await postJson(`/api/items/${item.id}/edit`, { shuffleSong: true });
    assert(shuffled.item.song === "Her - Lib Song" && shuffled.item.songSpotifyUrl === link, `${shuffled.item.song} ${shuffled.item.songSpotifyUrl}`);
    await postJson(`/api/connectors/spotify/sync-library`, { tracks: [] });
  });
  await check("v1.28 new covers and new text boxes start in TikTok Sans Medium (room #1194, #1199); a weight she sets is marked hers and stays", async () => {
    const item = await newItem("regular.png");
    assert(item.textFont === "tiktok" && item.fontWeight === 500 && !item.fontWeightSet, `${item.textFont} ${item.fontWeight} ${item.fontWeightSet}`);
    const styled = await postJson(`/api/items/${item.id}/style`, { extraTexts: [{ quote: "mine" }] });
    assert(styled.item.extraTexts[0].fontWeight === 500 && styled.item.extraTexts[0].textFont === "tiktok", JSON.stringify(styled.item.extraTexts[0]));
    assert(!styled.item.fontWeightSet, "a new box at the default isn't her pick");
    const boxBold = await postJson(`/api/items/${item.id}/style`, { extraTexts: [{ ...styled.item.extraTexts[0], fontWeight: 700 }] });
    assert(boxBold.item.extraTexts[0].fontWeight === 700 && boxBold.item.fontWeightSet === true, "a box's weight she changed marks the cover");
    const other = await newItem("regular-2.png");
    const bold = await postJson(`/api/items/${other.id}/style`, { fontWeight: 700 });
    assert(bold.item.fontWeight === 700 && bold.item.fontWeightSet === true, "a saved weight stays, marked hers");
  });
  await check("v1.8.1 opacity runs 25 to 100 like the original; a stored value under 25 stays until her opacity changes", async () => {
    assert(nextOpacity(10, 100) === 25 && nextOpacity(120, 100) === 100 && nextOpacity(60, 100) === 60, "new values clamp to 25 to 100");
    assert(nextOpacity(22, 22) === 22 && nextOpacity(23, 22) === 25 && nextOpacity(40, 22) === 40, "an unchanged old value passes through as stored");
    const item = await newItem("opacity.png");
    const low = await postJson(`/api/items/${item.id}/style`, { opacity: 10 });
    assert(low.item.opacity === 25, `floor ${low.item.opacity}`);
    const high = await postJson(`/api/items/${item.id}/style`, { opacity: 140 });
    assert(high.item.opacity === 100, `ceiling ${high.item.opacity}`);
    const boxes = await postJson(`/api/items/${item.id}/style`, { extraTexts: [{ quote: "a", opacity: 5 }, { quote: "b", opacity: 70 }] });
    assert(boxes.item.extraTexts[0].opacity === 25 && boxes.item.extraTexts[1].opacity === 70, JSON.stringify(boxes.item.extraTexts.map((b) => b.opacity)));
  });
  // ---------- v1.9: captions in the space's voice (Quill #269, #276, #284, #292) ----------
  await check("v1.9 the caption prompt is the original's word for word with no voice, and on the cover's own text with one", async () => {
    const cover = { quote: "slow mornings", description: "a girl on a balcony", showQuote: true, extraTexts: [] };
    const original = "Write one Instagram caption for this cover. Make it a short unexpected curveball that still clicks with the image and quote. Sound like a person typing with caveman-level brevity: one fragment, one blunt observation, or a few raw words. One to eight words. Lowercase is fine. Mild profanity is fine when it genuinely fits, but do not force it. No emoji, hashtags, explanations, marketing language, polished prose, or full setup. Never use an antithesis formula such as \"it's not this, it's that,\" \"not x but y,\" or any close variation. Avoid repeating the cover quote.\n\nCover quote: slow mornings\nImage description: a girl on a balcony";
    assert(captionPrompt(cover, "") === original, captionPrompt(cover, ""));
    const voiced = captionPrompt({ ...cover, extraTexts: [{ quote: "part two" }] }, "Short and warm. Ends with two exclamation marks.");
    assert(voiced.includes("slow mornings") && voiced.includes("part two") && voiced.includes("Ends with two exclamation marks.") && !voiced.includes("One to eight words"), voiced);
    const hidden = captionPrompt({ ...cover, showQuote: false, extraTexts: [{ quote: "only this" }] }, "warm");
    assert(hidden.includes("only this") && !hidden.includes("slow mornings"), "the quote isn't on the cover, so the box text is the topic");
    assert(voiced.includes("first person"), "with a voice, the caption is written as her");
  });
  await check("v1.9.2 a cover that shows no text gets a caption about its photo, never its hidden quote", async () => {
    // Quill #327: when nothing shows, the photo governs; the hidden quote is not visible text and not her words.
    const cover = { quote: "slow mornings", description: "a woman laughing on a sunlit balcony", showQuote: false, extraTexts: [] };
    const photo = captionPrompt(cover, "warm");
    assert(!photo.includes("slow mornings"), `the hidden quote must stay out: ${photo}`);
    assert(photo.includes("no text on this cover") && photo.includes("a woman laughing on a sunlit balcony"), photo);
    const noVoice = captionPrompt(cover, "");
    assert(noVoice.includes("Cover quote: slow mornings") && noVoice.includes("Image description: a woman laughing"), "the no-voice prompt stays the original's");
    const item = await newItem("photo-only.png");
    await postJson(`/api/items/${item.id}/quote-toggle`, { showQuote: false }); // quotes show by default since 1.13.9
    await postJson(`/api/settings/caption-voice`, { voice: "Warm and short." });
    try {
      const before = await (await fetch(`${base}/api/items/${item.id}/caption-prompt`)).json();
      assert(before.needsDescription === true && before.imageUrl === item.imageUrl && !before.prompt.includes(item.quote || "@@"), JSON.stringify(before));
      const early = await postJson(`/api/items/${item.id}/caption-draft`, { caption: "Yayyy a red door!!", basedOn: before.basedOn });
      assert(early.saved === false && early.reason === "no-description", `a draft needs what the photo shows first: ${JSON.stringify(early)}`);
      const described = await postJson(`/api/items/${item.id}/description`, { text: "  a red door in the rain  " });
      assert(described.item.description === "a red door in the rain", JSON.stringify(described.item.description));
      const after = await (await fetch(`${base}/api/items/${item.id}/caption-prompt`)).json();
      assert(after.needsDescription === false && after.prompt.includes("a red door in the rain"), JSON.stringify(after));
      await postJson(`/api/items/${item.id}/style`, { extraTexts: [{ quote: "a box line" }] });
      const onText = await (await fetch(`${base}/api/items/${item.id}/caption-prompt`)).json();
      // 1.10 (Arjang #435): with text showing, the text stays the topic and the photo comes along.
      assert(onText.needsDescription === false && onText.prompt.includes("a box line") && onText.prompt.includes("a red door"), "with text showing, the text is the topic and the photo comes too");
    } finally {
      await postJson(`/api/settings/caption-voice`, { voice: "" });
    }
  });
  await check("v1.9 a model draft is checked like the original's output with no voice; with a voice only Pollen's rules apply", async () => {
    assert(draftProblems("slow coffee wins", { voice: "" }).length === 0, "a good short draft");
    assert(draftProblems("one two three four five six seven eight nine", { voice: "" }).length === 1, "nine words");
    assert(draftProblems("x".repeat(81), { voice: "" }).length === 1, "81 characters");
    assert(draftProblems("mood #sunday", { voice: "" }).length === 1, "a hashtag");
    assert(draftProblems("  ", { voice: "" }).length === 1, "empty");
    assert(draftProblems("Yayyy this whole long sentence in her voice has many more words than eight!!", { voice: "warm" }).length === 0, "a voice has no length rule of its own");
    assert(draftProblems("so good \u2728", { voice: "warm" }).length === 1, "Pollen's rules still apply");
  });
  await check("v1.9 a model may draft blank captions, and offline placeholders on covers made after the release", async () => {
    const opts = { offlineDraft: "slow mornings", fillFrom: 1000 };
    const at = (o) => ({ status: "queue", caption: "slow mornings", quote: "slow mornings", createdAt: 2000, ...o });
    assert(canDraft(at({ captionSource: "placeholder" }), opts), "a new placeholder");
    assert(!canDraft(at({ captionSource: "placeholder", createdAt: 500 }), opts), "an older cover waits for backfill");
    assert(canDraft(at({ captionSource: "placeholder", createdAt: 500 }), { ...opts, fillFrom: 0 }), "backfill opens it");
    assert(canDraft(at({ caption: " ", captionSource: "human", createdAt: 500 }), opts), "a blank caption always gets a draft");
    assert(!canDraft(at({ captionSource: "human" }), opts) && !canDraft(at({ captionSource: "model" }), opts), "typed and model captions are locked");
    assert(canDraft(at({}), opts), "an old row that matches its offline draft is a placeholder");
    assert(!canDraft(at({ caption: "my own words" }), opts), "an old row with other words is locked");
    assert(!canDraft(at({ caption: "", status: "rejected" }), opts), "passed covers are left alone");
    // 1.21.0: a remix on the spot gives an older cover a new quote and a fresh placeholder, which a model may draft, as it
    // could draft 1.17's remix copy.
    assert(canDraft(at({ captionSource: "placeholder", createdAt: 500, remixedAt: 3000 }), opts), "a cover remixed since drafting started");
    assert(!canDraft(at({ captionSource: "placeholder", createdAt: 500, remixedAt: 800 }), opts), "a remix from before drafting started waits for backfill");
  });
  await check("v1.9 captions keep their source; upstream has no model, so its fill keeps the offline draft", async () => {
    const item = await newItem("source.png");
    assert(item.captionSource === "placeholder" && item.caption, JSON.stringify(item));
    const want = await (await fetch(`${base}/api/captions/wanted`)).json();
    assert(want.ids.includes(item.id), `a new placeholder is wanted: ${JSON.stringify(want)}`);
    const fill = await postJson(`/api/items/${item.id}/caption-fill`, {});
    assert(fill.drafted === false && fill.reason === "no-model" && fill.item.caption === item.caption, JSON.stringify(fill));
    const typed = await postJson(`/api/items/${item.id}/edit`, { caption: "my own" });
    assert(typed.item.captionSource === "human", typed.item.captionSource);
    const want2 = await (await fetch(`${base}/api/captions/wanted`)).json();
    assert(!want2.ids.includes(item.id), "a typed caption is not wanted");
    await postJson(`/api/items/${item.id}/edit`, { caption: "" });
    const refill = await postJson(`/api/items/${item.id}/caption-fill`, {});
    assert(refill.drafted === true && refill.item.caption && refill.item.captionSource === "placeholder", JSON.stringify(refill));
    const redo = await postJson(`/api/items/${item.id}/edit`, { caption: "mine again" });
    const again = await postJson(`/api/items/${redo.item.id}/edit`, { regenerateCaption: true });
    assert(again.item.captionSource === "placeholder", again.item.captionSource);
  });
  await check("v1.9 a model's draft saves only while the caption is unchanged and draftable, then it's locked", async () => {
    const item = await newItem("draft.png");
    const p = await (await fetch(`${base}/api/items/${item.id}/caption-prompt`)).json();
    assert(p.canDraft === true && p.voice === false && p.basedOn === item.caption && p.prompt.startsWith("Write one Instagram caption"), JSON.stringify(p));
    const bad = await postJson(`/api/items/${item.id}/caption-draft`, { caption: "one two three four five six seven eight nine", basedOn: p.basedOn });
    assert(bad.saved === false && bad.reason === "rules" && bad.problems.length === 1, JSON.stringify(bad));
    const stale = await postJson(`/api/items/${item.id}/caption-draft`, { caption: "slow coffee", basedOn: "something else" });
    assert(stale.saved === false && stale.reason === "changed", JSON.stringify(stale));
    const ok = await postJson(`/api/items/${item.id}/caption-draft`, { caption: "slow coffee", basedOn: p.basedOn });
    assert(ok.saved === true && ok.item.caption === "slow coffee" && ok.item.captionSource === "model", JSON.stringify(ok));
    const again = await postJson(`/api/items/${item.id}/caption-draft`, { caption: "another", basedOn: "slow coffee" });
    assert(again.saved === false && again.reason === "locked", JSON.stringify(again));
  });
  await check("v1.9 undo can put a caption's source back with its words", async () => {
    const item = await newItem("undo-source.png");
    const typed = await postJson(`/api/items/${item.id}/edit`, { caption: "mine" });
    assert(typed.item.captionSource === "human", "typed");
    const back = await postJson(`/api/items/${item.id}/edit`, { caption: item.caption, captionSource: "placeholder" });
    assert(back.item.captionSource === "placeholder" && back.item.caption === item.caption, JSON.stringify(back.item));
    const none = await postJson(`/api/items/${item.id}/edit`, { caption: "old words", captionSource: null });
    assert(!("captionSource" in none.item), "null clears the source, so an old row reads as it did");
    const odd = await postJson(`/api/items/${item.id}/edit`, { caption: "x", captionSource: "robot" });
    assert(odd.item.captionSource === "human", "anything else counts as typed");
  });
  await check("v1.9 the caption voice is the space's own setting; empty means none; backfill opens older covers", async () => {
    const before = await (await fetch(`${base}/api/settings/caption-voice`)).json();
    assert(before.voice === "" && before.fillFrom > 0, JSON.stringify(before));
    const set = await postJson(`/api/settings/caption-voice`, { voice: "  Warm and short.  " });
    assert(set.voice === "Warm and short." && set.fillFrom === before.fillFrom, JSON.stringify(set));
    assert(readFileSync(join(DATA, "settings.json"), "utf8").includes("Warm and short."), "the voice lives in the space's own data");
    const item = await newItem("voiced.png");
    const p = await (await fetch(`${base}/api/items/${item.id}/caption-prompt`)).json();
    assert(p.voice === true && p.prompt.includes("Warm and short.") && !p.prompt.includes("One to eight words"), JSON.stringify(p));
    const back = await postJson(`/api/settings/caption-voice`, { backfill: true });
    assert(back.fillFrom === 0 && back.voice === "Warm and short.", JSON.stringify(back));
    const cleared = await postJson(`/api/settings/caption-voice`, { voice: "" });
    assert(cleared.voice === "" && cleared.fillFrom === 0, JSON.stringify(cleared));
  });
  await check("v1.9.1 a custom color can be removed from her list; the 11 colors stay", async () => {
    const item = await newItem("custom-remove.png");
    await postJson(`/api/items/${item.id}/style`, { textColor: "#ABCDEF" });
    const before = await (await fetch(`${base}/api/palette`)).json();
    assert(before.customColors.includes("#ABCDEF"), JSON.stringify(before.customColors));
    const removed = await postJson(`/api/palette/custom-colors/remove`, { hex: "#abcdef" });
    assert(!removed.customColors.includes("#ABCDEF") && removed.palette.length === 11, JSON.stringify(removed));
    const again = await postJson(`/api/palette/custom-colors/remove`, { hex: "#ABCDEF" });
    assert(JSON.stringify(again.customColors) === JSON.stringify(removed.customColors), "removing it twice changes nothing");
    const bad = await fetch(`${base}/api/palette/custom-colors/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: "red" }) });
    assert(bad.status === 400, `a bad color answers 400, got ${bad.status}`);
    const cover = await (await fetch(`${base}/api/items?status=queue`)).json();
    assert(cover.items.find((i) => i.id === item.id).textColor === "#ABCDEF", "covers keep their color");
  });
  // ---------- v1.10: the comment call switch (Arjang #435) ----------
  const CALLS = [{ keyword: "SLOW", line: "Comment SLOW and I'll send you my practice!!" }, { keyword: "EFFORT", line: "Comment EFFORT and I'll send you where I start!!" }];
  await check("v1.10 a cover posts its comment call only when its switch is on", async () => {
    assert(postedCaption({ caption: "golden hour" }, CALLS) === "golden hour", "off by default");
    assert(postedCaption({ caption: "golden hour", cta: "EFFORT" }, CALLS) === "Comment EFFORT and I'll send you where I start!! golden hour", "on puts the call first");
    assert(postedCaption({ caption: "golden hour", cta: "slow" }, CALLS).startsWith("Comment SLOW"), "keywords match in any case");
    assert(postedCaption({ caption: "golden hour", cta: "GONE" }, CALLS) === "golden hour", "a call no longer on her list adds nothing");
    assert(postedCaption({ caption: "  ", cta: "SLOW" }, CALLS) === "Comment SLOW and I'll send you my practice!!", "a call with no caption posts alone");
    assert(ctaFor({ cta: "slow" }, CALLS).keyword === "SLOW" && ctaFor({}, CALLS) === null, "lookup");
    const good = cleanCtas([{ keyword: " slow ", line: "  Comment SLOW and I'll send you my practice!!  " }]);
    assert(!good.error && good.ctas[0].keyword === "SLOW" && good.ctas[0].line === "Comment SLOW and I'll send you my practice!!", JSON.stringify(good));
    assert(cleanCtas([{ keyword: "SLOW", line: "Comment FAST to get it!!" }]).error, "the line must carry its keyword");
    assert(cleanCtas([{ keyword: "two words", line: "Comment two words!!" }]).error, "a keyword is one word");
    assert(cleanCtas([{ keyword: "SLOW", line: "Comment SLOW ✨" }]).error, "a line Pollen would refuse is refused");
    assert(cleanCtas([{ keyword: "SLOW", line: "Comment SLOW!!" }, { keyword: "slow", line: "Comment SLOW now!!" }]).error, "one line per keyword");
    assert(/comment CTAs/.test(cleanCtas(Array.from({ length: 7 }, (_, i) => ({ keyword: `K${i}`, line: `Comment K${i}!!` }))).error || ""), "six at most, named comment CTAs");
    assert(!cleanCtas([]).error && cleanCtas([]).ctas.length === 0, "an empty list clears them");
    assert(bakedCta("Comment SLOW and I'll send you my practice!! golden hour", CALLS), "her line baked in");
    assert(bakedCta("golden hour!! comment slow for the practice!!", CALLS), "her keyword's call anywhere, any case");
    assert(bakedCta("Comment WORD and I'll send it!! hi", []), "a call at the start, even with no list");
    assert(!bakedCta("I comment on the slow river!!", CALLS) && !bakedCta("golden hour", []), "her words are fine");
  });
  // ---------- v1.10.1: Comment CTA, and off really hides it (Arjang #453, Quill #458) ----------
  await check("v1.10.1 one helper decides what shows and what posts, shared by the page and the server", async () => {
    assert(plainCaption === sharedCall.plainCaption && postedCaption === sharedCall.postedCaption && ctaFor === sharedCall.ctaFor, "the server uses the page's helper");
  });
  await check("v1.10.1 off leaves a call written into the caption out, and on adds her line once", async () => {
    const baked = `${CALLS[0].line} golden hour with you`;
    assert(plainCaption(baked, CALLS) === "golden hour with you", `her line at the start: ${plainCaption(baked, CALLS)}`);
    assert(postedCaption({ caption: baked }, CALLS) === "golden hour with you", "off posts the plain caption");
    assert(postedCaption({ caption: baked, cta: "SLOW" }, CALLS) === `${CALLS[0].line} golden hour with you`, "on adds her line once");
    assert(postedCaption({ caption: baked, cta: "EFFORT" }, CALLS) === `${CALLS[1].line} golden hour with you`, "the other call replaces the written one");
    assert(plainCaption(`${CALLS[0].line.toUpperCase()} golden hour`, CALLS) === "golden hour", "her line in any case");
    assert(plainCaption(`golden hour!! ${CALLS[1].line}`, CALLS) === "golden hour!!", "her line at the end");
    assert(plainCaption(`golden hour!!\n\n${CALLS[1].line}\n\nslow mornings`, CALLS) === "golden hour!!\n\nslow mornings", "the rest keeps its shape");
    assert(plainCaption("Comment WORD and I'll send it!! golden hour", []) === "golden hour", "a Comment WORD sentence at the start, even with no list");
    assert(plainCaption("Comment WORD for my 3.5 minute practice!! golden hour", []) === "golden hour", "a decimal doesn't end the call early");
    assert(plainCaption("Comment below if you feel it!!", CALLS) === "Comment below if you feel it!!", "an ordinary word after comment stays");
    assert(plainCaption("I comment on the slow river!!", CALLS) === "I comment on the slow river!!", "her words stay");
    assert(plainCaption("golden hour", CALLS) === "golden hour" && plainCaption("", CALLS) === "" && plainCaption(undefined, CALLS) === "", "nothing to cut");
    assert(plainCaption(CALLS[0].line, CALLS) === "" && postedCaption({ caption: CALLS[0].line }, CALLS) === "", "a caption that is only a call is empty when off");
    assert(postedCaption({ caption: CALLS[0].line, cta: "SLOW" }, CALLS) === CALLS[0].line, "and her line alone when on");
  });
  await check("v1.10 the space keeps its comment calls, and a cover's switch is off until she turns it on", async () => {
    const empty = await (await fetch(`${base}/api/settings/caption-ctas`)).json();
    assert(Array.isArray(empty.ctas) && empty.ctas.length === 0, `upstream ships none: ${JSON.stringify(empty)}`);
    const set = await postJson(`/api/settings/caption-ctas`, { ctas: [{ keyword: "slow", line: CALLS[0].line }, CALLS[1]] });
    assert(set.ctas.length === 2 && set.ctas[0].keyword === "SLOW", JSON.stringify(set));
    assert(readFileSync(join(DATA, "settings.json"), "utf8").includes("Comment SLOW"), "her calls live in the space's own data");
    try {
      const bad = await fetch(`${base}/api/settings/caption-ctas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ctas: [{ keyword: "SLOW", line: "no keyword here" }] }) });
      assert(bad.status === 400 && /keyword/i.test((await bad.json()).error), `a bad list answers 400, got ${bad.status}`);
      const still = await (await fetch(`${base}/api/settings/caption-ctas`)).json();
      assert(still.ctas.length === 2, "a refused list changes nothing");
      const item = await newItem("cta.png");
      assert(item.cta == null, `off by default: ${item.cta}`);
      const on = await postJson(`/api/items/${item.id}/edit`, { cta: "effort" });
      assert(on.item.cta === "EFFORT" && on.item.caption === item.caption, `on, with the caption untouched: ${JSON.stringify(on.item)}`);
      const other = await postJson(`/api/items/${item.id}/edit`, { note: "hi" });
      assert(other.item.cta === "EFFORT", "other edits leave the switch alone");
      const unknown = await fetch(`${base}/api/items/${item.id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cta: "NOPE" }) });
      assert(unknown.status === 400 && /comment CTA/.test((await unknown.json()).error), `a call that isn't on her list answers 400 and says comment CTA, got ${unknown.status}`);
      const off = await postJson(`/api/items/${item.id}/edit`, { cta: null });
      assert(!("cta" in off.item), `off clears it: ${JSON.stringify(off.item.cta)}`);
    } finally {
      await postJson(`/api/settings/caption-ctas`, { ctas: [] });
    }
  });
  await check("v1.10 a draft with a comment call baked in is refused, so the switch stays the only way in", async () => {
    await postJson(`/api/settings/caption-ctas`, { ctas: [CALLS[0]] });
    try {
      const item = await newItem("cta-draft.png");
      const p = await (await fetch(`${base}/api/items/${item.id}/caption-prompt`)).json();
      const baked = await postJson(`/api/items/${item.id}/caption-draft`, { caption: `${CALLS[0].line} slow coffee`, basedOn: p.basedOn });
      assert(baked.saved === false && baked.reason === "rules" && baked.problems.some((x) => /comment CTA/.test(x)), JSON.stringify(baked));
      assert(draftProblems("Comment WORD and get it!! hi", { voice: "warm", ctas: [] }).some((x) => /comment CTA/.test(x)), "a call is refused even with no list");
      assert(draftProblems("slow coffee", { voice: "", ctas: [CALLS[0]] }).length === 0, "a plain draft still passes");
    } finally {
      await postJson(`/api/settings/caption-ctas`, { ctas: [] });
    }
  });
  await check("v1.10 a voiced caption always carries the photo, text covers too, and leaves the comment call out", async () => {
    const text = { quote: "slow mornings", description: "a woman on a balcony", showQuote: true, extraTexts: [] };
    const voiced = captionPrompt(text, "warm");
    assert(voiced.includes("slow mornings") && voiced.includes("a woman on a balcony") && /something specific in the photo/i.test(voiced), voiced);
    assert(/subtext/i.test(voiced) && /curiosity loops/i.test(voiced) && /the more open loops, the better/i.test(voiced), `#453's standard: ${voiced}`);
    assert(/leave out any call to comment/i.test(voiced), `the switch adds the call: ${voiced}`);
    assert(needsDescription({ ...text, description: "" }, "warm") === true, "a text cover needs its photo described too");
    assert(needsDescription({ ...text, description: "" }, "") === false, "with no voice nothing is needed");
    assert(!/allude|call to comment|subtext|curiosity/i.test(captionPrompt(text, "")), "the no-voice prompt stays the original's");
  });
  // ---------- v1.11: downloaded songs (Arjang #477, #480; Quill #482; Symphony #481, #491) ----------
  let before111;
  await check("v1.11 the songs folder is empty by default, and a folder the app can't use is refused with the reason", async () => {
    before111 = await newItem("songs-before.png");
    const empty = await (await fetch(`${base}/api/songs`)).json();
    assert(empty.connected === false && empty.folder === null && Array.isArray(empty.songs) && empty.songs.length === 0, `nothing connected: ${JSON.stringify(empty)}`);
    for (const [folder, why] of [["relative/songs", /full path/i], [join(SONGS, "nope"), /isn't there|not a folder/i], [NO_MANIFEST, /manifest\.json/]]) {
      const r = await fetch(`${base}/api/songs/folder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) });
      const b = await r.json();
      assert(r.status === 400 && why.test(b.error || ""), `${folder}: ${r.status} ${JSON.stringify(b)}`);
    }
    assert((await (await fetch(`${base}/api/songs`)).json()).connected === false, "a refused folder connects nothing");
    assert(!before111.songFile && before111.songSource !== "downloaded", `no clip before a folder is connected: ${JSON.stringify(before111)}`);
  });
  await check("v1.11 connecting reads Symphony's manifest and leaves out songs it can't play", async () => {
    const r = await postJson(`/api/songs/folder`, { folder: SONGS });
    assert(r.ok && r.connected && r.folder === SONGS && r.songs.length === 3, `three usable songs: ${JSON.stringify(r)}`);
    const list = await (await fetch(`${base}/api/songs`)).json();
    const a = list.songs.find((x) => x.id === "artist-a--song-a"), c = list.songs.find((x) => x.id === "artist-c--song-c");
    assert(a && a.artist === "Artist A" && a.title === "Song A" && a.hookStart === 44.2 && a.hookEnd === 59.1 && a.hookFile === "hooks/artist-a--song-a.m4a", JSON.stringify(a));
    assert(a.clipUrl === "/api/songs/clips/hooks/artist-a--song-a.m4a" && a.spotifyUrl.includes("open.spotify.com"), JSON.stringify(a));
    assert(c && c.hookStart === 5 && c.hookEnd === 20 && c.hookFile === "hooks/artist-c--song-c.m4a", `snake_case is read too: ${JSON.stringify(c)}`);
    assert(!list.songs.some((x) => ["outside", "backwards", "missing", "text"].includes(x.id)), `left out: ${list.songs.map((x) => x.id)}`);
    assert(readFileSync(join(DATA, "settings.json"), "utf8").includes(SONGS), "the folder lives in this copy's own settings");
  });
  await check("v1.11 the app serves a hook clip from its own address, and nothing else from the folder", async () => {
    const r = await fetch(`${base}/api/songs/clips/hooks/artist-a--song-a.m4a`);
    assert(r.ok && r.headers.get("content-type").startsWith("audio/mp4") && Buffer.from(await r.arrayBuffer()).equals(CLIP_A), `the clip: ${r.status} ${r.headers.get("content-type")}`);
    const mp3 = await fetch(`${base}/api/songs/clips/hooks/artist-b--song-b.mp3`);
    assert(mp3.ok && mp3.headers.get("content-type").startsWith("audio/mpeg"), `an mp3: ${mp3.headers.get("content-type")}`);
    const part = await fetch(`${base}/api/songs/clips/hooks/artist-a--song-a.m4a`, { headers: { Range: "bytes=0-3" } });
    assert(part.status === 206 && (await part.arrayBuffer()).byteLength === 4, `a range, so the player can seek: ${part.status}`);
    for (const path of ["manifest.json", "hooks/notes.txt", "hooks/not-there.m4a", "..%2Foutside.m4a", "hooks%2F..%2F..%2Foutside.m4a", "%2Fetc%2Fpasswd.m4a"]) {
      const bad = await fetch(`${base}/api/songs/clips/${path}`);
      assert(bad.status === 404, `${path} answered ${bad.status}`);
    }
  });
  await check("v1.11 with the folder connected, new covers and Shuffle pick downloaded songs, and older covers keep theirs", async () => {
    const fresh = await newItem("songs-new.png");
    assert(fresh.songSource === "downloaded" && /^hooks\//.test(fresh.songFile) && fresh.songPreviewUrl === `/api/songs/clips/${fresh.songFile}`, `a new cover: ${JSON.stringify(fresh)}`);
    assert(fresh.songHook && fresh.songHook.end > fresh.songHook.start && / - /.test(fresh.song), `with its hook: ${JSON.stringify(fresh.songHook)} ${fresh.song}`);
    const old = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === before111.id);
    assert(old.song === before111.song && !old.songFile, `an older cover keeps its song: ${JSON.stringify(old)}`);
    const shuffled = (await postJson(`/api/items/${before111.id}/edit`, { shuffleSong: true })).item;
    assert(shuffled.songSource === "downloaded" && shuffled.songFile && shuffled.songPreviewUrl === `/api/songs/clips/${shuffled.songFile}`, `shuffle picks from the list: ${JSON.stringify(shuffled)}`);
  });
  await check("v1.11 a typed song on the list gets its clip, any other typed song drops it, and undo puts the clip back", async () => {
    const item = await newItem("songs-typed.png");
    const onList = (await postJson(`/api/items/${item.id}/edit`, { song: "artist b - song b" })).item;
    assert(onList.songFile === "hooks/artist-b--song-b.mp3" && onList.songHook.start === 12 && onList.songHook.end === 27 && onList.songPreviewUrl === "/api/songs/clips/hooks/artist-b--song-b.mp3", JSON.stringify(onList));
    const other = (await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else" })).item;
    assert(!other.songFile && !other.songHook && other.songPreviewUrl === "" && other.song === "Someone - Else", `any other song drops the clip: ${JSON.stringify(other)}`);
    await postJson(`/api/items/${item.id}/edit`, { song: "Artist B - Song B" });
    const withLink = (await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else", songPreviewUrl: "https://example.com/preview.mp3" })).item;
    assert(!withLink.songFile && withLink.songPreviewUrl === "https://example.com/preview.mp3", `a preview sent with another song stays: ${JSON.stringify(withLink)}`);
    const undo = (await postJson(`/api/items/${item.id}/edit`, { song: onList.song, songPreviewUrl: onList.songPreviewUrl, songSpotifyUrl: "", songFile: onList.songFile, songHook: onList.songHook })).item;
    assert(undo.songFile === onList.songFile && undo.songHook.start === 12 && undo.songPreviewUrl === onList.songPreviewUrl, `undo: ${JSON.stringify(undo)}`);
    const sneaky = await fetch(`${base}/api/items/${item.id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song: "x", note: "changed", songFile: "../../etc/passwd" }) });
    assert(sneaky.status === 400, `a clip outside the folder is refused, got ${sneaky.status}`);
    const after = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === item.id);
    assert(after.song === onList.song && after.note !== "changed", "a refused edit changes nothing");
  });
  await check("v1.11 the Compose check counts a downloaded song as in the pool, and a song on no list as not", async () => {
    const item = await newItem("songs-verify.png");
    assert(item.songSource === "downloaded", `picked from the list: ${item.songSource}`);
    await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else" });
    const no = await postJson(`/api/items/${item.id}/verify`, {});
    assert(no.item.beacons.SONG_IN_POOL === false && no.item.songSource !== "downloaded", `on no list: ${JSON.stringify(no.item.beacons)} ${no.item.songSource}`);
    await postJson(`/api/items/${item.id}/edit`, { song: "Artist C - Song C" });
    const yes = await postJson(`/api/items/${item.id}/verify`, {});
    assert(yes.item.beacons.SONG_IN_POOL === true && yes.item.songSource === "downloaded", JSON.stringify(yes.item.beacons));
  });
  await check("v1.11 disconnecting stops the clips and the picks, and covers keep their song names", async () => {
    const item = await newItem("songs-disconnect.png");
    const off = await postJson(`/api/songs/folder`, { folder: null });
    assert(off.connected === false, JSON.stringify(off));
    assert((await fetch(`${base}/api/songs/clips/${item.songFile}`)).status === 404, "no folder, no clip");
    const later = await newItem("songs-after.png");
    assert(later.songSource !== "downloaded" && !later.songFile, `back to the old picks: ${JSON.stringify(later)}`);
    const kept = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === item.id);
    assert(kept.song === item.song && kept.songFile === item.songFile, "nothing stored is rewritten");
  });
  // ---------- v1.12: Symphony online (Arjang #477, #480, #483; Quill #497, #500; Symphony #496) ----------
  const symConnect = (code) => fetch(`${base}/api/connectors/symphony`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
  const getJson = async (path) => (await fetch(`${base}${path}`)).json();
  let symCover;
  await check("v1.12 Symphony is off by default, and a code that doesn't work is refused with the reason and stores nothing", async () => {
    const off = await getJson("/api/connectors/symphony");
    assert(off.connected === false && off.revoked === false, JSON.stringify(off));
    const page = await getJson("/api/symphony");
    assert(page.connected === false && page.songs.length === 0 && page.hot.rows.length === 0, `no songs: ${JSON.stringify(page).slice(0, 200)}`);
    assert((await fetch(`${base}/api/symphony/clips/sym-b--song-two`)).status === 404, "no code, no clip");
    const short = await symConnect("short");
    assert(short.status === 400 && /didn't work/.test((await short.json()).error), "a short code is refused");
    const wrong = await symConnect("x".repeat(43));
    assert(wrong.status === 401 && /didn't work/.test((await wrong.json()).error), `a wrong code is refused: ${wrong.status}`);
    assert(!readFileSync(join(DATA, "settings.json"), "utf8").includes('"symphony"'), "a refused code stores nothing");
    const songs = await getJson("/api/songs");
    assert(songs.source === null && songs.songs.length === 0, `no picks: ${JSON.stringify(songs)}`);
  });
  await check("v1.12 connecting reads the feed, the code stays in this copy's settings, and no endpoint answers with it", async () => {
    const r = await symConnect(SYM_CODE);
    const body = await r.json();
    assert(r.ok && body.ok && body.connected && body.songs === 4 && body.withClips === 2 && body.day === "2026-11-19", `connected: ${JSON.stringify(body)}`);
    assert(readFileSync(join(DATA, "settings.json"), "utf8").includes(SYM_CODE), "the code lives in this copy's own settings");
    for (const path of ["/api/connectors/symphony", "/api/symphony", "/api/health", "/api/setup/status", "/api/songs", "/api/connectors"]) {
      const text = await (await fetch(`${base}${path}`)).text();
      assert(!text.includes(SYM_CODE) && !text.includes("token=signed"), `${path} answers with the code or a signed link`);
    }
    const health = await getJson("/api/health");
    assert(health.symphony.connected === true, JSON.stringify(health.symphony));
  });
  await check("v1.12 the Songs data: New hot in order, playable parts marked, and anything unsafe or unusable left out", async () => {
    const page = await getJson("/api/symphony");
    assert(page.connected && page.stale === false && page.hot.date === "2026-11-19", JSON.stringify({ ...page, songs: page.songs.length }));
    assert(JSON.stringify(page.hot.rows) === JSON.stringify([{ id: "sym-b--song-two", badges: [{ text: "New on Shazam" }] }]), `hot rows: ${JSON.stringify(page.hot.rows)}`);
    assert(page.songs.map((s) => s.id).join(",") === "sym-a--song-one,sym-b--song-two,sym-c--no-hook,sym-d--elsewhere", `songs: ${page.songs.map((s) => s.id)}`);
    const [a, b, c, d] = page.songs;
    assert(a.hook.start === 44.4 && a.hook.label === "0:44 to 0:59" && a.hook.parts.length === 2 && a.hook.lines.length === 2 && JSON.stringify(a.clips) === "[true,true]", JSON.stringify(a.hook));
    assert(a.previewUrl.apple === "https://audio-ssl.itunes.apple.com/a.m4a" && a.previewUrl.spotify === null && a.previewStart.deezer === 41.5, `previews: ${JSON.stringify(a.previewUrl)}`);
    assert(JSON.stringify(a.replay) === "[0,10,99,99,0]" && a.depth.signals.applePreview === true && !("bad key!" in a.depth.signals), `replay and depth: ${JSON.stringify(a.replay)}`);
    assert(a.today.shazam.rank === 3 && a.links.spotify.includes("open.spotify.com") && !("clipLinks" in a) && !("clipUrls" in a), "today, links, and no signed links");
    assert(b.artwork === null && b.hook.label === "0:12 to 0:27" && JSON.stringify(b.hook.parts) === JSON.stringify([{ start: 12, end: 27 }]), `a javascript: link becomes nothing: ${JSON.stringify(b)}`);
    assert(c.hook === null && JSON.stringify(c.clips) === "[]", JSON.stringify(c));
    assert(d.hook.start === 5 && JSON.stringify(d.clips) === "[false]", `a clip link that points elsewhere is dropped: ${JSON.stringify(d.clips)}`);
  });
  await check("v1.12 a clip's stable address redirects to its signed link on Symphony's storage, and nothing else", async () => {
    const r = await fetch(`${base}/api/symphony/clips/sym-a--song-one`, { redirect: "manual" });
    assert(r.status === 302 && r.headers.get("location") === `${symBase}/storage/hooks/sym-a--song-one.m4a?token=signed` && r.headers.get("cache-control") === "no-store", `the hook: ${r.status} ${r.headers.get("location")}`);
    const two = await fetch(`${base}/api/symphony/clips/sym-a--song-one?part=1`, { redirect: "manual" });
    assert(two.status === 302 && two.headers.get("location").includes("sym-a--song-one-2.m4a"), `part 2: ${two.headers.get("location")}`);
    const audio = await fetch(`${base}/api/symphony/clips/sym-a--song-one`);
    assert(audio.ok && audio.headers.get("content-type") === "audio/mp4" && Buffer.from(await audio.arrayBuffer()).equals(SYM_CLIP_1), "following it plays the clip");
    for (const path of ["sym-a--song-one?part=2", "sym-a--song-one?part=-1", "sym-a--song-one?part=x", "nope", "sym-c--no-hook", "sym-d--elsewhere", "..%2Fetc", "Bad%20Id!"]) {
      const bad = await fetch(`${base}/api/symphony/clips/${path}`, { redirect: "manual" });
      assert(bad.status === 404, `${path} answered ${bad.status}`);
    }
  });
  await check("v1.13.2 the page asks where a clip plays from: this app's own clip address, which doesn't expire, never the code or a signed link", async () => {
    const hook = await fetch(`${base}/api/symphony/clip-url?id=sym-a--song-one`);
    assert(hook.ok && hook.headers.get("cache-control") === "no-store", `the hook: ${hook.status}`);
    assert(JSON.stringify(await hook.json()) === JSON.stringify({ found: true, url: "/api/symphony/clips/sym-a--song-one" }), "the hook's address");
    const two = await getJson("/api/symphony/clip-url?id=sym-a--song-one&part=1");
    assert(JSON.stringify(two) === JSON.stringify({ found: true, url: "/api/symphony/clips/sym-a--song-one?part=1" }), `part 2, with no expiresAt: ${JSON.stringify(two)}`);
    for (const q of ["id=sym-a--song-one&part=2", "id=sym-a--song-one&part=-1", "id=sym-a--song-one&part=x", "id=nope", "id=sym-c--no-hook", "id=sym-d--elsewhere", "id=..%2Fetc", "id=Bad%20Id!", ""]) {
      const r = await fetch(`${base}/api/symphony/clip-url?${q}`);
      const text = await r.text();
      assert(r.status === 404 && text === JSON.stringify({ found: false, url: "", error: "clip not found" }) && !text.includes("token=") && !text.includes(SYM_CODE), `${q} answered ${r.status} ${text}`);
    }
  });
  await check("v1.12 with no songs folder, new covers and Shuffle pick Symphony's songs, New hot first, each with its hook clip", async () => {
    const list = await getJson("/api/songs");
    assert(list.connected === false && list.source === "symphony" && list.songs.map((s) => s.id).join(",") === "sym-b--song-two,sym-a--song-one", `picks: ${JSON.stringify(list)}`);
    const a = list.songs.find((s) => s.id === "sym-a--song-one");
    assert(a.hookFile === "symphony:sym-a--song-one" && a.clipUrl === "/api/symphony/clips/sym-a--song-one" && a.spotifyUrl.includes("open.spotify.com") && a.replayPeak === 47, JSON.stringify(a));
    symCover = await newItem("symphony-new.png");
    assert(symCover.songSource === "downloaded" && /^symphony:sym-/.test(symCover.songFile) && symCover.songPreviewUrl === `/api/symphony/clips/${symCover.songFile.slice(9)}`, `a new cover: ${JSON.stringify(symCover)}`);
    assert(symCover.songHook && symCover.songHook.end > symCover.songHook.start && / - /.test(symCover.song), `with its hook: ${JSON.stringify(symCover.songHook)}`);
    const shuffled = (await postJson(`/api/items/${symCover.id}/edit`, { shuffleSong: true })).item;
    assert(/^symphony:sym-/.test(shuffled.songFile) && shuffled.songSource === "downloaded", `shuffle: ${JSON.stringify(shuffled)}`);
  });
  await check("v1.12 a typed song on Symphony's list gets its clip, Use on this cover and undo send it whole, and a bad id is refused", async () => {
    const typed = (await postJson(`/api/items/${symCover.id}/edit`, { song: "sym artist a - song one" })).item;
    assert(typed.songFile === "symphony:sym-a--song-one" && typed.songHook.start === 44.4 && typed.songHook.end === 59.4 && typed.songPreviewUrl === "/api/symphony/clips/sym-a--song-one", JSON.stringify(typed));
    const use = { song: "Sym Artist B - Song Two", songFile: "symphony:sym-b--song-two", songHook: { start: 12, end: 27 }, songPreviewUrl: "/api/symphony/clips/sym-b--song-two", songSpotifyUrl: "", songSource: "downloaded" };
    const used = (await postJson(`/api/items/${symCover.id}/edit`, use)).item;
    assert(used.song === use.song && used.songFile === use.songFile && used.songHook.end === 27 && used.songPreviewUrl === use.songPreviewUrl && used.songSource === "downloaded", `use on this cover: ${JSON.stringify(used)}`);
    const back = (await postJson(`/api/items/${symCover.id}/edit`, { song: typed.song, songFile: typed.songFile, songHook: typed.songHook, songPreviewUrl: typed.songPreviewUrl, songSpotifyUrl: typed.songSpotifyUrl, songSource: "downloaded" })).item;
    assert(back.songFile === "symphony:sym-a--song-one" && back.songHook.start === 44.4, `undo: ${JSON.stringify(back)}`);
    for (const songFile of ["symphony:../x", "symphony:", "symphony:Bad Id!"]) {
      const bad = await fetch(`${base}/api/items/${symCover.id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song: "x", songFile, songHook: { start: 1, end: 2 }, note: "changed" }) });
      assert(bad.status === 400, `${songFile} answered ${bad.status}`);
    }
    const noHook = await fetch(`${base}/api/items/${symCover.id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song: "x", songFile: "symphony:sym-a--song-one" }) });
    assert(noHook.status === 400, `a clip with no hook answered ${noHook.status}`);
    const after = (await getJson("/api/items?status=queue")).items.find((i) => i.id === symCover.id);
    assert(after.songFile === "symphony:sym-a--song-one" && after.note !== "changed", "a refused edit changes nothing");
  });
  await check("v1.12 the Compose check counts a Symphony song as in the pool", async () => {
    const yes = await postJson(`/api/items/${symCover.id}/verify`, {});
    assert(yes.item.beacons.SONG_IN_POOL === true, JSON.stringify(yes.item.beacons));
  });
  await check("v1.12 a connected songs folder wins over Symphony, and disconnecting it brings Symphony's picks back", async () => {
    await postJson(`/api/songs/folder`, { folder: SONGS });
    try {
      const list = await getJson("/api/songs");
      assert(list.source === "folder" && list.songs.every((s) => s.hookFile.startsWith("hooks/")), `the folder's songs: ${JSON.stringify(list.songs.map((s) => s.hookFile))}`);
      const fromFolder = await newItem("symphony-folder.png");
      assert(/^hooks\//.test(fromFolder.songFile), `the folder wins: ${fromFolder.songFile}`);
      const r = await fetch(`${base}/api/symphony/clips/sym-a--song-one`, { redirect: "manual" });
      assert(r.status === 302, "a cover's Symphony clip still plays");
    } finally {
      await postJson(`/api/songs/folder`, { folder: null });
    }
    assert((await getJson("/api/songs")).source === "symphony", "Symphony's picks are back");
  });
  await check("v1.12 the feed is read at most once per 30 minutes, and again before a redirect when its links are about to expire", async () => {
    const reads = sym.reads;
    for (let i = 0; i < 3; i++) { await getJson("/api/symphony"); await fetch(`${base}/api/symphony/clips/sym-b--song-two`, { redirect: "manual" }); await newItem(`symphony-cache-${i}.png`); }
    assert(sym.reads === reads, `read ${sym.reads - reads} more times`);
    sym.expiresIn = 5 * 60 * 1000; // inside the 10 minute margin
    try {
      assert((await symConnect(SYM_CODE)).ok, "reconnected");
      const before = sym.reads;
      const r = await fetch(`${base}/api/symphony/clips/sym-b--song-two`, { redirect: "manual" });
      assert(r.status === 302 && sym.reads === before + 1, `links about to expire are read again first: ${r.status}, ${sym.reads - before} reads`);
    } finally {
      sym.expiresIn = 24 * 3600 * 1000;
      await symConnect(SYM_CODE);
    }
  });
  await check("v1.12 a code that stops working disconnects Symphony with the reason, and covers keep their songs", async () => {
    sym.expiresIn = 5 * 60 * 1000;
    await symConnect(SYM_CODE);
    sym.revoked = true;
    try {
      const r = await fetch(`${base}/api/symphony/clips/sym-a--song-one`, { redirect: "manual" });
      assert(r.status === 404, `no clip once the code fails: ${r.status}`);
      const st = await getJson("/api/connectors/symphony");
      assert(st.connected === false && st.revoked === true && /doesn't work anymore/.test(st.message), JSON.stringify(st));
      assert(!readFileSync(join(DATA, "settings.json"), "utf8").includes(SYM_CODE), "the dead code is gone from settings");
      const kept = (await getJson("/api/items?status=queue")).items.find((i) => i.id === symCover.id);
      assert(kept.songFile === "symphony:sym-a--song-one" && / - /.test(kept.song), "covers keep their songs");
      const later = await newItem("symphony-revoked.png");
      assert(!String(later.songFile || "").startsWith("symphony:"), `no Symphony picks: ${later.songFile}`);
    } finally {
      sym.revoked = false;
      sym.expiresIn = 24 * 3600 * 1000;
    }
  });
  await check("v1.12 disconnecting removes the code, the Songs data and the picks, and covers keep their songs", async () => {
    assert((await symConnect(SYM_CODE)).ok, "connected again");
    const off = await (await symConnect(null)).json();
    assert(off.ok && off.connected === false && off.revoked === false, JSON.stringify(off));
    assert(!readFileSync(join(DATA, "settings.json"), "utf8").includes(SYM_CODE), "the code is gone");
    const page = await getJson("/api/symphony");
    assert(page.connected === false && page.songs.length === 0, "no Songs data");
    assert((await fetch(`${base}/api/symphony/clips/sym-a--song-one`, { redirect: "manual" })).status === 404, "no clips");
    assert((await fetch(`${base}/api/symphony/clip-url?id=sym-a--song-one`)).status === 404, "no clip addresses");
    const kept = (await getJson("/api/items?status=queue")).items.find((i) => i.id === symCover.id);
    assert(kept.songFile === "symphony:sym-a--song-one", "nothing stored is rewritten");
  });
  await check("v1.13.1 undo can put back a song source a ported space keeps, such as manual", async () => {
    const item = await newItem("source-manual.png");
    const back = (await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else", songPreviewUrl: "", songSpotifyUrl: "", songFile: null, songHook: null, songSource: "manual" })).item;
    assert(back.songSource === "manual", `manual comes back with undo: ${back.songSource}`);
    const odd = (await postJson(`/api/items/${item.id}/edit`, { song: "Someone - Else", songSource: "made-up" })).item;
    assert(odd.songSource === "manual", `a source that isn't known is ignored: ${odd.songSource}`);
  });
  await check("v1.4 a rating can be cleared, so undo can take back a first rating", async () => {
    const item = await newItem("quill-rate.png");
    const r = await postJson(`/api/items/${item.id}/rate`, { songRating: 6 });
    assert(r.item.songRating === 6, "rated");
    const cleared = await postJson(`/api/items/${item.id}/rate`, { songRating: null });
    assert(cleared.item.songRating === null, `cleared to ${cleared.item.songRating}`);
  });
  // 1.21.0: a remix makes no copy any more, so Reject and revise is what makes a new version now.
  await check("v1.4 a revision is its own cover: removing its slide keeps the original's, and it isn't booked with Pollen", async () => {
    const item = await newItem("quill-remix.png");
    const form = new FormData();
    form.append("slide", new Blob([PNG_1PX], { type: "image/png" }), "remix-slide.png");
    await (await fetch(`${base}/api/items/${item.id}/slides`, { method: "POST", body: form })).json();
    await postJson(`/api/items/${item.id}/verify`); // a checked cover: its check and its stamp stay with it (1.13.9)
    const remix = (await postJson(`/api/items/${item.id}/reject-revise`, { note: "again" })).item;
    assert(remix.parentId === item.id && remix.revision === 2, `a new version: ${JSON.stringify([remix.parentId, remix.revision])}`);
    await postJson(`/api/items/${remix.id}/slides/0/remove`, {});
    const original = (await (await fetch(`${base}/api/items?status=rejected`)).json()).items.find((i) => i.id === item.id);
    assert(!original.slides[0].deletedAt, "removing the remix's slide removed the original's too");
    assert(remix.pollen == null && remix.pollenRender == null && remix.beacons == null && remix.composeAttestedAt == null && remix.beaconsVersion == null
      && remix.rationale == null, // 1.21.0: the check's caveman lines are check state too
      `remix carries Pollen or check state: ${JSON.stringify([remix.pollen, remix.pollenRender, remix.beacons, remix.composeAttestedAt, remix.beaconsVersion, remix.rationale])}`);
  });
  await check("trending refresh saves", async () => {
    const r = await (await fetch(`${base}/api/trending/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs: [{ title: "Smoke Song", artist: "Tester" }], source: "smoke" }) })).json();
    assert(r.trending.songs[0].title === "Smoke Song", "trending should save");
    assert(readFileSync(join(DATA, "trending-instagram.json"), "utf8") === seedBefore, "the shipped trending seed must stay untouched so updates never collide with it");
    assert(existsSync(join(DATA, "trending.json")), "refreshed trending should live in data/trending.json");
    const t = await (await fetch(`${base}/api/trending`)).json();
    assert(t.songs[0].title === "Smoke Song", "the refreshed list should be the one in use");
  });
  await check("quote toggle locked, quiz generalized, steal unlocks", async () => {
    const items = await (await fetch(`${base}/api/items?status=queue`)).json();
    const id = items.items[0].id;
    const st0 = await (await fetch(`${base}/api/quotes/status`)).json();
    assert(st0.unlocked === false, "quotes should start locked");
    const quiz = await (await fetch(`${base}/api/quiz/quotes`)).json();
    assert(quiz.quotes.length > 100, "quiz pool should be large");
    assert(!quiz.quotes.some((q) => /arjang|firerugs|modeling contract/i.test(q.text)), "quiz pool must exclude Arjang specific quotes");
    const locked = await fetch(`${base}/api/items/${id}/quote-toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showQuote: true }) });
    assert(locked.status === 403, "toggle on should be refused while locked");
    assert(st0.quoteOverlay === null, `the one switch for every cover starts unset: ${st0.quoteOverlay}`);
    const lockedAll = await fetch(`${base}/api/settings/quote-overlay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: true }) });
    assert(lockedAll.status === 403, `the one switch can't turn quotes on while they're locked: ${lockedAll.status}`);
    // 1.13.9 (Quill #725): while locked the server checks no quote; the first quote she keeps rechecks every checked cover.
    const lockedCover = await newItem("lock-quiz.png");
    const lockedCheck = (await postJson(`/api/items/${lockedCover.id}/verify`)).item;
    assert(lockedCheck.beacons.QUOTE_IN_STOCK === null, `locked: NOT NEEDED: ${JSON.stringify(lockedCheck.beacons)}`);
    await fetch(`${base}/api/quiz/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: quiz.quotes[0].text, keep: true }) });
    const st1 = await (await fetch(`${base}/api/quotes/status`)).json();
    assert(st1.unlocked === true && st1.creatorQuoteCount >= 1, "stealing one quote should unlock");
    const unlockedCheck = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === lockedCover.id);
    assert(unlockedCheck.beacons.QUOTE_IN_STOCK !== null && unlockedCheck.showQuote === lockedCheck.showQuote && unlockedCheck.showQuoteSet === lockedCheck.showQuoteSet,
      `keeping her first quote rechecks a checked cover, beacons only: ${JSON.stringify(unlockedCheck.beacons)}`);
    const on = await (await fetch(`${base}/api/items/${id}/quote-toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showQuote: true }) })).json();
    assert(on.item.showQuote === true, "toggle should save once unlocked");
  });
  await check("v1.5.1 connect merges by default; with replace her list becomes exactly the quotes sent", async () => {
    const before = await (await fetch(`${base}/api/quotes/status`)).json();
    const merged = await postJson("/api/quotes/connect", { quotes: ["Old line one", "Old line two"] });
    assert(merged.creatorQuoteCount === before.creatorQuoteCount + 2, `connect without replace should still merge: ${merged.creatorQuoteCount}`);
    const replaced = await postJson("/api/quotes/connect", { quotes: ["New line A", "New line B", " New line C ", "New line B"], replace: true });
    assert(replaced.creatorQuoteCount === 3, `replace should leave exactly the 3 distinct quotes sent: ${replaced.creatorQuoteCount}`);
    const list = (await (await fetch(`${base}/api/quotes`)).json()).quotes.map((q) => q.text);
    assert(JSON.stringify(list) === JSON.stringify(["New line A", "New line B", "New line C"]), `her list should be only the new quotes, in order: ${list}`);
    assert(replaced.unlocked === true && replaced.quizRemaining === before.quizRemaining, "replace leaves the quiz verdicts and the unlock as they were");
    const empty = await fetch(`${base}/api/quotes/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quotes: [], replace: true }) });
    assert(empty.status === 400, `an empty replace must be refused, not wipe her list: ${empty.status}`);
    assert((await (await fetch(`${base}/api/quotes/status`)).json()).creatorQuoteCount === 3, "a refused replace changes nothing");
  });
  await check("v1.5.2 a cover with the quote off doesn't need a quote in stock; flipping the quote rechecks a checked cover", async () => {
    const item = await newItem("quote-off.png");
    await postJson(`/api/items/${item.id}/edit`, { quote: "i just logged onto instagram" });
    await postJson(`/api/items/${item.id}/quote-toggle`, { showQuote: false }); // quotes show by default since 1.13.9
    const off = (await postJson(`/api/items/${item.id}/verify`)).beacons;
    assert(off.QUOTE_IN_STOCK === null, `quote off: the stock check doesn't apply: ${JSON.stringify(off)}`);
    assert(off.STEPS_VERIFIED === (off.SONG_IN_POOL === true), `quote off: the steps rest on the image and the song: ${JSON.stringify(off)}`);
    const on = (await postJson(`/api/items/${item.id}/quote-toggle`, { showQuote: true })).item;
    assert(on.beacons?.QUOTE_IN_STOCK === false && on.beacons.STEPS_VERIFIED === false, `turning the quote on rechecks it: ${JSON.stringify(on.beacons)}`);
    const stock = (await (await fetch(`${base}/api/quotes`)).json()).quotes[0].text;
    await postJson(`/api/items/${item.id}/edit`, { quote: stock });
    assert((await postJson(`/api/items/${item.id}/verify`)).beacons.QUOTE_IN_STOCK === true, "quote on and from her list: in stock");
    const back = (await postJson(`/api/items/${item.id}/quote-toggle`, { showQuote: false })).item;
    assert(back.beacons?.QUOTE_IN_STOCK === null, `turning the quote off rechecks it too: ${JSON.stringify(back.beacons)}`);
    const fresh = await newItem("never-checked.png");
    const flipped = (await postJson(`/api/items/${fresh.id}/quote-toggle`, { showQuote: true })).item;
    assert(flipped.beacons == null && flipped.composeAttestedAt == null, "a cover nobody checked stays unchecked when its quote flips");
  });
  // ---------- v1.13: her last choice on Quote on the cover carries over (Arjang via Rose #559 and #567, Quill #562 and #569) ----------
  // ---------- v1.13.9: quotes on by default, a tap per post, hold for global hide (Arjang via Rose #693 and #694, Quill #695 and #696) ----------
  await check("v1.13.9 quotes show unless a post was turned off; a tap marks only that post, undo can unmark it, and the old carry-over is gone", async () => {
    const stock = (await (await fetch(`${base}/api/quotes`)).json()).quotes[0].text;
    const [a, b] = [await newItem("tq-a.png"), await newItem("tq-b.png")];
    for (const c of [a, b]) await postJson(`/api/items/${c.id}/edit`, { quote: stock, description: "a beach at dusk" });
    const promptOf = async (id) => (await (await fetch(`${base}/api/items/${id}/caption-prompt`)).json()).prompt;
    const voiceBefore = (await (await fetch(`${base}/api/settings/caption-voice`)).json()).voice;
    await postJson("/api/settings/caption-voice", { voice: "short and warm" }); // with a voice, a hidden quote stays out of the prompt
    try {
      assert(!a.showQuoteSet && (await promptOf(a.id)).includes(stock), "an unmarked cover shows its quote, so its caption is about it");
      const checked = (await postJson(`/api/items/${a.id}/verify`)).item;
      assert(checked.beacons.QUOTE_IN_STOCK === true, `an unmarked cover's quote is checked: ${JSON.stringify(checked.beacons)}`);
      const off = await postJson(`/api/items/${a.id}/quote-toggle`, { showQuote: false });
      assert(off.item.showQuote === false && off.item.showQuoteSet === true && off.item.beacons.QUOTE_IN_STOCK === null, `a tap turns that post off, marked, NOT NEEDED: ${JSON.stringify(off.item.beacons)}`);
      assert(!(await promptOf(a.id)).includes(stock) && (await promptOf(b.id)).includes(stock), "only that post: the other cover still shows its quote");
      const back = await postJson(`/api/items/${a.id}/quote-toggle`, { showQuote: false, set: false });
      assert(back.item.showQuoteSet === false && back.item.beacons.QUOTE_IN_STOCK === true && (await promptOf(a.id)).includes(stock), "undo can unmark it: it shows and is checked again");
      const old = await postJson(`/api/items/${b.id}/quote-toggle`, { from: "default" });
      assert(old.applied === false && !old.item.showQuoteSet, `the 1.13.0 carry-over is gone: an old page's call changes nothing: ${JSON.stringify(old).slice(0, 200)}`);
      assert(!("quoteDefault" in (await (await fetch(`${base}/api/quotes/status`)).json())), "no learned default any more");
    } finally {
      await postJson("/api/settings/caption-voice", { voice: voiceBefore || "" });
    }
  });
  // ---------- v1.13.9: the one-time recheck of saved compose checks (Quill #706, #707 and #719) ----------
  // A copy saved before 1.13.9: its checks were made when every post started with its quote off.
  await check("v1.13.9 recheck: each cover with a saved check is rechecked once, beacons only, a cover still verified keeps when it was, and the tally counts covers and values", async () => {
    const stock = "soft light on slow water";
    const before = { QUOTE_IN_STOCK: null, SONG_IN_POOL: true, STEPS_VERIFIED: true }; // checked with the quote off
    const cover = (id, more) => ({ id, status: "queue", quote: stock, song: "Someone - Something", songSource: "trending", imageUrl: `/uploads/old-${id}.png`,
      showQuote: false, beacons: { ...before }, composeAttestedAt: 1000, ...more });
    const rows = [
      cover(1), // unmarked: it shows its quote now, and the quote is on her list
      cover(2, { quote: "words that are not on her list" }), // unmarked: it shows a quote that isn't on her list
      cover(3, { status: "approved", showQuoteSet: true }), // she turned it off: it stays NOT NEEDED
      cover(4, { status: "rejected", showQuote: true, beacons: { QUOTE_IN_STOCK: true, SONG_IN_POOL: true, STEPS_VERIFIED: true } }), // already right
      cover(5, { beacons: null, composeAttestedAt: null }), // never checked: left alone
    ];
    await withCopy(4198, (dir) => {
      writeFileSync(join(dir, "quotes.json"), JSON.stringify([{ text: stock, source: "connected" }])); // her own quotes: unlocked
      writeFileSync(join(dir, "db.json"), JSON.stringify({ items: rows, voiceSamples: [], nextId: 6 }));
    }, async ({ dir, get, post }) => {
      const all = async () => Object.fromEntries((await Promise.all(["queue", "approved", "rejected"].map((s) => get(`/api/items?status=${s}`)))).flatMap((r) => r.items).map((i) => [i.id, i]));
      const first = await get("/api/beacons/wanted");
      assert(first.ids?.join(",") === "1,2,3,4", `every cover with a saved check is wanted, whatever its status: ${JSON.stringify(first).slice(0, 200)}`);
      assert(JSON.stringify(first.recheck) === JSON.stringify({ rechecked: 0, coversChanged: 0, valuesChanged: 0 }), `the tally starts at zero: ${JSON.stringify(first.recheck)}`);
      const r1 = await post("/api/items/1/recheck");
      assert(r1.rechecked === true && r1.changed?.join(",") === "QUOTE_IN_STOCK,WHY_WRITTEN" && r1.item.beacons.QUOTE_IN_STOCK === true && r1.item.beacons.STEPS_VERIFIED === true,
        `an unmarked cover's quote is checked now: ${JSON.stringify(r1).slice(0, 300)}`);
      assert(r1.item.composeAttestedAt === 1000 && r1.item.beaconsVersion === 2, `still verified, so it keeps when it was, and it's stamped: ${r1.item.composeAttestedAt} ${r1.item.beaconsVersion}`);
      const r2 = await post("/api/items/2/recheck");
      assert(r2.changed?.join(",") === "QUOTE_IN_STOCK,STEPS_VERIFIED,WHY_WRITTEN" && r2.item.beacons.QUOTE_IN_STOCK === false && r2.item.composeAttestedAt === null,
        `a quote that isn't on her list fails the check now: ${JSON.stringify(r2).slice(0, 300)}`);
      const [r3, r4] = [await post("/api/items/3/recheck"), await post("/api/items/4/recheck")];
      assert(r3.rechecked === true && r3.changed?.join(",") === "WHY_WRITTEN" && r3.item.beacons.QUOTE_IN_STOCK === null, `a post she turned off stays NOT NEEDED: ${JSON.stringify(r3).slice(0, 300)}`);
      assert(r4.rechecked === true && r4.changed?.join(",") === "WHY_WRITTEN", `a check that was already right is rechecked and stays, and gains the 4th check (1.25.0): ${JSON.stringify(r4).slice(0, 300)}`);
      const r5 = await post("/api/items/5/recheck");
      assert(r5.rechecked === false && r5.reason === "done" && r5.item.beacons == null, `a cover nobody checked is left alone: ${JSON.stringify(r5).slice(0, 300)}`);
      const again = await post("/api/items/1/recheck");
      assert(again.rechecked === false && again.reason === "done", "a cover is rechecked once");
      const after = await get("/api/beacons/wanted");
      assert(after.ids.length === 0 && JSON.stringify(after.recheck) === JSON.stringify({ rechecked: 4, coversChanged: 4, valuesChanged: 7 }), `the tally (1.25.0: each gains Why it matches): ${JSON.stringify(after)}`);
      const now = await all();
      for (const row of rows) {
        const n = now[row.id];
        assert(n.showQuote === row.showQuote && n.showQuoteSet === row.showQuoteSet && n.status === row.status && n.quote === row.quote,
          `beacons only, never her choices: ${JSON.stringify(n).slice(0, 300)}`);
      }
      assert(!("beaconsVersion" in now[5]), "a cover nobody checked gets no stamp");
      const saved = JSON.parse(readFileSync(join(dir, "db.json"), "utf8")).items;
      assert(saved.filter((i) => i.beaconsVersion === 2).map((i) => i.id).join(",") === "1,2,3,4", "the stamps are saved");
      const checked = await post("/api/items/5/verify");
      assert(checked.item.beaconsVersion === 2 && (await get("/api/beacons/wanted")).ids.length === 0, "a check made now is stamped, so it's never wanted");
    });
  });
  // ---------- v1.13.9: the quote lock on the server (Quill #725) ----------
  await check("v1.13.9 quote lock: while quotes are locked the server checks no quote and the caption reads none; connecting quotes rechecks every checked cover, beacons only", async () => {
    const stock = "soft light on slow water";
    const plain = { status: "queue", quote: stock, song: "Someone - Something", songSource: "trending", showQuote: false, beacons: null, composeAttestedAt: null };
    await withCopy(4197, (dir) => {
      writeFileSync(join(dir, "db.json"), JSON.stringify({ items: [{ id: 1, imageUrl: "/uploads/lock-1.png", ...plain }, { id: 2, imageUrl: "/uploads/lock-2.png", ...plain }],
        voiceSamples: [], nextId: 3 }));
    }, async ({ get, post }) => {
      const status = await get("/api/quotes/status");
      assert(status.unlocked === false, "a fresh copy starts locked");
      const locked = await post("/api/items/1/verify");
      assert(locked.beacons.QUOTE_IN_STOCK === null && locked.beacons.STEPS_VERIFIED === true, `locked: no quote is drawn, so NOT NEEDED: ${JSON.stringify(locked.beacons)}`);
      await post("/api/settings/caption-voice", { voice: "Warm and short." });
      const lockedPrompt = (await get("/api/items/1/caption-prompt")).prompt;
      assert(!lockedPrompt.includes(stock) && lockedPrompt.includes("no text on this cover"), `locked: the caption reads no text on the cover: ${lockedPrompt.slice(0, 300)}`);
      const when = locked.item.composeAttestedAt;
      const connected = await post("/api/quotes/connect", { quotes: [stock] });
      assert(connected.unlocked === true, "connecting her quotes unlocks them");
      const items = (await get("/api/items?status=queue")).items;
      const [one, two] = [items.find((i) => i.id === 1), items.find((i) => i.id === 2)];
      assert(one.beacons.QUOTE_IN_STOCK === true && one.composeAttestedAt === when, `unlocking rechecks a checked cover, and a cover still verified keeps when it was: ${JSON.stringify(one.beacons)}`);
      assert(one.showQuote === false && !("showQuoteSet" in one), "beacons only: her choices stay as they were");
      assert(two.beacons == null, "a cover nobody checked stays unchecked");
      assert((await get("/api/items/1/caption-prompt")).prompt.includes(stock), "unlocked: the caption is about the quote again");
    });
  });
  // ---------- v1.13.8: default text placement (Arjang #559 item 6, Quill #685 and #687) ----------
  await check("v1.13.8 placement: unstamped queue covers are wanted, this copy has no model, and an answer moves only center, align, size and lines, then stamps", async () => {
    const [p, q, r] = [await newItem("place-p.png"), await newItem("place-q.png"), await newItem("place-r.png")];
    const wanted = async () => (await (await fetch(`${base}/api/placements/wanted`)).json()).ids.filter((id) => [p.id, q.id, r.id].includes(id)).join(",");
    assert(p.textPlacementVersion === 0, `a new cover starts unstamped: ${p.textPlacementVersion}`);
    assert(await wanted() === [p.id, q.id, r.id].join(","), `every unstamped queue cover is wanted: ${await wanted()}`);
    const fill = await postJson(`/api/items/${p.id}/placement-fill`, {});
    assert(fill.placed === false && fill.reason === "no-model", `this copy has no model: ${JSON.stringify(fill).slice(0, 200)}`);
    const ask = await (await fetch(`${base}/api/items/${p.id}/placement-prompt`)).json();
    assert(/face or a head/.test(ask.prompt) && /needsChange/.test(ask.prompt) && /15\.625/.test(ask.prompt) && ask.imageUrl === p.imageUrl, `the prompt carries the rules and the photo: ${JSON.stringify(ask).slice(0, 300)}`);
    await postJson(`/api/items/${p.id}/edit`, { quote: "soft light on the water" });
    await postJson(`/api/items/${p.id}/style`, { textColor: "#FB0909", textFont: "serif" });
    const moved = await postJson(`/api/items/${p.id}/placement`, { fields: { horizontalPosition: 22, verticalPosition: 71, textAlign: "left", fontSize: 44, lineCount: 3,
      textColor: "#FFFFFF", textFont: "tiktok", quote: "not hers", opacity: 40 } });
    const m = moved.item;
    assert(moved.saved === true && moved.changed === true && m.textPlacementVersion === 1, `an answer saves and stamps: ${JSON.stringify(moved).slice(0, 200)}`);
    assert(m.horizontalPosition === 22 && m.verticalPosition === 71 && m.textAlign === "left" && m.fontSize === 44 && m.lineCount === 3, "center, align, size and lines land");
    assert(m.textColor === "#FB0909" && m.textFont === "serif" && m.quote === "soft light on the water" && m.opacity === 100, "color, font, quote and the rest are never touched");
    assert(!(await wanted()).split(",").includes(String(p.id)), "a stamped cover isn't wanted again");
    const twice = await postJson(`/api/items/${p.id}/placement`, { fields: { horizontalPosition: 80 } });
    assert(twice.saved === false && twice.reason === "done" && twice.item.horizontalPosition === 22, "a stamped cover keeps its placement");
    assert((await postJson(`/api/items/${p.id}/placement-fill`, {})).reason === "done", "a stamped cover needs no fill");
    const ready = await postJson(`/api/items/${q.id}/placement`, { fields: null });
    assert(ready.saved === true && ready.changed === false && ready.item.textPlacementVersion === 1 && ready.item.horizontalPosition === 50 && ready.item.lineCount === 0,
      `ready: only the stamp advances: ${JSON.stringify(ready).slice(0, 200)}`);
    await postJson(`/api/items/${r.id}/decide`, { decision: "approved" });
    assert(!(await wanted()).split(",").includes(String(r.id)), "an approved cover isn't wanted");
    const late = await postJson(`/api/items/${r.id}/placement`, { fields: { horizontalPosition: 10 } });
    assert(late.saved === false && late.reason === "done" && late.item.horizontalPosition === 50, "only queue covers take a placement");
    await postJson(`/api/items/${r.id}/decide`, { decision: "queue" });
    const wild = await postJson(`/api/items/${r.id}/placement`, { fields: { horizontalPosition: 140, verticalPosition: -5, textAlign: "diagonal", fontSize: 300, lineCount: 12 } });
    const w = wild.item;
    assert(w.horizontalPosition === 100 && w.verticalPosition === 0 && w.textAlign === "center" && w.fontSize === 110 && w.lineCount === 8, `out of range answers are held to the ranges: ${JSON.stringify(w).slice(0, 200)}`);
    const tiny = await newItem("place-s.png");
    const low = await postJson(`/api/items/${tiny.id}/placement`, { fields: { fontSize: 2, lineCount: 0 } });
    assert(low.item.fontSize === 8 && low.item.lineCount === 1, `size 8 to 110, and the pass writes 1 to 8 lines: ${low.item.fontSize} ${low.item.lineCount}`);
  });
  // ---------- v1.13.3, as 1.13.9 reads it: false is global hide (Arjang #621 and #630, Quill #624, #695 and #696) ----------
  await check("v1.13.3 global hide: false hides every quote without touching a post, unset gives each post its own back, and true no longer forces quotes on", async () => {
    const status = async () => (await fetch(`${base}/api/quotes/status`)).json();
    const stock = (await (await fetch(`${base}/api/quotes`)).json()).quotes[0].text;
    const [x, y] = [await newItem("all-x.png"), await newItem("all-y.png")];
    for (const c of [x, y]) await postJson(`/api/items/${c.id}/edit`, { quote: stock, description: "a beach at dusk" });
    await postJson(`/api/items/${x.id}/quote-toggle`, { showQuote: false });
    for (const c of [x, y]) await postJson(`/api/items/${c.id}/verify`);
    const fresh = await newItem("all-z.png");
    const voiceBefore = (await (await fetch(`${base}/api/settings/caption-voice`)).json()).voice;
    await postJson("/api/settings/caption-voice", { voice: "short and warm" });
    const shownOf = async (id) => (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === id);
    const stockOf = async (id) => (await shownOf(id)).beacons?.QUOTE_IN_STOCK;
    const ids = (r) => (r.items || []).map((i) => i.id).filter((id) => [x.id, y.id, fresh.id].includes(id)).sort((a, b) => a - b).join(",");
    const yWhen = (await shownOf(y.id)).composeAttestedAt;
    const promptOf = async (id) => (await (await fetch(`${base}/api/items/${id}/caption-prompt`)).json()).prompt;
    try {
      assert(await stockOf(x.id) === null && await stockOf(y.id) === true, "unset: x is turned off, y shows by default");
      const on = await postJson("/api/settings/quote-overlay", { on: true });
      assert(on.quoteOverlay === true && ids(on) === "", `true changes no cover's check: ${ids(on)}`);
      assert(await stockOf(x.id) === null && !(await promptOf(x.id)).includes(stock), "true doesn't force a post she turned off back on");
      const hide = await postJson("/api/settings/quote-overlay", { on: false });
      assert(hide.quoteOverlay === false && (await status()).quoteOverlay === false, "global hide is on");
      assert(await stockOf(x.id) === null && await stockOf(y.id) === null && ids(hide) === String(y.id), `hidden: no cover needs its quote in stock, and only y's check changed: ${ids(hide)}`);
      assert(!(await promptOf(y.id)).includes(stock) && !(await promptOf(x.id)).includes(stock), "hidden: no caption is about a quote");
      assert((await shownOf(fresh.id)).beacons == null, "a cover nobody checked isn't checked by global hide");
      assert((await shownOf(y.id)).composeAttestedAt === yWhen, "a cover that stays verified keeps when it was");
      assert((await shownOf(x.id)).showQuote === false && (await shownOf(x.id)).showQuoteSet === true && !(await shownOf(y.id)).showQuoteSet, "global hide never writes a post");
      const lift = await postJson("/api/settings/quote-overlay", { on: null });
      assert(lift.quoteOverlay === null && await stockOf(x.id) === null && await stockOf(y.id) === true && ids(lift) === String(y.id), "lifting it gives each post its own back");
      assert((await promptOf(y.id)).includes(stock) && !(await promptOf(x.id)).includes(stock), "captions follow each post again");
      for (const bad of [{ on: "yes" }, { on: 1 }, {}]) {
        const r = await fetch(`${base}/api/settings/quote-overlay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad) });
        assert(r.status === 400, `${JSON.stringify(bad)} answered ${r.status}`);
      }
    } finally {
      await postJson("/api/settings/quote-overlay", { on: null }).catch(() => {});
      await postJson("/api/settings/caption-voice", { voice: voiceBefore || "" });
    }
  });
  await check("ubee client workspace plan", async () => {
    await fetch(`${base}/api/workspace/configure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ubee_shared", clientName: "Test Creator" }) });
    const plan = await (await fetch(`${base}/api/drive/plan`)).json();
    assert(plan.mode === "ubee_shared" && plan.root.includes("Test Creator"), "plan should point at her creator folder");
    assert(plan.folders.includes("Approved - Her Picks") && plan.folders.includes("DUMP"), "client folders should be friendly and complete");
    await fetch(`${base}/api/workspace/configure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "own_drive" }) });
  });
  await check("update status reports the version and the update state", async () => {
    const u = await (await fetch(`${base}/api/update`)).json();
    assert(typeof u.current?.version === "string" && u.current.version.length > 0, "current version missing");
    assert(["idle", "checking", "updating", "restarting", "failed"].includes(u.state), `unexpected state ${u.state}`);
    assert(typeof u.available === "boolean" && Array.isArray(u.whatsNew), "available and whatsNew expected");
  });
  await check("v1.13.10 the page tells the app when she's busy or idle, so it can update itself at a quiet moment", async () => {
    const said = await postJson("/api/activity", { busy: true, idleMs: 1200 });
    assert(said.ok === true, `the app hears the page: ${JSON.stringify(said)}`);
    const odd = await fetch(`${base}/api/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busy: "yes", idleMs: -5 }) });
    assert(odd.ok, `odd values never fail; at most they put an update off a minute: ${odd.status}`);
    const u = await (await fetch(`${base}/api/update`)).json();
    assert("failed" in u, `status carries the last failure, or null: ${JSON.stringify(u).slice(0, 200)}`);
  });
  await check("health reports the real version from package.json", async () => {
    const h = await (await fetch(`${base}/api/health`)).json();
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert(h.version === pkg.version, `health says ${h.version}, package.json says ${pkg.version}`);
    assert(typeof h.boot === "string" && h.boot.length >= 8, "health needs a per-start boot id so the page reloads only once the new version answers");
  });
  await check("release.json carries the same version as package.json, with what's new", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const rel = JSON.parse(readFileSync(new URL("../release.json", import.meta.url), "utf8"));
    assert(rel.version === pkg.version, `release.json says ${rel.version}, package.json says ${pkg.version}. Bump both together.`);
    assert(Array.isArray(rel.whatsNew) && rel.whatsNew.length >= 1 && rel.whatsNew.length <= 3, "release.json needs 1 to 3 lines of what's new");
  });
  await check("health and grievance loop", async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert(health.ok === true, "health should respond");
    const g = await (await fetch(`${base}/api/grievances`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "smoke grievance", context: { smoke: true } }) })).json();
    assert(g.grievance.status === "open", "grievance should open");
    assert(g.receipt && g.receipt.id === g.grievance.id, "grievance should return a receipt with the same id");
    assert(typeof g.receipt.receivedAt === "string" && !Number.isNaN(Date.parse(g.receipt.receivedAt)), "receipt should carry an ISO receivedAt time");
    assert(g.grievance.receivedAt === g.receipt.receivedAt, "grievance should store the same receivedAt");
    const resolved = await (await fetch(`${base}/api/grievances/${g.grievance.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution: "smoke resolved" }) })).json();
    assert(resolved.grievance.status === "resolved", "grievance should resolve");
  });
  const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const approvedItem = async (name, caption) => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
    const form = new FormData();
    form.append("photos", new Blob([png], { type: "image/png" }), name);
    const item = (await (await fetch(`${base}/api/items/upload`, { method: "POST", body: form })).json()).created[0];
    await post(`/api/items/${item.id}/decide`, { decision: "approved" });
    if (caption != null) await post(`/api/items/${item.id}/edit`, { caption });
    return item;
  };
  const render = async (id) => {
    const form = new FormData();
    form.append("image", new Blob([TINY_JPEG], { type: "image/jpeg" }), "cover.jpg");
    return (await fetch(`${base}/api/items/${id}/render`, { method: "POST", body: form })).json();
  };
  const pollenOf = async (id) => (await (await fetch(`${base}/api/items?status=approved`)).json()).items.find((i) => i.id === id)?.pollen;

  await check("caption rules match Pollen's: emoji, dash pivots, antithesis, banned words, length", async () => {
    assert(captionProblems("golden hour again").length === 0, "a plain caption should pass");
    assert(captionProblems("a well-known spot, 10-15 minutes away").length === 0, "hyphens inside words are fine");
    assert(captionProblems("golden hour \u2728").some((p) => /emoji/i.test(p)), "emoji should be flagged");
    assert(captionProblems("golden hour - soft energy today").some((p) => /dash/i.test(p)), "a dash pivot should be flagged");
    assert(captionProblems("golden hour \u2014 again").some((p) => /dash/i.test(p)), "an em dash should be flagged");
    assert(captionProblems("it's not a phase, it's a lifestyle").some((p) => /rewrite/i.test(p)), "antithesis should be flagged");
    assert(captionProblems("good vibes only").some((p) => p.includes("vibes")), "banned words should be flagged");
    assert(captionProblems("x".repeat(2201)).some((p) => p.includes("2,200")), "over 2,200 characters should be flagged");
  });
  await check("uBee clients get captions without emoji or a dash tail", async () => {
    await post("/api/voice/samples", { source: "instagram", samples: ["sunset glow \u2728\u2728", "beach glow \u2728", "glow up \u2728"] });
    const own = await approvedItem("own-voice.png");
    assert(/\u2728/.test(own.caption) && own.caption.includes(" - "), `the creator's own style should still apply outside uBee: ${own.caption}`);
    await post("/api/workspace/configure", { mode: "ubee_shared", clientName: "Test Creator" });
    const client = await approvedItem("client-voice.png");
    assert(client.caption && captionProblems(client.caption).length === 0, `uBee client caption breaks Pollen's rules: ${client.caption}`);
    await post("/api/workspace/configure", { mode: "own_drive" });
  });
  await check("pollen: a wrong code is refused with a plain reason and nothing is saved", async () => {
    const r = await post("/api/connectors/pollen", { code: "not-the-right-code-not-the-right-code-0000" });
    const body = await r.json();
    assert(r.status === 401 && /pollen code/i.test(body.error || ""), `expected a plain refusal, got ${r.status} ${JSON.stringify(body)}`);
    const ch = await (await fetch(`${base}/api/pollen/channels`)).json();
    assert(ch.connected === false, "a refused code must not connect");
  });
  await check("pollen: connect lists her channels and the code never comes back out", async () => {
    const r = await (await post("/api/connectors/pollen", { code: hive.code })).json();
    assert(r.ok && r.creator.display_name === "Test Creator" && r.channels.length === 2, `connect failed: ${JSON.stringify(r)}`);
    const ch = await (await fetch(`${base}/api/pollen/channels`)).json();
    assert(ch.connected === true && ch.channels.find((c) => c.id === CH_SUBSTACK).default_on === false, "channels should keep the on/off defaults");
    for (const path of ["/api/health", "/api/pollen/channels", "/api/setup/status", "/api/connectors", "/api/items?status=approved"]) {
      const text = await (await fetch(`${base}${path}`)).text();
      assert(!text.includes(hive.code), `${path} leaked the Pollen code`);
    }
  });
  let first;
  await check("pollen: schedule sends good covers and refuses a caption Pollen would reject, before any upload", async () => {
    first = await approvedItem("cover-a.png", "golden hour again");
    const bad = await approvedItem("cover-b.png", "golden hour \u2728");
    const rendered = await render(first.id);
    assert(rendered.ok && rendered.render.width === 40 && rendered.render.height === 50, `render should save with its real size: ${JSON.stringify(rendered)}`);
    await render(bad.id);
    const out = await (await post("/api/pollen/schedule", { itemIds: [first.id, bad.id], channelIds: [CH_IG] })).json();
    const a = out.results.find((x) => x.itemId === first.id), b = out.results.find((x) => x.itemId === bad.id);
    assert(a.status === "waiting", `good cover should be waiting: ${JSON.stringify(a)}`);
    assert(b.status === "refused" && /emoji/i.test(b.error), `emoji caption should be refused with the reason: ${JSON.stringify(b)}`);
    assert(Object.keys(hive.uploads).length === 1 && hive.requests.length === 1, "only the good cover should reach the Bee Hive");
    const req = hive.requests[0];
    assert(req.caption === "golden hour again" && req.width === 40 && req.height === 50 && req.channel_ids.join() === CH_IG, `request body wrong: ${JSON.stringify(req)}`);
    assert(!(await pollenOf(bad.id)), "a refused cover keeps no Pollen state, so it can be fixed and sent");
  });
  await check("pollen: scheduling the same cover again never sends it twice", async () => {
    const before = hive.submits;
    const out = await (await post("/api/pollen/schedule", { itemIds: [first.id], channelIds: [CH_IG] })).json();
    assert(out.results[0].status === "waiting", `already scheduled cover should report its status: ${JSON.stringify(out.results[0])}`);
    assert(hive.submits === before && hive.requests.length === 1, "no second submit for a cover that is already waiting");
  });
  await check("pollen: a lost answer is retried with the same key and lands once", async () => {
    const c = await approvedItem("cover-c.png", "second light");
    await render(c.id);
    hive.dropSubmitOnce = true;
    const out1 = await (await post("/api/pollen/schedule", { itemIds: [c.id], channelIds: [CH_IG] })).json();
    assert(out1.results[0].status === "not_sent" && out1.results[0].error, `a lost answer should say not sent: ${JSON.stringify(out1.results[0])}`);
    const key = (await pollenOf(c.id)).clientKey;
    const out2 = await (await post("/api/pollen/schedule", { itemIds: [c.id], channelIds: [CH_IG] })).json();
    assert(out2.results[0].status === "waiting", `retry should land: ${JSON.stringify(out2.results[0])}`);
    assert(hive.requests.filter((r) => r.client_key === key).length === 1 && hive.requests.length === 2, "the retry must reuse the key, one request");
  });
  await check("pollen: two taps at once still send a cover only once", async () => {
    const e = await approvedItem("cover-e.png", "double tap");
    await render(e.id);
    const before = hive.requests.length;
    const outs = await Promise.all([1, 2].map(() => post("/api/pollen/schedule", { itemIds: [e.id], channelIds: [CH_IG] }).then((r) => r.json())));
    assert(hive.requests.length === before + 1, `expected one new request, got ${hive.requests.length - before}`);
    assert(outs.some((o) => o.results[0].status === "waiting"), `one tap should land: ${JSON.stringify(outs)}`);
  });
  await check("pollen: a cover needs its render before it can go", async () => {
    const d = await approvedItem("cover-d.png", "no render yet");
    const out = await (await post("/api/pollen/schedule", { itemIds: [d.id], channelIds: [CH_IG] })).json();
    assert(out.results[0].status === "refused" && /render/i.test(out.results[0].error), `expected a render refusal: ${JSON.stringify(out.results[0])}`);
  });
  await check("pollen: status sync fills in the booked day", async () => {
    Object.assign(hive.requests[0], { status: "booked", booked_day: "2026-11-25" });
    await post("/api/pollen/sync", {});
    const p = await pollenOf(first.id);
    assert(p.status === "booked" && p.bookedDay === "2026-11-25", `expected booked 2026-11-25, got ${JSON.stringify(p)}`);
  });
  await check("v1.10 pollen gets the comment call and the caption together, and checks them together", async () => {
    await postJson(`/api/settings/caption-ctas`, { ctas: [CALLS[0]] });
    try {
      const on = await approvedItem("cta-on.png", "golden hour with you");
      await postJson(`/api/items/${on.id}/edit`, { cta: "SLOW" });
      const off = await approvedItem("cta-off.png", "golden hour alone");
      const long = await approvedItem("cta-long.png", "a".repeat(2180));
      await postJson(`/api/items/${long.id}/edit`, { cta: "SLOW" });
      for (const c of [on, off, long]) await render(c.id);
      const checked = await (await post("/api/pollen/check", { itemIds: [on.id, long.id] })).json();
      const cOn = checked.items.find((x) => x.itemId === on.id), cLong = checked.items.find((x) => x.itemId === long.id);
      assert(cOn.problems.length === 0 && cLong.problems.some((p) => p.includes("2,200")), `the call counts toward the limit: ${JSON.stringify(checked)}`);
      assert(cOn.caption === `${CALLS[0].line} golden hour with you`, `the check answers with what posts: ${cOn.caption}`);
      const out = await (await post("/api/pollen/schedule", { itemIds: [on.id, off.id, long.id], channelIds: [CH_IG] })).json();
      assert(out.results.find((x) => x.itemId === long.id).status === "refused", "over the limit with the call is refused before upload");
      const keyOn = (await pollenOf(on.id)).clientKey, keyOff = (await pollenOf(off.id)).clientKey;
      const rOn = hive.requests.find((r) => r.client_key === keyOn), rOff = hive.requests.find((r) => r.client_key === keyOff);
      assert(rOn && rOn.caption === `${CALLS[0].line} golden hour with you`, `on: ${rOn && rOn.caption}`);
      assert(rOff && rOff.caption === "golden hour alone", `off: ${rOff && rOff.caption}`);
    } finally {
      await postJson(`/api/settings/caption-ctas`, { ctas: [] });
    }
  });
  await check("v1.10.1 pollen posts the plain caption when the switch is off, and her line once when it's on", async () => {
    await postJson(`/api/settings/caption-ctas`, { ctas: [CALLS[0]] });
    try {
      const off = await approvedItem("cta-baked-off.png", `${CALLS[0].line} soft rain`);
      const on = await approvedItem("cta-baked-on.png", `${CALLS[0].line} soft sun`);
      await postJson(`/api/items/${on.id}/edit`, { cta: "SLOW" });
      for (const c of [off, on]) await render(c.id);
      const checked = await (await post("/api/pollen/check", { itemIds: [off.id, on.id] })).json();
      const cOff = checked.items.find((x) => x.itemId === off.id), cOn = checked.items.find((x) => x.itemId === on.id);
      assert(cOff.caption === "soft rain", `off: the check answers with the plain caption: ${cOff.caption}`);
      assert(cOn.caption === `${CALLS[0].line} soft sun`, `on: her line once: ${cOn.caption}`);
      await (await post("/api/pollen/schedule", { itemIds: [off.id, on.id], channelIds: [CH_IG] })).json();
      const keyOff = (await pollenOf(off.id)).clientKey, keyOn = (await pollenOf(on.id)).clientKey;
      const rOff = hive.requests.find((r) => r.client_key === keyOff), rOn = hive.requests.find((r) => r.client_key === keyOn);
      assert(rOff && rOff.caption === "soft rain", `off posts the plain caption: ${rOff && rOff.caption}`);
      assert(rOn && rOn.caption === `${CALLS[0].line} soft sun`, `on posts her line once: ${rOn && rOn.caption}`);
      const all = (await (await fetch(`${base}/api/items?status=approved`)).json()).items;
      assert(all.find((i) => i.id === off.id).caption === `${CALLS[0].line} soft rain`, "the build rewrites no stored caption");
    } finally {
      await postJson(`/api/settings/caption-ctas`, { ctas: [] });
    }
  });
  await check("v1.11 while the Bee Hive doesn't take songs, a cover with a clip goes out as before and the check says so", async () => {
    await postJson(`/api/songs/folder`, { folder: SONGS });
    try {
      const cover = await approvedItem("song-off.png", "hook in the dark");
      await postJson(`/api/items/${cover.id}/edit`, { song: "Artist A - Song A" });
      await render(cover.id);
      const c = (await (await post("/api/pollen/check", { itemIds: [cover.id] })).json()).items[0];
      assert(c.hasSongClip === true && c.songGoes === false && c.problems.length === 0, `the check: ${JSON.stringify(c)}`);
      const uploadsBefore = Object.keys(hive.uploads).length;
      await (await post("/api/pollen/schedule", { itemIds: [cover.id], channelIds: [CH_IG] })).json();
      const key = (await pollenOf(cover.id)).clientKey;
      const r = hive.requests.find((x) => x.client_key === key);
      assert(r && !r.song && Object.keys(hive.uploads).length === uploadsBefore + 1, `the cover alone: ${JSON.stringify(r)}`);
    } finally {
      await postJson(`/api/songs/folder`, { folder: null });
    }
  });
  await check("v1.11 once the Bee Hive takes songs, the hook clip goes with the cover, and covers without one go as before", async () => {
    hive.songs = true;
    await postJson(`/api/songs/folder`, { folder: SONGS });
    try {
      await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
      const withSong = await approvedItem("song-on.png", "hook in the light");
      await postJson(`/api/items/${withSong.id}/edit`, { song: "Artist A - Song A" });
      const plain = await approvedItem("song-none.png", "no hook here");
      await postJson(`/api/items/${plain.id}/edit`, { song: "Someone - Else" });
      for (const c of [withSong, plain]) await render(c.id);
      const checked = (await (await post("/api/pollen/check", { itemIds: [withSong.id, plain.id] })).json()).items;
      assert(checked[0].songGoes === true && checked[1].hasSongClip === false && checked[1].songGoes === false, JSON.stringify(checked));
      await (await post("/api/pollen/schedule", { itemIds: [withSong.id, plain.id], channelIds: [CH_IG] })).json();
      const keySong = (await pollenOf(withSong.id)).clientKey, keyPlain = (await pollenOf(plain.id)).clientKey;
      const rSong = hive.requests.find((x) => x.client_key === keySong), rPlain = hive.requests.find((x) => x.client_key === keyPlain);
      assert(rSong && rSong.song && rSong.song.artist === "Artist A" && rSong.song.title === "Song A" && rSong.song.hook_start === 44.2 && rSong.song.hook_end === 59.1 && rSong.song.content_type === "audio/mp4", `the request carries the hook: ${JSON.stringify(rSong)}`);
      assert(hive.uploads[rSong.song.path] && hive.uploads[rSong.song.path].equals(CLIP_A) && hive.uploadTypes[rSong.song.path] === "audio/mp4", "the exact clip is uploaded");
      assert(rPlain && !rPlain.song, `a cover without a clip goes as before: ${JSON.stringify(rPlain)}`);
    } finally {
      await postJson(`/api/songs/folder`, { folder: null });
    }
  });
  await check("v1.11 when the Bee Hive takes songs, a cover whose clip is gone is flagged before anything is sent", async () => {
    await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
    await postJson(`/api/songs/folder`, { folder: SONGS });
    const cover = await approvedItem("song-gone.png", "hook gone");
    await postJson(`/api/items/${cover.id}/edit`, { song: "Artist B - Song B" });
    await render(cover.id);
    await postJson(`/api/songs/folder`, { folder: null });
    try {
      const c = (await (await post("/api/pollen/check", { itemIds: [cover.id] })).json()).items[0];
      assert(c.hasSongClip === true && c.songGoes === false && c.problems.some((p) => /song clip/i.test(p)), `flagged: ${JSON.stringify(c)}`);
      const before = hive.submits;
      const out = (await (await post("/api/pollen/schedule", { itemIds: [cover.id], channelIds: [CH_IG] })).json()).results[0];
      assert(out.status === "refused" && /song clip/i.test(out.error) && hive.submits === before, `refused before sending: ${JSON.stringify(out)}`);
    } finally {
      hive.songs = false;
      await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
    }
  });
  await check("v1.12 once the Bee Hive takes songs, a Symphony clip goes with its cover, fetched from Symphony, and a gone one is flagged", async () => {
    hive.songs = true;
    const r = await fetch(`${base}/api/connectors/symphony`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: SYM_CODE }) });
    assert(r.ok, `connected: ${r.status}`);
    try {
      await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
      const cover = await approvedItem("symphony-song-on.png", "hook online");
      await postJson(`/api/items/${cover.id}/edit`, { song: "Sym Artist B - Song Two" });
      const gone = await approvedItem("symphony-song-gone.png", "hook offline");
      await postJson(`/api/items/${gone.id}/edit`, { song: "Sym Artist B - Song Two", songFile: "symphony:sym-zz--not-there", songHook: { start: 1, end: 9 }, songPreviewUrl: "", songSpotifyUrl: "" });
      for (const c of [cover, gone]) await render(c.id);
      const checked = (await (await post("/api/pollen/check", { itemIds: [cover.id, gone.id] })).json()).items;
      assert(checked[0].hasSongClip && checked[0].songGoes === true && checked[0].problems.length === 0, `the clip goes: ${JSON.stringify(checked[0])}`);
      assert(checked[1].hasSongClip && checked[1].songGoes === false && checked[1].problems.some((p) => /isn't in Symphony/.test(p)), `a gone clip is flagged: ${JSON.stringify(checked[1])}`);
      const results = (await (await post("/api/pollen/schedule", { itemIds: [cover.id, gone.id], channelIds: [CH_IG] })).json()).results;
      const key = (await pollenOf(cover.id)).clientKey;
      const req = hive.requests.find((x) => x.client_key === key);
      assert(req && req.song && req.song.artist === "Sym Artist B" && req.song.title === "Song Two" && req.song.hook_start === 12 && req.song.hook_end === 27 && req.song.content_type === "audio/mp4", `the request carries the hook: ${JSON.stringify(req)}`);
      assert(hive.uploads[req.song.path] && hive.uploads[req.song.path].equals(SYM_CLIP_3), "Symphony's exact clip is uploaded");
      assert(results.find((x) => x.itemId === gone.id).status === "refused", `the gone one is refused: ${JSON.stringify(results)}`);
    } finally {
      hive.songs = false;
      await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
      await fetch(`${base}/api/connectors/symphony`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: null }) });
    }
  });
  await check("v1.38 Schedule Post waits for a Bee Hive that takes times, and says so before sending anything", async () => {
    const cover = await approvedItem("sp-old.png", "golden hour");
    await render(cover.id);
    const before = hive.submits;
    const r = await post("/api/pollen/schedule-post", { itemId: cover.id, channelIds: [CH_IG], post: { at: new Date(Date.now() + 86400000).toISOString() } });
    assert(r.status === 409 && /time you pick/.test((await r.json()).error) && hive.submits === before, `refused: ${r.status}`);
    const ch = await (await fetch(`${base}/api/pollen/channels`)).json();
    assert(ch.features && ch.features.scheduleAt === false && ch.channels.every((c) => c.photo === true && c.video === false), JSON.stringify(ch).slice(0, 300));
  });
  await check("v1.38 Schedule Post sends a post and a reel, each at its time, approving a cover from the queue as the final step", async () => {
    hive.scheduleAt = true;
    hive.songs = true;
    await postJson(`/api/songs/folder`, { folder: SONGS });
    try {
      const ch = await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
      assert(ch.features.scheduleAt && ch.features.reels && ch.features.slides, JSON.stringify(ch.features));
      const yt = ch.channels.find((c) => c.id === CH_YT), ig = ch.channels.find((c) => c.id === CH_IG);
      assert(yt && yt.photo === false && yt.video === true && ig.video === true && ig.trial === true, `channels say what they take: ${JSON.stringify(ch.channels)}`);
      const form = new FormData();
      form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), "sp-queue.png");
      const item = (await (await fetch(`${base}/api/items/upload`, { method: "POST", body: form })).json()).created[0];
      await postJson(`/api/items/${item.id}/edit`, { caption: "slow light", song: "Artist A - Song A" });
      const slideForm = new FormData();
      slideForm.append("slide", new Blob([PNG_1PX], { type: "image/png" }), "sp-slide.png");
      await fetch(`${base}/api/items/${item.id}/slides`, { method: "POST", body: slideForm });
      await render(item.id);
      const at = (h) => new Date(Date.now() + h * 3600000).toISOString();
      const send = (body) => post("/api/pollen/schedule-post", { itemId: item.id, channelIds: [CH_IG, CH_YT], ...body });
      const notDrawn = await send({ post: { at: at(24) } });
      assert(notDrawn.status === 409 && /photos weren't drawn/.test((await notDrawn.json()).error), `the carousel's photos are drawn first: ${notDrawn.status}`);
      const sf = new FormData();
      sf.append("image", new Blob([TINY_JPEG], { type: "image/jpeg" }), "slide.jpg");
      const sr = await (await fetch(`${base}/api/items/${item.id}/render-slide/0`, { method: "POST", body: sf })).json();
      assert(sr.ok && sr.render.width > 0, JSON.stringify(sr));
      const past = await send({ post: { at: at(-1) } });
      assert(past.status === 400 && /5 minutes from now/.test((await past.json()).error), "a time in the past is refused");
      const none = await send({});
      assert(none.status === 400 && /Post, Reel or both/.test((await none.json()).error), "nothing picked is refused");
      const ytOnlyPost = await post("/api/pollen/schedule-post", { itemId: item.id, channelIds: [CH_YT], post: { at: at(24) } });
      assert(ytOnlyPost.status === 400 && /photo post/.test((await ytOnlyPost.json()).error), "a post needs a photo channel");
      const queued = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === item.id);
      assert(queued, "a refused send leaves the cover in the queue");
      const before = hive.submits;
      const out = await (await send({ post: { at: at(26) }, reel: { at: at(27), trial: true } })).json();
      assert(out.ok && out.approved === true && out.item.status === "approved", `her final approval: ${JSON.stringify(out).slice(0, 300)}`);
      assert(out.results.post.status === "waiting" && out.results.reel.status === "waiting" && hive.submits === before + 2, JSON.stringify(out.results));
      const fresh = (await (await fetch(`${base}/api/items?status=approved`)).json()).items.find((i) => i.id === item.id);
      const rp = hive.requests.find((x) => x.client_key === fresh.pollen.clientKey), rr = hive.requests.find((x) => x.client_key === fresh.pollenReel.clientKey);
      assert(rp.format === "post" && rp.trial === null && rp.channel_ids.join() === CH_IG && Math.abs(Date.parse(rp.scheduled_at) - Date.parse(at(26))) < 120000, `the post: ${JSON.stringify(rp)}`);
      assert(rp.slides.length === 1 && hive.uploads[rp.slides[0].path] && !rp.song, `the post carries its photos, not the song: ${JSON.stringify(rp)}`);
      assert(rr.format === "reel" && rr.trial === true && rr.channel_ids.join() === [CH_IG, CH_YT].join() && rr.song && rr.song.title === "Song A" && hive.uploads[rr.song.path]
        && rr.slides.length === 1, `the reel: ${JSON.stringify(rr)}`);
      assert(fresh.pollen.format === "post" && fresh.pollenReel.format === "reel" && fresh.pollenReel.trial === true, "each format is kept on the cover");
      const again = await send({ post: { at: at(30) } });
      assert(again.status === 409 && /already with Pollen/.test((await again.json()).error) && hive.submits === before + 2, "a post with Pollen isn't sent twice");
      hive.requests.find((x) => x.id === fresh.pollenReel.requestId).status = "booked";
      hive.requests.find((x) => x.id === fresh.pollenReel.requestId).booked_day = "2026-12-01";
      await post("/api/pollen/sync", {});
      const synced = (await (await fetch(`${base}/api/items?status=approved`)).json()).items.find((i) => i.id === item.id);
      assert(synced.pollenReel.status === "booked" && synced.pollenReel.bookedDay === "2026-12-01" && synced.pollen.status === "waiting", "sync fills in each format on its own");
      const noClip = await approvedItem("sp-noclip.png", "no clip here");
      await postJson(`/api/items/${noClip.id}/edit`, { song: "Someone - Else" });
      await render(noClip.id);
      const reelNoClip = await post("/api/pollen/schedule-post", { itemId: noClip.id, channelIds: [CH_IG], reel: { at: at(24), trial: false } });
      assert(reelNoClip.status === 400 && /song's clip/.test((await reelNoClip.json()).error), "a reel needs the song's clip");
      // 1.38.1: a song whose clip has gone from the folder says so, before anything is sent.
      const gone = await approvedItem("sp-gone.png", "clip gone");
      await postJson(`/api/items/${gone.id}/edit`, { song: "Artist C - Song C" });
      await render(gone.id);
      const submitsBefore = hive.submits;
      rmSync(join(SONGS, "hooks", "artist-c--song-c.m4a"));
      let goneBody;
      try {
        const reelGone = await post("/api/pollen/schedule-post", { itemId: gone.id, channelIds: [CH_IG], reel: { at: at(24), trial: false } });
        goneBody = { status: reelGone.status, ...(await reelGone.json()) };
      } finally { writeFileSync(join(SONGS, "hooks", "artist-c--song-c.m4a"), CLIP_C); }
      assert(goneBody.status === 400 && /isn't in the songs folder/.test(goneBody.error) && hive.submits === submitsBefore,
        `a missing clip says so and sends nothing: ${JSON.stringify(goneBody)}`);
      const prefs = await postJson(`/api/pollen/prefs`, { on: [CH_SUBSTACK, CH_SUBSTACK], off: [CH_YT], trial: false, postTime: "18:30", reelTime: "25:00", post: true, reel: false });
      assert(prefs.on.join() === CH_SUBSTACK && prefs.off.join() === CH_YT && prefs.trial === false && prefs.postTime === "18:30" && prefs.reelTime === null && prefs.reel === false, JSON.stringify(prefs));
      const kept = await (await fetch(`${base}/api/pollen/channels`)).json();
      assert(kept.prefs.on.join() === CH_SUBSTACK && kept.prefs.off.join() === CH_YT && kept.prefs.postTime === "18:30", "her choices come back with her channels");
      await postJson(`/api/pollen/prefs`, { on: [], off: [], trial: true });
    } finally {
      hive.scheduleAt = false;
      hive.songs = false;
      await postJson(`/api/songs/folder`, { folder: null });
      await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
    }
  });
  await check("v1.21 Post now waits until the Bee Hive says Pollen can post right away, and Schedule goes as before", async () => {
    // Big Edit item 28: the sheet's Schedule switch is on by default; off, the button posts now. Like songs in 1.11, a
    // cover goes out right away only once the Bee Hive's hello says Pollen takes it (features.post_now).
    let ch = await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
    assert(ch.connected && ch.postNow === false, `not yet: ${JSON.stringify(ch)}`);
    const now1 = await approvedItem("post-now-1.png", "right now");
    await render(now1.id);
    const before = hive.submits;
    const refused = await post("/api/pollen/schedule", { itemIds: [now1.id], channelIds: [CH_IG], now: true });
    const body = await refused.json();
    assert(refused.status === 400 && /right away/i.test(body.error || "") && hive.submits === before, `refused before sending: ${refused.status} ${JSON.stringify(body)}`);
    hive.postNow = true;
    try {
      ch = await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
      assert(ch.postNow === true, `now it can: ${JSON.stringify(ch)}`);
      const out = (await (await post("/api/pollen/schedule", { itemIds: [now1.id], channelIds: [CH_IG], now: true })).json()).results[0];
      assert(out.status === "waiting", `sent: ${JSON.stringify(out)}`);
      const key1 = (await pollenOf(now1.id)).clientKey;
      const r1 = hive.requests.find((x) => x.client_key === key1);
      assert(r1?.post_now === true, `the request asks to post now: ${JSON.stringify(r1)}`);
      const later = await approvedItem("post-later.png", "on a free day");
      await render(later.id);
      await (await post("/api/pollen/schedule", { itemIds: [later.id], channelIds: [CH_IG] })).json();
      const key2 = (await pollenOf(later.id)).clientKey;
      const r2 = hive.requests.find((x) => x.client_key === key2);
      assert(r2 && !r2.post_now, `Schedule books a day as before: ${JSON.stringify(r2)}`);
    } finally {
      hive.postNow = false;
      await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
    }
  });
  await check("pollen: the image route serves local and remote photos from this app's own address", async () => {
    const local = await fetch(`${base}/api/items/${first.id}/image`);
    assert(local.ok && local.headers.get("content-type").startsWith("image/png"), `local photo: ${local.status} ${local.headers.get("content-type")}`);
    const enq = await (await post("/api/items/enqueue", { items: [{ imageUrl: `${hiveBase}/photo.jpg`, driveId: "drive-remote", title: "remote" }] })).json();
    const remote = await fetch(`${base}/api/items/${enq.created[0].id}/image`);
    const bytes = Buffer.from(await remote.arrayBuffer());
    assert(remote.ok && bytes.equals(TINY_JPEG) && remote.headers.get("content-type") === "image/jpeg", "remote photo should come through this app");
  });
  await check("pollen: a revoked code says so", async () => {
    hive.revoked = true;
    const ch = await (await fetch(`${base}/api/pollen/channels?refresh=1`)).json();
    assert(ch.connected === false && ch.revoked === true && /doesn't work anymore/.test(ch.message), `expected the revoked message: ${JSON.stringify(ch)}`);
    hive.revoked = false;
  });
  await check("import status and repeat enqueue returns inFlight without duplicates", async () => {
    const batch = { items: [
      { imageUrl: "https://example.com/import-a.jpg", driveId: "smoke-import-a", title: "import a" },
      { imageUrl: "https://example.com/import-b.jpg", driveId: "smoke-import-b", title: "import b" },
    ] };
    const enqueue = async () => (await fetch(`${base}/api/items/enqueue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) })).json();
    let first = await enqueue();
    if (first.inFlight) {
      // An earlier enqueue in this run is still inside the 30s window; wait it out, then retry once.
      await wait(31000);
      first = await enqueue();
    }
    assert(first.started === true && first.inFlight === false, `first enqueue should start, got ${JSON.stringify(first).slice(0, 200)}`);
    assert(first.created.length === 2, `first enqueue should create 2 items, got ${first.created.length}`);
    const queueCount = async () => (await (await fetch(`${base}/api/items?status=queue`)).json()).items.length;
    const before = await queueCount();
    const st = await (await fetch(`${base}/api/import/status`)).json();
    assert(st.importState === "ready", `import state should be ready after a batch, got ${st.importState}`);
    assert(typeof st.importStartedAt === "string" && !Number.isNaN(Date.parse(st.importStartedAt)), "import status should carry an ISO importStartedAt");
    assert(st.lastBatchSize === 2, `last batch size should be 2, got ${st.lastBatchSize}`);
    assert(st.totalEnqueued >= 2, "total enqueued should count the batch");
    assert(typeof st.importPending === "number", "import status should carry an importPending count");
    const repeat = await enqueue();
    assert(repeat.inFlight === true && repeat.started === false, "repeat enqueue inside the window should return inFlight, not start");
    assert(repeat.created.length === 0, "repeat enqueue should create nothing");
    assert((await queueCount()) === before, "repeat enqueue must not create duplicate items");
    // The next chunk is a different batch, so it must go through even inside the window.
    const nextChunk = await (await fetch(`${base}/api/items/enqueue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ imageUrl: "https://example.com/import-c.jpg", driveId: "smoke-import-c", title: "import c" }] }) })).json();
    assert(nextChunk.started === true && nextChunk.inFlight === false, `next chunk with different Drive ids should start, got ${JSON.stringify(nextChunk).slice(0, 200)}`);
    assert(nextChunk.created.length === 1, "next chunk should create its item");
    const setup = await (await fetch(`${base}/api/setup/status`)).json();
    assert(setup.import && typeof setup.import.importState === "string", "setup status should carry import state");
  });
  // 1.20.1 (Arjang #965, Quill #970): a Drive enqueue puts its new covers at the front of the queue, in the order sent, the
  // way the original's frontQueueTimes does. Everything already queued moves back behind them, in its own order.
  await check("v1.20.1 a Drive enqueue lands at the front of the queue, in the order sent", async () => {
    const queueIds = async () => (await (await fetch(`${base}/api/items?status=queue`)).json()).items.map((i) => i.id);
    const before = await queueIds();
    assert(before.length >= 2, `needs a queue to push back, got ${before.length}`);
    const sent = await postJson(`/api/items/enqueue`, { items: [
      { imageUrl: "https://example.com/front-1.jpg", driveId: "smoke-front-1", title: "front 1" },
      { imageUrl: "https://example.com/front-2.jpg", driveId: "smoke-front-2", title: "front 2" },
      { imageUrl: "https://example.com/front-bad.jpg", driveId: "smoke-front-bad", imageQualityStatus: "quarantined" },
      { imageUrl: "https://example.com/front-3.jpg", driveId: "smoke-front-3", title: "front 3" }] });
    const ids = sent.created.filter((i) => i.status === "queue").map((i) => i.id);
    assert(ids.length === 3, `three new covers, got ${ids.length}`);
    const after = await queueIds();
    assert(after.slice(0, 3).join(",") === ids.join(","), `the front should be ${ids} in order, got ${after.slice(0, 5)}`);
    assert(after.slice(3).join(",") === before.join(","), "the rest keep their order behind them");
    // The order is data a ported space can keep in a column: review times, earliest first (the original's reviewOrderAt).
    const times = sent.created.filter((i) => i.status === "queue").map((i) => i.reviewOrderAt);
    assert(times.every((t, n) => typeof t === "number" && (n === 0 || t > times[n - 1])), `review times rise in the order sent: ${times}`);
    assert(sent.created.find((i) => i.status !== "queue").reviewOrderAt == null, "a quarantined photo gets no review time");
    const next = await postJson(`/api/items/enqueue`, { items: [{ imageUrl: "https://example.com/front-4.jpg", driveId: "smoke-front-4", title: "front 4" }] });
    const again = await queueIds();
    assert(again[0] === next.created[0].id && again.slice(1, 4).join(",") === ids.join(","), `a later batch goes first: ${again.slice(0, 5)}`);
    const dup = await postJson(`/api/items/enqueue`, { items: [{ imageUrl: "https://example.com/front-2.jpg", driveId: "smoke-front-2" }] });
    assert(dup.created.length === 0, "a Drive id already in the queue makes nothing");
    assert((await queueIds()).join(",") === again.join(","), "and the queue order doesn't move");
  });
  // 1.38.2 (Quill #1367): a photo a space imported before its batch was enqueued has a bare row with no review time, so
  // the enqueue skips it. The one-off recovery gives it the time the enqueue would have given it as the batch's first
  // photo, writes nothing else, and refuses before the batch, on a composed or placed cover, and a second time.
  await check("v1.38.2 a bare photo imported before its batch goes in front of that batch, at the time the batch would have given it, once", async () => {
    const row = (id, more) => ({ id, imageUrl: `https://example.com/row-${id}.jpg`, title: `row ${id}`, source: "drive", driveId: `smoke-row-${id}`, status: "queue", quote: "A quote.", ...more });
    await withCopy(4196, (dir) => writeFileSync(join(dir, "db.json"), JSON.stringify({ voiceSamples: [], nextId: 6, items: [
      row(1, { reviewOrderAt: 1000 }), row(2, { reviewOrderAt: 2000 }), row(3, { song: "Artist A - Song A", why: null, description: "" }),
      row(4, { why: { text: "Because.", tags: [] } }), row(5, { description: "A photo." })] })), async ({ dir, get, post }) => {
      const saved = (id) => JSON.parse(readFileSync(join(dir, "db.json"), "utf8")).items.find((i) => i.id === id);
      const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
      const early = await post("/api/items/3/recover-front", { driveId: "smoke-row-3" });
      assert(/batch first/.test(early.error || ""), `before its batch it should refuse, got ${JSON.stringify(early).slice(0, 200)}`);
      const sent = await post("/api/items/enqueue", { items: ["smoke-row-3", "smoke-new-1", "smoke-new-2"].map((driveId) => ({ imageUrl: `https://example.com/${driveId}.jpg`, driveId })) });
      assert(sent.created.length === 2, `the enqueue skips the bare row's Drive id, got ${sent.created.length} new`);
      assert(sent.created.map((i) => i.reviewOrderAt).join(",") === "998,999", `the two new ones take the batch's 2nd and 3rd times, got ${sent.created.map((i) => i.reviewOrderAt)}`);
      const [n1, n2] = sent.created.map((i) => i.id);
      for (const [id, driveId, words] of [[3, "smoke-new-1", "Drive id"], [4, "smoke-row-4", "bare import"], [5, "smoke-row-5", "bare import"], [n1, "smoke-new-1", "already has its place"], [999, "smoke-row-3", "not found"]]) {
        const no = await post(`/api/items/${id}/recover-front`, { driveId });
        assert((no.error || "").includes(words), `cover ${id} should be refused with "${words}", got ${JSON.stringify(no).slice(0, 200)}`);
      }
      const before = saved(3);
      const done = await post("/api/items/3/recover-front", { driveId: "smoke-row-3" });
      assert(done.item?.reviewOrderAt === 997, `it takes 997, the first photo's time in a batch of three in front of 1000, got ${done.item?.reviewOrderAt}`);
      const after = saved(3);
      assert(after.reviewOrderAt === 997, "the time is saved");
      delete after.reviewOrderAt;
      assert(sorted(after) === sorted(before), `nothing else on the row changes: ${sorted(after).slice(0, 300)}`);
      const order = (await get("/api/items")).items.map((i) => i.id);
      assert(order.slice(0, 5).join(",") === [3, n1, n2, 1, 2].join(","), `the batch leads in its order, then the rest: ${order}`);
      const twice = await post("/api/items/3/recover-front", { driveId: "smoke-row-3" });
      assert((twice.error || "").includes("already has its place") && saved(3).reviewOrderAt === 997, "a second call is refused and moves nothing");
    });
  });
  // The Chats simulator (1.14, Arjang #570 and #575, Quill #581 and #584): practice replies to DMs and comments, her Muse
  // drafts and sends. One POST route per action under /api/dm/, the same names and answers as a Muse space's dm_ actions.
  const dm = (name, body) => postJson(`/api/dm/${name}`, body || {});
  async function dmFails(name, body, status, words) {
    const r = await fetch(`${base}/api/dm/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    assert(r.status === status, `${name} ${JSON.stringify(body)} answered ${r.status}: ${text.slice(0, 200)}`);
    if (words) assert(JSON.parse(text).error.includes(words), `${name}: ${text.slice(0, 200)}`);
  }
  const dmItem = async (id) => (await dm("listitems")).items.find((i) => i.id === id);
  await check("v1.14 the Chats simulator starts empty: no items, no voice, no account, nothing waiting for her Muse", async () => {
    const list = await dm("listitems");
    assert(list.items.length === 0, `items: ${list.items.length}`);
    assert(JSON.stringify(list.stats) === JSON.stringify({ total: 0, pending: 0, reviewed: 0, approved: 0, edited: 0, needs_work: 0, ready: 0, published: 0 }), `stats: ${JSON.stringify(list.stats)}`);
    const voice = await dm("getvoiceprofile");
    assert(Array.isArray(voice.sections) && voice.sections.length === 0 && voice.is_custom === false, `voice: ${JSON.stringify(voice)}`);
    const source = await dm("getvoicesource");
    assert(JSON.stringify(source) === JSON.stringify({ rules: { voice: "", listening: "", deterrence: "", dm: "", offers: "" }, starting_profile: [] }), `voice source: ${JSON.stringify(source)}`);
    assert((await dm("draftswanted")).items.length === 0 && (await dm("publishwanted")).items.length === 0, "nothing wanted");
  });
  const dmIds = {};
  await check("v1.14 items are added, listed oldest first, and a holdout's real reply stays sealed", async () => {
    dmIds.live = (await dm("createitem", { kind: "dm", sender: "@test.person", incoming_text: "  hi there, how do I start?  ", thread_id: "t-1",
      thread_messages: [{ from: "them", text: "first message" }, { from: "me", kind: "reaction" }, { from: "them", kind: "share_reel", url: "https://example.com/r/1", at: "2026-11-20T01:00:00-08:00" },
        { from: "them", kind: "text", text: "   " }, { from: "them", kind: "made-up", text: "kept as text", reply_to: "story" }] })).id;
    dmIds.holdout = (await dm("createitem", { kind: "dm", sender: "other", incoming_text: "old message", source: "holdout", actual_reply: "What I really said" })).id;
    dmIds.comment = (await dm("createitem", { kind: "comment", incoming_text: "love this post", context_text: "post caption", media_id: "m-1", comment_id: "c-1", actual_reply: "ignored, not a holdout" })).id;
    assert(dmIds.live < dmIds.holdout && dmIds.holdout < dmIds.comment, `ids: ${JSON.stringify(dmIds)}`);
    const list = await dm("listitems");
    assert(list.items.map((i) => i.id).join(",") === [dmIds.live, dmIds.holdout, dmIds.comment].join(","), "oldest first");
    const live = list.items[0];
    assert(live.incoming_text === "hi there, how do I start?" && live.sender === "@test.person" && live.source === "live" && live.verdict === "pending", `live: ${JSON.stringify(live).slice(0, 300)}`);
    assert(live.publish_status === "unpublished" && live.has_target === true && live.draft_text === null && live.draft_wanted === false, "a fresh live item");
    // 1.22.0: a text with no words is kept as a generic message (the simulator's rule), and each message carries its picture and caption.
    assert(JSON.stringify(live.thread_messages) === JSON.stringify([
      { from: "them", kind: "text", text: "first message", url: null, media_url: null, caption: null, reply_to: null, at: null },
      { from: "me", kind: "reaction", text: null, url: null, media_url: null, caption: null, reply_to: null, at: null },
      { from: "them", kind: "share_reel", text: null, url: "https://example.com/r/1", media_url: null, caption: null, reply_to: null, at: "2026-11-20T01:00:00-08:00" },
      { from: "them", kind: "generic", text: null, url: null, media_url: null, caption: null, reply_to: null, at: null },
      { from: "them", kind: "text", text: "kept as text", url: null, media_url: null, caption: null, reply_to: "story", at: null }]), `thread: ${JSON.stringify(live.thread_messages)}`);
    const holdout = list.items[1];
    assert(holdout.has_actual === true && holdout.actual_reply === null && holdout.revealed === false, `holdout: ${JSON.stringify(holdout).slice(0, 300)}`);
    const comment = list.items[2];
    assert(comment.has_actual === false && comment.sender === "" && comment.context_text === "post caption", "a comment keeps no real reply unless it's a holdout");
    assert(list.stats.total === 3 && list.stats.pending === 3 && list.stats.ready === 0, `stats: ${JSON.stringify(list.stats)}`);
    assert((await dm("listitems", { filter: "comment" })).items.length === 1 && (await dm("listitems", { filter: "dm" })).items.length === 2, "kind filters");
    await dmFails("createitem", { kind: "dm", incoming_text: "   " }, 400);
    await dmFails("createitem", { kind: "story", incoming_text: "hi" }, 400);
    await dmFails("createitem", { kind: "dm", incoming_text: "x".repeat(4001) }, 400);
    await dmFails("listitems", { filter: "nope" }, 400);
    await dmFails("nosuchaction", {}, 404);
  });
  // 1.18.0 (Arjang in the build chat, room #840): a chat's label is saved with her account, so every device shows it.
  await check("v1.18 a chat's label is saved with her account: listitems answers it, null clears it, only the six labels are taken, and a device's old labels fill only chats with none", async () => {
    assert((await dmItem(dmIds.live)).label === null, "no label yet");
    assert((await dm("setlabel", { id: dmIds.live, label: "Booked" })).label === "Booked", "saved");
    assert((await dmItem(dmIds.live)).label === "Booked", "every device reads it");
    await dmFails("setlabel", { id: dmIds.live, label: "Maybe" }, 400, "label must be one of");
    await dmFails("setlabel", { id: dmIds.live }, 400, "label is missing");
    await dmFails("setlabel", { id: 9999, label: "Flag" }, 404);
    await dmFails("importlabels", { labels: ["Flag"] }, 400);
    const moved = await dm("importlabels", { labels: { [dmIds.live]: "Paid", [dmIds.comment]: "Lead", 9999: "Flag", [dmIds.holdout]: "Nope", x: "Flag" } });
    assert(moved.imported === 1, `only the chat with no label takes one: ${JSON.stringify(moved)}`);
    assert((await dmItem(dmIds.live)).label === "Booked" && (await dmItem(dmIds.comment)).label === "Lead" && (await dmItem(dmIds.holdout)).label === null,
      "a saved label stays, an empty chat fills, and a wrong label or chat is skipped");
    await dm("setlabel", { id: dmIds.live, label: null });
    await dm("setlabel", { id: dmIds.comment, label: "" });
    assert((await dmItem(dmIds.live)).label === null && (await dmItem(dmIds.comment)).label === null, "cleared");
  });
  await check("v1.14 Draft asks her Muse: the item is marked waiting, the prompt never holds a sealed reply, and her Muse's draft lands", async () => {
    await dm("savevoicesource", { rules: { voice: "VOICE-RULES", listening: "LISTEN-RULES", deterrence: "DETER-RULES", dm: "DM-RULES", offers: "OFFERS-LIST" } });
    const asked = await dm("generatedraft", { id: dmIds.holdout, mode: "listening" });
    assert(asked.wanted === true && asked.draft_text === "" && asked.draft_mode === "dm", `a DM always drafts in dm mode: ${JSON.stringify(asked)}`);
    assert((await dmItem(dmIds.holdout)).draft_wanted === true, "the item shows it's waiting for a draft");
    await dm("generatedraft", { id: dmIds.comment, mode: "deterrence", variant: "sharper" });
    const wanted = (await dm("draftswanted")).items;
    assert(wanted.map((w) => w.id).join(",") === [dmIds.holdout, dmIds.comment].join(","), `wanted: ${JSON.stringify(wanted).slice(0, 200)}`);
    const h = wanted[0], c = wanted[1];
    assert(h.mode === "dm" && h.variant === "fresh" && c.mode === "deterrence" && c.variant === "sharper", "mode and variant");
    assert(h.prompt.includes("Their message: old message") && h.prompt.includes("From: @other") && !h.prompt.includes("What I really said") && !h.system.includes("What I really said"), "the sealed reply never reaches the prompt");
    assert(h.system.includes("VOICE-RULES") && h.system.includes("DM-RULES") && h.system.includes("OFFERS-LIST") && !h.system.includes("LISTEN-RULES"), `a DM's system: ${h.system.slice(0, 200)}`);
    assert(c.system.includes("LISTEN-RULES") && c.system.includes("DETER-RULES") && !c.system.includes("OFFERS-LIST"), "a comment's deterrence system");
    assert(c.prompt.includes("Context (post caption or thread so far): post caption") && c.prompt.includes("SHARPER"), `comment prompt: ${c.prompt}`);
    await dmFails("savedraft", { id: dmIds.holdout, draft_text: "   " }, 400);
    await dmFails("generatedraft", { id: 99999 }, 404, "no longer exists");
    // A draft follows the !! rule in her voice profile (1.14, Rose #770): this copy's profile has none, so it ends with none.
    const landed = await dm("savedraft", { id: dmIds.holdout, draft_text: "  Something tells me you started already!!  " });
    assert(landed.draft_text === "Something tells me you started already" && landed.draft_mode === "dm", `landed: ${JSON.stringify(landed)}`);
    const item = await dmItem(dmIds.holdout);
    assert(item.draft_text === "Something tells me you started already" && item.draft_wanted === false, "the draft is on the item and nothing waits");
    assert((await dm("draftswanted")).items.map((w) => w.id).join(",") === String(dmIds.comment), "only the comment still waits");
    await dm("generatedraft", { id: dmIds.live });
    const live = (await dm("draftswanted")).items.find((w) => w.id === dmIds.live);
    assert(live.prompt.includes("Thread so far, oldest first:\nThem: first message\nthe creator: [reacted to a message]\nThem: [shared a reel]\nThem: [sent a message]\nThem: kept as text"), `thread in the prompt: ${live.prompt}`);
    assert(live.prompt.includes("Do not start your reply the same way as these recent drafts: Something tells"), "recent openings");
    await dm("savedraft", { id: dmIds.live, draft_text: "Yayyy welcome in!!" });
  });
  await check("v1.14 review: approving with no edit keeps the draft word for word, and a sealed reply opens only after", async () => {
    await dmFails("revealactual", { id: dmIds.holdout }, 409, "Save your revision first");
    await dmFails("savereview", { id: dmIds.comment, verdict: "approved" }, 409, "no draft to approve");
    await dmFails("savereview", { id: dmIds.holdout, verdict: "maybe" }, 400);
    assert((await dm("savereview", { id: dmIds.holdout, verdict: "approved", feedback: " good " })).ok === true, "saved");
    const saved = await dmItem(dmIds.holdout);
    assert(saved.revision_text === "Something tells me you started already" && saved.verdict === "approved" && saved.feedback === "good" && saved.reviewed_at, `saved: ${JSON.stringify(saved).slice(0, 300)}`);
    const opened = await dm("revealactual", { id: dmIds.holdout });
    assert(opened.actual_reply === "What I really said", "the real reply");
    const after = await dmItem(dmIds.holdout);
    assert(after.revealed === true && after.actual_reply === "What I really said", "it stays open");
    await dmFails("revealactual", { id: dmIds.live }, 409, "no actual reply stored");
    await dm("savereview", { id: dmIds.live, revision_text: "Yayyy welcome in", verdict: "edited" });
    assert((await dmItem(dmIds.live)).verdict === "approved", "an unchanged draft counts as approved");
  });
  await check("v1.30 Dismiss hides a chat for now and their next message brings it back; reply links live in settings (room #1193)", async () => {
    let r = await dm("dismissitem", { id: dmIds.live });
    assert(r.item.dismissed === true && (await dmItem(dmIds.live)).dismissed === true, "dismissed, still here");
    await dm("updatethread", { id: dmIds.live, thread_messages: [{ from: "them", text: "hey again", at: new Date(Date.now() + 1000).toISOString() }] });
    assert((await dmItem(dmIds.live)).dismissed === false, `their next message brings it back: ${JSON.stringify(await dmItem(dmIds.live)).slice(0, 200)}`);
    await dm("dismissitem", { id: dmIds.live });
    r = await dm("dismissitem", { id: dmIds.live, on: false });
    assert(r.item.dismissed === false, "and it comes back by hand");
    assert((await dm("getreplylinks")).links.length === 0, "no links until she sets them");
    await dmFails("savereplylinks", { links: [{ label: "Channel", url: "http://not-secure.example" }] }, 400, "start with https://");
    const saved = await dm("savereplylinks", { links: [{ label: "Channel", url: "https://example.com/join" }] });
    assert(saved.links.length === 1 && (await dm("getreplylinks")).links[0].url === "https://example.com/join", "kept in her settings");
    await dm("savereplylinks", { links: [] });
  });
  await check("v1.14 Send hands the approved text to her Muse, and only her Muse's report marks it sent", async () => {
    await dmFails("publishitem", { id: dmIds.holdout }, 409, "blind holdout");
    await dmFails("publishitem", { id: dmIds.comment, verdict: "approved" }, 409, "nothing to publish yet");
    const sent = await dm("publishitem", { id: dmIds.live, revision_text: "Yayyy welcome in!!\nLemme know how it lands", verdict: "edited" });
    assert(sent.ok === true && sent.status === "publishing" && sent.text === "Yayyy welcome in!!\nLemme know how it lands", `sent: ${JSON.stringify(sent)}`);
    await dmFails("publishitem", { id: dmIds.live }, 409, "already on its way");
    const wanted = (await dm("publishwanted")).items;
    assert(wanted.length === 1 && wanted[0].id === dmIds.live && wanted[0].text === sent.text && wanted[0].kind === "dm" && wanted[0].sender === "@test.person" && wanted[0].thread_id === "t-1", `wanted: ${JSON.stringify(wanted)}`);
    assert(wanted[0].incoming_text === "hi there, how do I start?" && !("actual_reply" in wanted[0]), "what to find, and nothing sealed");
    // 1.30.0 (room #1193 item 6): each line is a part, with the pause to hold before it, longer after a longer part.
    const parts = wanted[0].parts;
    assert(parts.length === 2 && parts[0].text === "Yayyy welcome in!!" && parts[0].delay_ms === 0 && parts[1].text === "Lemme know how it lands"
      && parts[1].delay_ms === Math.max(1500, 1000 + 40 * "Yayyy welcome in!!".length), `parts: ${JSON.stringify(parts)}`);
    await dm("confirmpublish", { id: dmIds.live, ok: false, detail: "thread not found" });
    let item = await dmItem(dmIds.live);
    assert(item.publish_status === "publish_failed" && item.publish_error === "thread not found", `failed: ${JSON.stringify(item).slice(0, 300)}`);
    assert((await dm("listitems", { filter: "ready" })).items.map((i) => i.id).join(",") === String(dmIds.live), "a failed send is ready to try again");
    assert((await dm("publishwanted")).items.length === 0, "nothing waits after a report");
    await dm("publishitem", { id: dmIds.live, revision_text: "Yayyy welcome in!!\nLemme know how it lands", verdict: "edited" });
    await dm("confirmpublish", { id: dmIds.live, ok: true });
    item = await dmItem(dmIds.live);
    assert(item.publish_status === "published" && item.published_text === "Yayyy welcome in!!\nLemme know how it lands" && item.published_at && item.publish_error === null, "published");
    const stats = (await dm("listitems")).stats;
    assert(stats.published === 1 && stats.reviewed === 2 && stats.ready === 0, `stats: ${JSON.stringify(stats)}`);
    await dmFails("confirmpublish", { id: 99999, ok: true }, 404);
  });
  await check("v1.14 training export, the voice tab, the account and delete", async () => {
    const out = await dm("exporttraining");
    assert(out.count === 2 && out.items.map((i) => i.id).join(",") === [dmIds.live, dmIds.holdout].join(",") && out.exported_at, `export: ${JSON.stringify(out).slice(0, 300)}`);
    assert(out.items[1].actual_reply === "What I really said" && out.items[0].actual_reply === null, "only an opened holdout gives its real reply");
    await dm("savevoicesource", { starting_profile: [{ title: "Openers", body: "Warm guess first" }] });
    let voice = await dm("getvoiceprofile");
    assert(voice.sections.length === 1 && voice.sections[0].title === "Openers" && voice.is_custom === false, `starting profile: ${JSON.stringify(voice)}`);
    await dmFails("savevoiceprofile", { sections: [{ title: " ", body: "x" }] }, 400);
    await dmFails("savevoiceprofile", { sections: [] }, 400);
    await dm("savevoiceprofile", { sections: [{ title: "Openers", body: "Warm guess first\nNo pet names" }, { title: "Closers", body: "!! at the end" }] });
    voice = await dm("getvoiceprofile");
    assert(voice.is_custom === true && voice.sections.length === 2, "her edits");
    await dm("generatedraft", { id: dmIds.comment });
    const c = (await dm("draftswanted")).items.find((w) => w.id === dmIds.comment);
    assert(c.system.includes("## Closers\n!! at the end") && c.system.includes("her notes win"), `notes in the system: ${c.system.slice(-300)}`);
    const reset = await dm("resetvoiceprofile");
    assert(reset.ok === true && reset.sections.length === 1 && reset.sections[0].title === "Openers", "back to the starting profile");
    assert((await dm("getvoiceprofile")).is_custom === false, "no edits after a reset");
    assert((await dm("getaccount")).handle === null || typeof (await dm("getaccount")).handle === "string", "an account handle or none");
    await postJson("/api/connectors/instagram/consent", { captionConsent: true, handle: "@smoke.creator" });
    assert((await dm("getaccount")).handle === "smoke.creator", "the account comes from the Instagram connector");
    assert((await dm("deleteitem", { id: dmIds.comment })).ok === true && !(await dmItem(dmIds.comment)), "deleted");
    assert((await dm("draftswanted")).items.length === 0, "a deleted item waits for nothing");
    const db = JSON.parse(readFileSync(join(DATA, "db.json"), "utf8"));
    assert(db.dmItems.length === 2 && db.dmItems.every((i) => i.id && i.kind), "the items are in this copy's own data");
  });
  // ---------- v1.14: the standalone simulator's fixes, folded in (Quill #725, Rose #738 and #770) ----------
  await check("v1.14 the voice version stamps each draft, Muse's drafts follow the profile's !! rule, a stale pending draft is asked for again when its thread opens, and story replies keep their own words", async () => {
    assert(voiceVersion([]) === "v0059765d" && voiceVersion([{ title: "Punctuation and emoji", body: "Hardly any commas." }]) === "v84161010", "djb2 over the saved sections, v plus 8 hex");
    const rule = [{ title: "Punctuation and emoji", body: "Hardly any commas.\n~1 in 5 replies end with !! or one matching emoji" }];
    assert(bangRuleOf([{ title: "A", body: "No pet names" }]) === null, "no line with !! means no rule");
    assert(JSON.stringify(bangRuleOf(rule)) === '{"per":1,"outOf":5}' && JSON.stringify(bangRuleOf([{ title: "P", body: "2 in 3 end with !!" }])) === '{"per":2,"outOf":3}', "the fraction on the !! line");
    assert(JSON.stringify(bangRuleOf([{ title: "P", body: "Replies end with !! about 1 time in 5" }])) === '{"per":1,"outOf":5}', "stated with no fraction it reads 1 in 5");
    assert(capEndings("Thank you!!", rule) === "Thank you", "one line: floor(1 x 1 / 5) is 0");
    const ten = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}!!`).join("\n");
    assert(capEndings(ten, rule) === ["Line 1!!", "Line 2!!", ...Array.from({ length: 8 }, (_, i) => `Line ${i + 3}`)].join("\n"), `ten lines keep two, the earliest: ${capEndings(ten, rule)}`);
    assert(capEndings("Hi!\nSo good \u{1F602}\n\u{1F602}", rule) === "Hi!\nSo good \u{1F602}\n\u{1F602}", "a single ! isn't a mark, and emoji endings stay (1.21.1)");
    assert(capEndings("Yesss!!!\nAmazing \u{1F483}\u{1F483}", [{ title: "A", body: "No pet names" }]) === "Yesss\nAmazing \u{1F483}\u{1F483}", "no rule: every !! goes and an emoji stays");
    assert(capEndings("A!!\nB!!\nC!!", [{ title: "P", body: "1 in 1 end with !!" }]) === "A!!\nB!!\nC", "never on every line of a longer draft");
    assert(capEndings("Wow!!\n\nOkay!!", rule) === "Wow\n\nOkay", "empty lines stay and don't count");
    // 1.21.1 (room #934, Quill #942): emoji endings are hers and never held to the !! rule. Her comment
    // replies end on emoji about 6 in 10 and her DM texts about 1 in 5, and a skin tone is part of its emoji. The !! cap
    // still holds every !! ending, and only !! endings use up what it allows.
    for (const r of [rule, [{ title: "Punctuation and emoji", body: "~1 in 7 replies end with !!" }]]) {
      const one = "Something tells me today was a big one \u{1F979}\u{1F979}\u{1F979}";
      assert(capEndings(one, r) === one, `a one-line draft keeps its emoji: ${capEndings(one, r)}`);
      const two = "@name thank youuuu \u{1F970}\u{1F64F}\u{1F3FD}\u{1F49E}";
      assert(capEndings(two, r) === two, `a run with a skin tone stays whole: ${capEndings(two, r)}`);
      assert(capEndings("Yayyyy!!!\nwould love to hear what you feel \u{1F64F}\u{1F3FD}\u{1F497}", r) === "Yayyyy\nwould love to hear what you feel \u{1F64F}\u{1F3FD}\u{1F497}",
        `the !! goes by the rule, the emoji line stays whole: ${capEndings("Yayyyy!!!\nwould love to hear what you feel \u{1F64F}\u{1F3FD}\u{1F497}", r)}`);
    }
    const mixed = ["A!!", "B \u{1F483}", "C!!", "D \u{1F483}", "E!!", "F \u{1F483}", "G!!", "H \u{1F483}", "I!!", "J \u{1F483}"].join("\n");
    assert(capEndings(mixed, rule) === ["A!!", "B \u{1F483}", "C!!", "D \u{1F483}", "E", "F \u{1F483}", "G", "H \u{1F483}", "I", "J \u{1F483}"].join("\n"),
      `ten lines keep two !! endings, the earliest, and every emoji: ${capEndings(mixed, rule)}`);
    const story = (text) => [{ from: "them", kind: "share_story", reply_to: "story", text }];
    assert(JSON.stringify(storyCapture(story("So good"), "replied to your story")) === '{"incomingText":"So good","notCaptured":false}', "the reply's own words");
    assert(JSON.stringify(storyCapture(story(null), " Replied to your story ")) === '{"incomingText":" Replied to your story ","notCaptured":true}', "no words and the placeholder: not captured");
    assert(storyCapture([{ from: "them", kind: "text", text: "hey" }], "replied to your story").notCaptured === false, "only a story reply counts");

    await dm("savevoiceprofile", { sections: rule });
    const id = (await dm("createitem", { kind: "dm", sender: "voice.test", incoming_text: "How do you stay so calm?" })).id;
    await dm("generatedraft", { id });
    const drafted = await dm("savedraft", { id, draft_text: "Breathing first!!\nThen tea!!" });
    assert(drafted.draft_text === "Breathing first\nThen tea", `two lines at 1 in 5 keep none: ${drafted.draft_text}`);
    let it = await dmItem(id);
    assert(it.draft_voice_version === voiceVersion(rule) && it.voice_stale === false, `stamped with the voice it was drafted under: ${JSON.stringify(it).slice(0, 300)}`);
    const calm = [{ title: "Punctuation and emoji", body: "Hardly any commas." }];
    await dm("savevoiceprofile", { sections: calm });
    it = await dmItem(id);
    assert(it.voice_stale === true && it.draft_wanted === false, "the voice changed: the draft is stale, and listing asks for nothing");
    const opened = await dm("openthread", { id });
    assert(opened.regenerated === false && opened.wanted === true && opened.item.draft_wanted === true && opened.item.draft_text === "Breathing first\nThen tea",
      `pending and stale: her Muse is asked once, and the old draft shows until the new one lands: ${JSON.stringify(opened).slice(0, 300)}`);
    const asked = (await dm("draftswanted")).items.filter((w) => w.id === id);
    assert(asked.length === 1 && asked[0].variant === "fresh" && asked[0].mode === "dm", `asked for a fresh draft: ${JSON.stringify(asked).slice(0, 200)}`);
    const twice = await dm("openthread", { id });
    assert(twice.wanted === true && (await dm("draftswanted")).items.filter((w) => w.id === id)[0].asked_at === asked[0].asked_at, "opening it again asks nothing new");
    await dm("savedraft", { id, draft_text: "Breathing first then tea" });
    it = await dmItem(id);
    assert(it.voice_stale === false && it.draft_voice_version === voiceVersion(calm), "the new draft carries the new voice");
    await dm("savereview", { id, verdict: "approved" });
    await dm("savevoiceprofile", { sections: rule });
    const kept = await dm("openthread", { id });
    assert(kept.wanted === false && kept.item.voice_stale === true && kept.item.verdict === "approved" && kept.item.draft_text === "Breathing first then tea" && !kept.item.draft_wanted,
      `approved: never redrafted on its own, only marked: ${JSON.stringify(kept).slice(0, 300)}`);

    const caught = (await dm("createitem", { kind: "dm", sender: "story.fan", incoming_text: "replied to your story", thread_messages: story("This made my whole morning") })).id;
    let s = await dmItem(caught);
    assert(s.incoming_text === "This made my whole morning" && s.story_reply_not_captured === false, `a story reply keeps its own words: ${JSON.stringify(s).slice(0, 300)}`);
    const lost = (await dm("createitem", { kind: "dm", sender: "story.fan2", incoming_text: "Replied to your story", thread_messages: story(null) })).id;
    s = await dmItem(lost);
    assert(s.story_reply_not_captured === true, "no words captured: flagged");
    await dm("generatedraft", { id: lost });
    const p = (await dm("draftswanted")).items.find((w) => w.id === lost);
    assert(!p.prompt.includes("Their message: Replied to your story") && p.prompt.includes("weren't captured") && p.prompt.includes("Don't invent"), `the prompt never passes the placeholder off as her words: ${p.prompt}`);
    const back = await dm("updatethread", { id: lost, thread_messages: story("Where was this taken?") });
    s = await dmItem(lost);
    assert(back.ok === true && s.incoming_text === "Where was this taken?" && s.story_reply_not_captured === false, `a later import with the words recovers them: ${JSON.stringify(s).slice(0, 300)}`);
    await dmFails("openthread", { id: 99999 }, 404);
    await dmFails("updatethread", { id: lost, thread_messages: "nope" }, 400);
  });
  // ---------- 1.22.0: Chats, aligned to the reply practice simulator (Big Edit #20 to #24 and 14.1, room #1030) ----------
  // The facts her Muse brings with each chat: where it came from, who follows whom, Instagram's read mark, whether it
  // needs her reply, when it last moved, and for a comment the post it sits under.
  const chat122 = {};
  await check("v1.22 a chat carries where it came from, who follows whom, its read mark and its post; old chats read as before", async () => {
    chat122.dm = (await dm("createitem", { kind: "dm", sender: "@friend.one", incoming_text: "hey you", thread_id: "t-122",
      folder: "requests", following: true, follows_her: false, ig_read: true, needs_reply: true, last_activity_timestamp_ms: Date.parse("2026-11-20T10:00:00Z"),
      thread_messages: [{ from: "them", kind: "video", url: "https://example.com/v.mp4", at: "2026-11-20T09:00:00Z" },
        { from: "them", kind: "call_missed", at: "2026-11-20T09:30:00Z" }, { from: "them", kind: "text", text: "hey you", at: "2026-11-20T10:00:00Z" }] })).id;
    chat122.comment = (await dm("createitem", { kind: "comment", sender: "fan.two", incoming_text: "so pretty", media_id: "m-122", comment_id: "c-122",
      media_preview_url: "https://example.com/p.jpg", media_permalink: "https://www.instagram.com/p/abc/", following: false, follows_her: true })).id;
    const d = await dmItem(chat122.dm);
    assert(d.folder === "requests" && d.following === true && d.follows_her === false && d.ig_read === true && d.needs_reply === true, `facts: ${JSON.stringify(d).slice(0, 400)}`);
    assert(d.section === "main" && d.build_read_at === null && d.edit_status === "none" && d.pending_edit_line === null && d.leftover_text === null, "the rest start plain");
    assert(d.last_activity_at === "2026-11-20T10:00:00.000Z", `last activity: ${d.last_activity_at}`);
    assert(d.thread_messages.map((m) => m.kind).join() === "video,call_missed,text" && d.thread_messages[0].url === "https://example.com/v.mp4", `kinds: ${JSON.stringify(d.thread_messages)}`);
    const c = await dmItem(chat122.comment);
    assert(c.media_id === "m-122" && c.media_preview_url === "https://example.com/p.jpg" && c.media_permalink === "https://www.instagram.com/p/abc/" && c.follows_her === true, `post: ${JSON.stringify(c).slice(0, 400)}`);
    const old = await dmItem(dmIds.live);
    assert(old.folder === null && old.following === false && old.follows_her === null && old.ig_read === false && old.needs_reply === true && old.section === "main", `an older chat: ${JSON.stringify(old).slice(0, 300)}`);
    await dmFails("createitem", { kind: "dm", incoming_text: "hi", folder: "archive" }, 400, "folder");
    await dmFails("createitem", { kind: "dm", incoming_text: "hi", following: "yes" }, 400, "following");
    await dmFails("createitem", { kind: "dm", incoming_text: "hi", last_activity_timestamp_ms: "not a time" }, 400, "last_activity_timestamp_ms");
  });
  await check("v1.22 a thread reads the way the simulator keeps it: oldest first, a call label is a call, a reaction keeps only its emoji, and a message with no words shows as its type", async () => {
    const id = (await dm("createitem", { kind: "dm", sender: "caller.one", incoming_text: "Liked a message", thread_messages: [
      { from: "them", kind: "text", text: "later", at: "2026-11-21T10:00:00Z" }, { from: "them", kind: "text", text: "earlier", at: "2026-11-21T09:00:00Z" },
      { from: "them", text: "You missed an audio call", at: "2026-11-21T09:10:00Z" }, { from: "me", kind: "generic", text: "Audio call ended", at: "2026-11-21T09:20:00Z" },
      { from: "them", kind: "reaction", text: "Liked a message", at: "2026-11-21T09:30:00Z" }, { from: "me", kind: "reaction", text: "Reacted \u{1F602} to your message", at: "2026-11-21T09:40:00Z" },
      { from: "them", kind: "text", at: "2026-11-21T09:50:00Z" },
      { from: "them", kind: "share_story", media_url: "https://example.com/s.jpg", caption: "sunrise", at: "2026-11-21T09:55:00Z" }] })).id;
    const d = await dmItem(id);
    assert(d.thread_messages.map((m) => `${m.kind}:${m.text}`).join("|") === "text:earlier|call_missed:You missed an audio call|call:Audio call ended|reaction:\u{2764}\u{FE0F}|reaction:\u{1F602}|generic:null|share_story:null|text:later",
      `kinds: ${JSON.stringify(d.thread_messages)}`);
    assert(d.thread_messages[6].media_url === "https://example.com/s.jpg" && d.thread_messages[6].caption === "sunrise", "a story share keeps its picture and caption");
    assert(d.incoming_text === "" && d.last_activity_at === "2026-11-21T10:00:00.000Z", `a reaction is no message, and the newest message sets the time: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("generatedraft", { id });
    const p = (await dm("draftswanted")).items.find((w) => w.id === id);
    assert(p.prompt.includes('Them: [missed a call, "You missed an audio call"]') && p.prompt.includes('the creator: [had a call, "Audio call ended"]') && p.prompt.includes('Them: [shared a story, caption: "sunrise"]'),
      `the prompt names each kind: ${p.prompt}`);
    await dm("savedraft", { id, draft_text: "Hahaha I saw that" });
  });
  await check("v1.22 a chat that needs no reply stays out of Pending, opening it never redrafts it, and a chat with history can come in with no message from them", async () => {
    const id = (await dm("createitem", { kind: "dm", sender: "done.one", incoming_text: "thank you so much", needs_reply: false })).id;
    assert((await dmItem(id)).needs_reply === false && !(await dm("listitems", { filter: "pending" })).items.some((i) => i.id === id), "not pending");
    const all = await dm("listitems");
    assert(all.stats.pending === all.items.filter((i) => i.verdict === "pending" && i.needs_reply).length, `the pending count leaves it out: ${JSON.stringify(all.stats)}`);
    await dm("generatedraft", { id });
    await dm("savedraft", { id, draft_text: "Thank you for being here" });
    await dm("savevoiceprofile", { sections: [{ title: "Punctuation and emoji", body: "Hardly any commas." }] });
    const opened = await dm("openthread", { id });
    assert(opened.item.voice_stale === true && opened.wanted === false, `stale, and nothing asked: ${JSON.stringify(opened).slice(0, 200)}`);
    await dm("savevoiceprofile", { sections: [{ title: "Punctuation and emoji", body: "~1 in 5 replies end with !!" }] });
    const mine = (await dm("createitem", { kind: "dm", sender: "only.me", incoming_text: "", needs_reply: false, thread_messages: [{ from: "me", text: "Alohaaa!!" }] })).id;
    assert((await dmItem(mine)).incoming_text === "", "a chat with history and no message from them");
    await dmFails("createitem", { kind: "dm", incoming_text: "" }, 400, "Their message");
  });
  await check("v1.22 a send takes only the texts she approved: the rest stay as drafts, a later send joins what went out, and a failed later send leaves the first ones sent", async () => {
    const id = (await dm("createitem", { kind: "dm", sender: "two.texts", incoming_text: "what do you offer?", thread_id: "t-two" })).id;
    const before = Date.now();
    await dm("publishitem", { id, revision_text: "Lemme share my yummy menu", remaining_text: "And a sweet treat for you" });
    let d = await dmItem(id);
    assert(d.leftover_text === "And a sweet treat for you" && (await dm("publishwanted")).items.find((w) => w.id === id).text === "Lemme share my yummy menu", `only the approved text goes: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("confirmpublish", { id, ok: true });
    d = await dmItem(id);
    assert(d.published_text === "Lemme share my yummy menu" && Date.parse(d.last_activity_at) >= before, `sent, and the chat moved: ${d.last_activity_at}`);
    await dm("publishitem", { id, revision_text: "And a sweet treat for you", remaining_text: "" });
    d = await dmItem(id);
    assert(d.publish_status === "publishing" && d.leftover_text === null && (await dm("publishwanted")).items.find((w) => w.id === id).text === "And a sweet treat for you", `the rest goes later: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("confirmpublish", { id, ok: true });
    d = await dmItem(id);
    assert(d.published_text === "Lemme share my yummy menu\nAnd a sweet treat for you" && d.revision_text === d.published_text, `it joins what went out: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("publishitem", { id, revision_text: "Hahaha one more" });
    await dm("confirmpublish", { id, ok: false, detail: "thread not found" });
    d = await dmItem(id);
    assert(d.publish_status === "published" && d.publish_error === "thread not found" && d.published_text === "Lemme share my yummy menu\nAnd a sweet treat for you", `a failed later send leaves the first ones sent: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("editpublished", { id, line_index: 0, text: "Lemme share my menu" });
    await dmFails("publishitem", { id, revision_text: "More" }, 409, "Let it land");
    await dm("confirmedit", { id, ok: false, detail: "can't edit" });
  });
  await check("v1.22 a later sync updates the facts, and a newer message from them brings a General chat back to the inbox", async () => {
    // The simulator's rule: a chat she moved to General comes back once their newest message is newer than her move.
    await dm("setchatsection", { id: chat122.dm, section: "general" });
    assert((await dmItem(chat122.dm)).section === "general", "moved to General");
    await dm("updatethread", { id: chat122.dm, thread_messages: [{ from: "them", kind: "text", text: "hey you", at: "2026-11-20T10:00:00Z" }] });
    assert((await dmItem(chat122.dm)).section === "general", "an older message from them doesn't move it back");
    const later = new Date(Date.now() + 60_000).toISOString(), later2 = new Date(Date.now() + 120_000).toISOString();
    await dm("updatethread", { id: chat122.dm, folder: "primary", ig_read: false, follows_her: true, thread_messages: [
      { from: "them", kind: "text", text: "hey you", at: "2026-11-20T10:00:00Z" }, { from: "them", kind: "text", text: "you there?", at: later }] });
    const d = await dmItem(chat122.dm);
    assert(d.folder === "primary" && d.ig_read === false && d.follows_her === true && d.following === true, `facts updated, the rest kept: ${JSON.stringify(d).slice(0, 300)}`);
    assert(d.section === "main" && d.last_activity_at === later, `back in the inbox: ${d.section} ${d.last_activity_at}`);
    await dm("setchatsection", { id: chat122.dm, section: "general" });
    await dm("updatethread", { id: chat122.dm, thread_messages: [{ from: "them", kind: "text", text: "you there?", at: later },
      { from: "me", kind: "text", text: "Yesss!!", at: later2 }] });
    assert((await dmItem(chat122.dm)).section === "general", "her own message doesn't move it back");
    await dm("setchatsection", { id: chat122.dm, section: "main" });
    await dmFails("setchatsection", { id: chat122.dm, section: "requests" }, 400, "section");
  });
  await check("v1.22 opening a chat in the app marks it read here, apart from Instagram's own read mark", async () => {
    const r = await dm("markreadinbuild", { id: chat122.comment });
    const c = await dmItem(chat122.comment);
    assert(r.ok === true && typeof c.build_read_at === "string" && c.ig_read === false, `read here only: ${JSON.stringify(c).slice(0, 200)}`);
  });
  await check("v1.22 Refresh with a direction asks her Muse with it, and an empty direction asks for a fresh one", async () => {
    await dm("generatedraft", { id: chat122.comment, variant: "again", direction: "  warmer, and ask about the dress  " });
    let w = (await dm("draftswanted")).items.find((i) => i.id === chat122.comment);
    assert(w && w.variant === "again" && w.direction === "warmer, and ask about the dress" && w.prompt.includes("warmer, and ask about the dress"), `with a direction: ${JSON.stringify(w).slice(0, 400)}`);
    await dm("savedraft", { id: chat122.comment, draft_text: "Thank you for being here!!" });
    await dm("generatedraft", { id: chat122.comment, variant: "again", direction: "" });
    w = (await dm("draftswanted")).items.find((i) => i.id === chat122.comment);
    assert(w && w.direction === null && !w.prompt.includes("Her direction"), `no direction: ${JSON.stringify(w).slice(0, 300)}`);
    await dmFails("generatedraft", { id: chat122.comment, direction: "x".repeat(301) }, 400, "direction");
    await dm("savedraft", { id: chat122.comment, draft_text: "Thank you for being here!!" });
  });
  await check("v1.22 a sent line can be edited: her Muse is asked, and only its report changes what shows as sent", async () => {
    const id = chat122.comment;
    await dmFails("editpublished", { id, line_index: 0, text: "Thank you so much!!" }, 409, "gone out");
    await dm("publishitem", { id, revision_text: "Thank you for being here!!\nYour dress is a dream!!" });
    await dm("confirmpublish", { id, ok: true });
    await dmFails("editpublished", { id, line_index: 1, text: "Your dress is a dream!!" }, 400, "same text");
    await dmFails("editpublished", { id, line_index: 5, text: "Hi!!" }, 409, "no longer there");
    const r = await dm("editpublished", { id, line_index: 1, text: "That dress is a dream!!" });
    let c = await dmItem(id);
    assert(r.status === "editing" && c.edit_status === "editing" && c.pending_edit_line === 1 && c.published_text.endsWith("Your dress is a dream!!"), `editing: ${JSON.stringify(c).slice(0, 300)}`);
    await dmFails("editpublished", { id, line_index: 0, text: "Thank you!!" }, 409, "already on its way");
    const want = (await dm("editswanted")).items.find((i) => i.id === id);
    assert(want && want.old_text === "Your dress is a dream!!" && want.new_text === "That dress is a dream!!" && want.line_index === 1 && want.comment_id === "c-122", `asked: ${JSON.stringify(want)}`);
    await dm("confirmedit", { id, ok: false, detail: "Instagram doesn't let a comment reply be edited." });
    c = await dmItem(id);
    assert(c.edit_status === "edit_failed" && c.edit_error.includes("doesn't let") && c.published_text.endsWith("Your dress is a dream!!"), "a failed edit changes nothing sent");
    assert(!(await dm("editswanted")).items.some((i) => i.id === id), "and isn't asked again");
    await dm("editpublished", { id, line_index: 1, text: "That dress is a dream!!" });
    await dm("confirmedit", { id, ok: true });
    c = await dmItem(id);
    assert(c.edit_status === "none" && c.published_text === "Thank you for being here!!\nThat dress is a dream!!" && c.edited_line_index === 1 && typeof c.edited_at === "string", `edited: ${JSON.stringify(c).slice(0, 300)}`);
    await dmFails("confirmedit", { id, ok: true }, 409, "no edit");
  });
  await check("v1.22 her edits are kept: the lines she's working on are saved with the chat until a new draft or a send replaces them", async () => {
    const id = (await dm("createitem", { kind: "dm", sender: "keep.edits", incoming_text: "can I book a call?" })).id;
    await dm("generatedraft", { id });
    await dm("savedraft", { id, draft_text: "Yesss lemme send you my link\nSomething tells me this is your week" });
    assert((await dmItem(id)).work_lines === null, "nothing kept yet");
    const kept = [{ text: "Yesss lemme send you the link", approved: true }, { text: "Something tells me this is your week", approved: false }];
    assert((await dm("savework", { id, lines: kept })).ok === true, "saved");
    let d = await dmItem(id);
    assert(JSON.stringify(d.work_lines) === JSON.stringify(kept) && d.verdict === "pending" && d.draft_text.startsWith("Yesss lemme send you my link"), `kept, and the draft and verdict stay: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("savework", { id, lines: [{ text: "  Trimmed  ", approved: true }] });
    assert((await dmItem(id)).work_lines[0].text === "Trimmed", "trimmed");
    await dmFails("savework", { id, lines: [{ text: "  ", approved: true }] }, 400, "text");
    await dmFails("savework", { id, lines: [{ text: "Hi", approved: "yes" }] }, 400, "approved");
    await dmFails("savework", { id, lines: "nope" }, 400, "lines");
    await dm("savework", { id, lines: [] });
    assert(JSON.stringify((await dmItem(id)).work_lines) === "[]", "she deleted every line: kept as none, not as untouched");
    await dm("savework", { id, lines: null });
    assert((await dmItem(id)).work_lines === null, "null clears it");
    await dm("savework", { id, lines: kept });
    await dm("generatedraft", { id, variant: "again" });
    await dm("savedraft", { id, draft_text: "Alohaaa yes!!" });
    assert((await dmItem(id)).work_lines === null, "a new draft replaces what she was working on");
    await dm("savework", { id, lines: kept });
    await dm("publishitem", { id, revision_text: "Yesss lemme send you the link", remaining_text: "Something tells me this is your week" });
    d = await dmItem(id);
    assert(d.work_lines === null && d.leftover_text === "Something tells me this is your week", `a send splits it into what went and what's left: ${JSON.stringify(d).slice(0, 300)}`);
    await dm("confirmpublish", { id, ok: true });
  });
  await check("v1.22 a chat Instagram keeps in General starts in her General, and only a change on Instagram moves it again", async () => {
    const id = (await dm("createitem", { kind: "dm", sender: "gen.folder", incoming_text: "hi there", folder: "general" })).id;
    let d = await dmItem(id);
    assert(d.section === "general" && d.folder === "general", `starts in General: ${d.section}`);
    const later = new Date(Date.now() + 60_000).toISOString();
    await dm("updatethread", { id, folder: "general", thread_messages: [{ from: "them", kind: "text", text: "hi there", at: later }] });
    assert((await dmItem(id)).section === "general", "a newer message doesn't move a chat Instagram keeps in General");
    await dm("setchatsection", { id, section: "main" });
    await dm("updatethread", { id, folder: "general" });
    assert((await dmItem(id)).section === "main", "her own move holds while Instagram's folder stays the same");
    await dm("updatethread", { id, folder: "primary" });
    await dm("setchatsection", { id, section: "general" });
    await dm("updatethread", { id, folder: "general" });
    d = await dmItem(id);
    assert(d.section === "general", "Instagram moving it to General moves it here too");
    await dm("updatethread", { id, folder: "primary" });
    assert((await dmItem(id)).section === "main", "and moving it out brings it back to the inbox");
    const req = (await dm("createitem", { kind: "dm", sender: "req.folder", incoming_text: "hello", folder: "requests" })).id;
    assert((await dmItem(req)).section === "main", "a request isn't General");
  });
  // ---------- 1.23.0: Refresh pulls from Instagram (Arjang in room #1048: "a LIVE SYNC ... It should be RELIABLE") ----------
  await check("v1.25 Why it matches is the compose check's 4th check, a new why rechecks at once, and only covers that pass lead the queue", async () => {
    const a = await newItem("why-a.png"), b = await newItem("why-b.png");
    const reason = "Her open hands in the window light carry the quote's letting go, and the song's slow build lands it";
    await postJson(`/api/items/${b.id}/why`, { text: reason });
    await postJson(`/api/items/${a.id}/verify`); // the deck checks a cover ahead of time
    await postJson(`/api/items/${b.id}/verify`);
    const list = (await (await fetch(`${base}/api/items`)).json()).items;
    const A = list.find((i) => i.id === a.id), B = list.find((i) => i.id === b.id);
    assert(A.beacons && B.beacons && A.beaconsVersion === 2, `a check has the 4th check: ${JSON.stringify(A.beacons)}`);
    assert(A.beacons.WHY_WRITTEN === false && B.beacons.WHY_WRITTEN === true, `the why is checked: ${JSON.stringify([A.beacons, B.beacons])}`);
    assert(B.beacons.STEPS_VERIFIED === true, `the uploaded cover's quote and song are in stock: ${JSON.stringify(B.beacons)}`);
    const order = list.map((i) => i.id);
    assert(order.indexOf(b.id) < order.indexOf(a.id), "a cover that passes comes before one that doesn't");
    const bad = await fetch(`${base}/api/items/enqueue`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ imageUrl: "https://example.com/composed.jpg", driveId: "smoke-why-composed", quote: "a quote", song: "Artist - Song" }] }) });
    assert(bad.status === 400 && /why/i.test((await bad.json()).error), "a composed match can't enter the queue without its why");
  });
  await check("v1.23 an import finds a chat by its thread id and a comment by its comment id, so a pull never makes a copy", async () => {
    const t1 = new Date(Date.now() - 3_600_000).toISOString();
    const made = await dm("importitem", { kind: "dm", sender: "live.one", incoming_text: "are you around?", thread_id: "live-t1", folder: "primary",
      thread_messages: [{ from: "them", kind: "text", text: "are you around?", at: t1 }] });
    assert(made.created === true && Number.isInteger(made.id), `created: ${JSON.stringify(made)}`);
    const again = await dm("importitem", { kind: "dm", sender: "live.one", incoming_text: "are you around?", thread_id: "live-t1", folder: "primary",
      thread_messages: [{ from: "them", kind: "text", text: "are you around?", at: t1 }] });
    assert(again.created === false && again.id === made.id, `the same chat: ${JSON.stringify(again)}`);
    assert((await dm("listitems")).items.filter((i) => i.sender === "live.one").length === 1, "one row, however often it's pulled");
    const t2 = new Date(Date.now() - 1_800_000).toISOString();
    await dm("importitem", { kind: "dm", sender: "live.one", incoming_text: "are you around?\nfor a call", thread_id: "live-t1",
      thread_messages: [{ from: "them", kind: "text", text: "are you around?", at: t1 }, { from: "them", kind: "text", text: "for a call", at: t2 }] });
    const fresh = await dmItem(made.id);
    assert(fresh.incoming_text === "are you around?\nfor a call" && fresh.last_activity_at === t2, `a chat she hasn't touched takes their latest words: ${JSON.stringify(fresh).slice(0, 300)}`);
    const c = await dm("importitem", { kind: "comment", sender: "live.fan", incoming_text: "obsessed", comment_id: "live-c1", media_id: "live-m1",
      media_preview_url: "https://example.com/live.jpg", following: true });
    const c2 = await dm("importitem", { kind: "comment", sender: "live.fan", incoming_text: "obsessed", comment_id: "live-c1", media_id: "live-m1",
      media_preview_url: "https://example.com/live2.jpg", following: true });
    assert(c.created === true && c2.created === false && c2.id === c.id && (await dmItem(c.id)).media_preview_url === "https://example.com/live2.jpg",
      "a comment is the same comment, and its fresh preview lands");
    await dmFails("importitem", { kind: "dm", sender: "x", incoming_text: "hi" }, 400, "thread_id");
    await dmFails("importitem", { kind: "comment", sender: "x", incoming_text: "hi" }, 400, "comment_id");
    await dmFails("importitem", { kind: "dm", sender: "x", incoming_text: "hi", thread_id: "h-1", source: "holdout", actual_reply: "x" }, 400, "source");
  });
  await check("v1.23 a pull never touches her drafts, kept edits, reviews or sends, and their new message after her reply is what the next draft answers", async () => {
    const id = (await dm("listitems")).items.find((i) => i.sender === "live.one").id;
    await dm("generatedraft", { id });
    await dm("savedraft", { id, draft_text: "Yesss for a bit" });
    await dm("savework", { id, lines: [{ text: "Yesss for a little bit", approved: true }] });
    await dm("publishitem", { id, revision_text: "Yesss for a little bit" });
    await dm("confirmpublish", { id, ok: true });
    const before = await dmItem(id);
    const t1 = before.thread_messages[0].at, mine = new Date(Date.now() - 60_000).toISOString(), theirs = new Date(Date.now() + 60_000).toISOString();
    const pulled = await dm("importitem", { kind: "dm", sender: "live.one", incoming_text: "are you around?", thread_id: "live-t1", ig_read: true,
      thread_messages: [{ from: "them", kind: "text", text: "are you around?", at: t1 }, { from: "me", kind: "text", text: "Yesss for a little bit", at: mine },
        { from: "them", kind: "text", text: "can I call you later?", at: theirs }] });
    const after = await dmItem(id);
    for (const k of ["draft_text", "revision_text", "verdict", "publish_status", "published_text", "published_at", "incoming_text", "label"]) {
      assert(JSON.stringify(after[k]) === JSON.stringify(before[k]), `${k} changed: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`);
    }
    assert(pulled.created === false && after.ig_read === true && after.thread_messages.length === 3, `the facts and the thread move: ${JSON.stringify(after).slice(0, 300)}`);
    await dm("generatedraft", { id, variant: "again" });
    const w = (await dm("draftswanted")).items.find((i) => i.id === id);
    assert(w.prompt.includes("Their message: can I call you later?"), `the next draft answers their new message: ${w.prompt}`);
    await dm("savedraft", { id, draft_text: "Ooooh yes after six" });
  });
  await check("v1.23 a chat brought in for its history comes back to Needs Reply when they write again", async () => {
    const t0 = Date.now() - 3600_000;
    const at = (m) => new Date(t0 + m * 60_000).toISOString();
    const two = [{ kind: "text", from: "them", text: "hi", at: at(0) }, { kind: "text", from: "me", text: "Hello!!", at: at(1) }];
    const three = [...two, { kind: "text", from: "them", text: "you there?", at: at(2) }];
    const { id } = await dm("importitem", { kind: "dm", thread_id: "t-hist-1230", sender: "hist.person", incoming_text: "", needs_reply: false, thread_messages: two });
    const get = async () => (await dm("listitems")).items.find((i) => i.id === id);
    assert((await get()).needs_reply === false, "history only at first");
    await dm("importitem", { kind: "dm", thread_id: "t-hist-1230", incoming_text: "you there?", thread_messages: three });
    assert((await get()).needs_reply === true, "their new message makes it need a reply");
    await dm("importitem", { kind: "dm", thread_id: "t-hist-1230", needs_reply: false, thread_messages: three });
    assert((await get()).needs_reply === false, "a fact her Muse sends still wins");
  });
  await check("v1.23 a DM brought in before thread ids were kept is matched by its handle once, never copied", async () => {
    const { id } = await dm("createitem", { kind: "dm", sender: "@old.friend", incoming_text: "long time" });
    const r = await dm("importitem", { kind: "dm", thread_id: "t-old-1230", sender: "old.friend", incoming_text: "long time" });
    assert(r.id === id && r.created === false, `the chat she has is the one the pull finds: ${JSON.stringify(r)}`);
    const again = await dm("importitem", { kind: "dm", thread_id: "t-old-1230", sender: "old.friend", incoming_text: "long time" });
    assert(again.id === id, "and its thread id finds it from then on");
    assert((await dm("listitems")).items.filter((i) => i.sender.replace(/^@/, "") === "old.friend").length === 1, "one chat, no copy");
  });
  await check("v1.23 Refresh asks for one pull at a time, her Muse reads what's asked and since when, and its report says what changed", async () => {
    let s = await dm("getsync");
    assert(s.state === "off" && s.last_synced_at === null && s.asked_at === null, `no pull is set up until her Muse reads syncwanted: ${JSON.stringify(s)}`);
    assert((await dm("requestsync")).state === "off" && (await dm("getsync")).asked_at === null, "Refresh asks nothing of a copy with no pull");
    assert((await dm("syncwanted")).wanted === false, "nothing asked");
    s = await dm("getsync");
    assert(s.state === "idle" && s.last_synced_at === null && s.asked_at === null, `her Muse is there now: ${JSON.stringify(s)}`);
    await dmFails("confirmsync", { ok: true }, 409, "no pull");
    const asked = await dm("requestsync");
    assert(asked.state === "syncing" && typeof asked.asked_at === "string", `asked: ${JSON.stringify(asked)}`);
    const twice = await dm("requestsync");
    assert(twice.asked_at === asked.asked_at, "a second tap while it runs asks nothing new");
    const want = await dm("syncwanted");
    assert(want.wanted === true && want.asked_at === asked.asked_at && want.since === null, `her Muse reads it: ${JSON.stringify(want)}`);
    await dmFails("confirmsync", { ok: true, imported: -1 }, 400, "imported");
    await dm("confirmsync", { ok: true, imported: 3, updated: 5, skipped: 1, detail: "1 thread couldn't be read" });
    s = await dm("getsync");
    assert(s.state === "idle" && typeof s.last_synced_at === "string" && s.asked_at === null && s.last_error === null, `done: ${JSON.stringify(s)}`);
    assert(JSON.stringify(s.last_result) === JSON.stringify({ imported: 3, updated: 5, skipped: 1 }) && s.note === "1 thread couldn't be read", `what changed: ${JSON.stringify(s)}`);
    await dm("requestsync");
    assert((await dm("syncwanted")).since === asked.asked_at, "the next pull asks only for what changed since the last good one started");
    await dm("confirmsync", { ok: false, detail: "Instagram said wait a minute", imported: 120, updated: 4 });
    s = await dm("getsync");
    assert(s.state === "failed" && s.last_error === "Instagram said wait a minute" && s.last_synced_at !== null, `a failed pull says why: ${JSON.stringify(s)}`);
    assert(JSON.stringify(s.failed_result) === JSON.stringify({ imported: 120, updated: 4, skipped: 0 }), `a pull that stopped partway says what it brought in: ${JSON.stringify(s)}`);
    assert(JSON.stringify(s.last_result) === JSON.stringify({ imported: 3, updated: 5, skipped: 1 }), "the last good pull's counts stay as they were");
    await dm("requestsync");
    assert((await dm("syncwanted")).since === asked.asked_at, "a failed pull leaves the cursor where the last good one put it");
    await dm("confirmsync", { ok: true, imported: 0, updated: 0 });
  });
  await check("v1.23 a pull that hasn't reported back in time shows as stuck, and Refresh starts a new one", async () => {
    const first = await dm("requestsync");
    await new Promise((r) => setTimeout(r, 2700));
    const s = await dm("getsync");
    assert(s.state === "stuck" && s.asked_at === first.asked_at, `stuck: ${JSON.stringify(s)}`);
    const next = await dm("requestsync");
    assert(next.state === "syncing" && next.asked_at !== first.asked_at, `a new pull: ${JSON.stringify(next)}`);
    await dmFails("confirmsync", { ok: true, asked_at: first.asked_at }, 409, "newer");
    await dm("confirmsync", { ok: true, asked_at: next.asked_at, imported: 0, updated: 2 });
    assert((await dm("getsync")).state === "idle", "the new one reports");
  });
  await check("v1.14 every class the Chats screen uses has a rule in its stylesheet (after changing classes: node scripts/dm-css.mjs)", async () => {
    const dir = new URL("../client/src/dm/", import.meta.url).pathname;
    const css = readFileSync(join(dir, "dm-tw.css"), "utf8") + readFileSync(join(dir, "dm.css"), "utf8");
    const have = new Set([...css.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1")));
    // The words inside className="..." and the strings inside className={...}, template literals included.
    const used = new Set();
    const add = (text) => { for (const t of text.split(/\s+/)) if (t) used.add(t); };
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".jsx"))) {
      const src = readFileSync(join(dir, f), "utf8");
      for (let i = src.indexOf("className="); i !== -1; i = src.indexOf("className=", i)) {
        i += 10;
        if (src[i] === '"') { const end = src.indexOf('"', i + 1); add(src.slice(i + 1, end)); i = end + 1; continue; }
        if (src[i] !== "{") continue;
        let depth = 0, j = i;
        for (; j < src.length; j++) {
          const c = src[j];
          if (c === '"' || c === "'") { const end = src.indexOf(c, j + 1); add(src.slice(j + 1, end)); j = end; continue; }
          if (c === "`") {
            let k = j + 1, chunk = "";
            while (k < src.length && src[k] !== "`") {
              if (src[k] === "$" && src[k + 1] === "{") {
                add(chunk); chunk = "";
                let d = 1; k += 2;
                while (d > 0) {
                  const ch = src[k];
                  if (ch === "{") d++;
                  else if (ch === "}") d--;
                  else if (ch === '"' || ch === "'") { const end = src.indexOf(ch, k + 1); add(src.slice(k + 1, end)); k = end; }
                  k++;
                }
                continue;
              }
              chunk += src[k]; k++;
            }
            add(chunk); j = k; continue;
          }
          if (c === "{") depth++;
          else if (c === "}" && --depth === 0) break;
        }
        i = j + 1;
      }
    }
    const missing = [...used].filter((t) => !have.has(t));
    assert(used.size > 200, `found only ${used.size} classes`);
    assert(!missing.length, `classes with no rule: ${missing.join(" ")}`);
  });
  // The Beeline screen (1.16): its text rules, its key handling and its styles. The screen itself is checked in a
  // browser against a stand-in Beeline; these hold the rules that don't need one.
  await check("v1.16 Beeline: ==words== and his name are yellow, an open ask's words carry its number, code stays plain", async () => {
    const h = fmt("Ask ==#3 Push now?== for Arjang, ==npm test 182== and `==#4 not a mark==`", { agent: true, owner: "Arjang" });
    assert(h.includes('<mark class="blAsk" data-ask="3"><span class="blAskN">3</span>Push now?</mark>'), h);
    assert(h.includes('<mark class="blHl">Arjang</mark>') && h.includes('<mark class="blHl">npm test 182</mark>'), h);
    assert(h.includes("<code>==#4 not a mark==</code>"), h);
    const mine = fmt("Arjang here ==hi==", { agent: false, owner: "Arjang" });
    assert(!mine.includes('<mark class="blHl">Arjang</mark>') && mine.includes('<mark class="blHl">hi</mark>'), mine);
    const poss = fmt("It's Arjang's call", { agent: true, owner: "Arjang" });
    assert(poss.includes('<mark class="blHl">Arjang&#39;s</mark>'), poss);
    assert(!fmt("Arjangs and Arjang2", { agent: true, owner: "Arjang" }).includes("<mark"), "a longer word isn't his name");
  });
  await check("v1.16 Beeline: links stop before ==, open safely, a highlight can hold one, and no raw HTML gets through", async () => {
    const h = fmt("==see https://example.com/x== and https://example.com/a==b", {});
    assert(h.includes('<mark class="blHl">see <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a></mark>'), h);
    assert(h.includes('href="https://example.com/a"'), h);
    const x = fmt('<img src=x onerror="alert(1)"> **bold** javascript:alert(1)', {});
    assert(!x.includes("<img") && x.includes("&lt;img") && x.includes("<strong>bold</strong>") && !x.includes('href="javascript'), x);
  });
  await check("v1.16 Beeline: an open ask gets a color rule, a closed ask or a bad color gets none", async () => {
    const css = askCss([{ n: 2, color: "#FB923C" }, { n: 4, color: "red;}body{display:none" }, { n: 0, color: "#000000" }]);
    assert(css.includes('mark.blAsk[data-ask="2"]{--ask:#FB923C;') && !css.includes('data-ask="4"') && !css.includes('data-ask="0"'), css);
    assert(askCss([]) === "" && askCss(null) === "", "no asks, no rules");
  });
  await check("v1.16 Beeline: a poke says how it reaches the agent", async () => {
    const fresh = { ago: 5, problem: null };
    assert(pokeReach({ wake: "live", live: true }, "Quill", false, fresh) === "Poked Quill. It's in the room, so it sees it right away.");
    assert(pokeReach({ wake: "queued" }, "Claude", false, fresh) === "Poked Claude. Starting its chat from your Mac.");
    assert(pokeReach({ wake: "queued" }, "Claude", true, fresh) === "Poked Claude again. Starting its chat from your Mac.");
    assert(pokeReach({ wake: "queued" }, "Claude", false, { ago: 5, problem: "signin" }).includes("needs Claude signed in again"));
    assert(pokeReach({ wake: "queued" }, "Claude", false, { ago: 900, problem: null }).includes("when your Mac wakes up"));
    assert(pokeReach({ wake: "queued" }, "Claude", false, null).includes("once the relay on your Mac is set up"));
    assert(pokeReach({ wake: null, checkin_every: 900 }, "Bee", false, fresh) === "Poked Bee. It sees it at its next check-in, about every 15 min.");
    assert(pokeReach({ wake: null }, "Bee", false, fresh).includes("sees it when it comes back"));
  });
  await check("v1.16 Beeline: Beeline's own refusals show once, and its codes in plain words", async () => {
    assert(why("Not sent: it's over the 8000-character limit.") === "it's over the 8000-character limit.");
    assert(why("bad_key") === "this device was disconnected" && why("no_ask") === "it's already closed" && why("") === "something went wrong");
  });
  await check("v1.16 Beeline: device keys, and file links that carry no key", async () => {
    const key = "bld_" + "ab".repeat(32);
    assert(looksLikeKey(" " + key.slice(0, 20) + "\n" + key.slice(20) + " ") && cleanKey(" " + key + "\n") === key, "a pasted key with spaces and a line break");
    assert(!looksLikeKey("bl_" + "a".repeat(64)) && !looksLikeKey(key + "0") && !looksLikeKey(key.toUpperCase()), "not keys");
    const u = fileUrl("demo", "1795204800.0123456789abcdef0123456789abcdef", 72, true);
    assert(u.endsWith("/app/file/72?r=demo&t=1795204800.0123456789abcdef0123456789abcdef&thumb=1"), u);
    assert(fileUrl("demo", "", 72) === "" && fileUrl("", "t", 72) === "", "no link without a room and a token");
  });
  await check("v1.16 Beeline: a device key belongs to the account signed in on this browser, so another account there never gets it", async () => {
    const kept = new Map();
    const was = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) };
    try {
      const key = "bld_" + "cd".repeat(32);
      saveDevice({ key, name: "Mac" }, "arjang");
      assert(savedDevice("arjang")?.key === key, "her own account finds it");
      assert(savedDevice("someone.else") === null && savedDevice(null) === null, "another account, or no account, finds nothing");
      forgetDevice("someone.else");
      assert(savedDevice("arjang")?.key === key, "another account's disconnect leaves hers alone");
      forgetDevice("arjang");
      assert(savedDevice("arjang") === null, "her disconnect forgets it");
    } finally { globalThis.localStorage = was; }
  });
  await check("v1.16 Beeline: the key stays in this browser and goes only in a header, and the switch opens the screen", async () => {
    const dir = new URL("../client/src/", import.meta.url).pathname;
    const screen = readFileSync(join(dir, "beeline/BeelineScreen.jsx"), "utf8");
    const api = readFileSync(join(dir, "beeline/beelineApi.js"), "utf8");
    const main = readFileSync(join(dir, "main.jsx"), "utf8");
    assert(!/localStorage|x-beeline-key/.test(screen), "only beelineApi.js touches the key");
    assert((api.match(/x-beeline-key/g) || []).length === 1 && api.includes('headers: { ...(options.headers || {}), "x-beeline-key": key }'), "the key goes in one header");
    assert(!/[?&]key=|\/app\/[^"]*\$\{key\}/.test(api), "the key is never in an address");
    const serverFiles = execFileSync("git", ["ls-files", "server"], { cwd: join(dir, "../..") }).toString();
    assert(!/beeline/i.test(serverFiles), "the server takes no part");
    assert(main.includes('lazy(() => import("./beeline/BeelineScreen.jsx"))') && main.includes('tab("beeline", "Beeline")') && main.includes('active={screen === "beeline"}'), "the switch opens it");
  });
  await check("v1.16 Beeline: every class the screen uses has a rule in beeline.css", async () => {
    const dir = new URL("../client/src/beeline/", import.meta.url).pathname;
    const code = readFileSync(join(dir, "BeelineScreen.jsx"), "utf8") + readFileSync(join(dir, "beelineText.js"), "utf8");
    const css = readFileSync(join(dir, "beeline.css"), "utf8");
    const used = new Set();
    for (const m of code.matchAll(/className=(\{[^}]*\}|"[^"]*")|class=\\?"([^"\\]*)|classList\.(?:add|remove)\("([^"]+)"\)/g)) {
      for (const t of String(m[1] || m[2] || m[3]).matchAll(/\bbl[A-Z][A-Za-z0-9]*\b/g)) used.add(t[0]);
    }
    const have = new Set([...css.matchAll(/\.(bl[A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]));
    const missing = [...used].filter((c) => !have.has(c));
    assert(used.size > 60, `found only ${used.size} classes`);
    assert(!missing.length, `classes with no rule: ${missing.join(" ")}`);
  });
  // Open calls as cards (1.19): Arjang approves, rejects or edits each one, and his answer goes to Beeline's decide route.
  await check("v1.19 Beeline: his answer to a call goes to Beeline's decide route with his words, and its refusals read plain", async () => {
    const was = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url, opts) => {
      seen.push({ url: String(url), opts });
      return new Response(JSON.stringify({ ok: true, n: 7, outcome: "edited", agent: "Quill" }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const key = "bld_" + "ef".repeat(32);
      const r = await decide(key, 7, "edited", "Use 4:5 for feed posts");
      assert(r.outcome === "edited" && seen.length === 1, JSON.stringify(r));
      const body = JSON.parse(seen[0].opts.body);
      assert(seen[0].url.endsWith("/app/ask/decide") && seen[0].opts.method === "POST" && seen[0].opts.headers["x-beeline-key"] === key, seen[0].url);
      assert(body.n === 7 && body.outcome === "edited" && body.text === "Use 4:5 for feed posts", seen[0].opts.body);
      await decide(key, 8, "approved");
      assert(JSON.parse(seen[1].opts.body).text === null && JSON.parse(seen[1].opts.body).outcome === "approved", seen[1].opts.body);
    } finally { globalThis.fetch = was; }
    assert(why("closed") === "it was already answered or closed" && why("no_text") === "write your answer first", "decide's codes in plain words");
  });
  await check("v1.19 Beeline: each open call is a card with Approve, Reject and Edit, and folding the cards holds on this browser", async () => {
    const screen = readFileSync(new URL("../client/src/beeline/BeelineScreen.jsx", import.meta.url).pathname, "utf8");
    assert(screen.includes('onTap("ok", n)') && screen.includes('onTap("no", n)') && screen.includes("onEdit(n)") && screen.includes('onTap("x", n)'), "Approve, Reject, Edit and close on every card");
    assert(screen.includes("api.decide(key, n, outcome, words)") && !screen.includes("Open asks"), "answers go through decide, and the old ask chips are gone");
    const kept = new Map();
    const was = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) };
    try {
      assert(callsFolded() === false, "the cards show by default");
      setCallsFolded(true);
      assert(callsFolded() === true, "folded stays folded");
      setCallsFolded(false);
      assert(callsFolded() === false, "and opens again");
    } finally { globalThis.localStorage = was; }
  });
  // 1.20.0 (Big Edit items 1, 2 and 4, Arjang Nov 23): her colors first with one default, one font and one color for
  // every cover in the queue, and her own fonts from her data folder.
  const sendJson = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const palette = async () => (await fetch(`${base}/api/palette`)).json();
  const BRAND = [{ name: "Sea Glass", hex: "#9fe2bf" }, { name: "Peach", hex: "#FFCBA4", default: true }, { name: "Sand", hex: "#F4E1C1" }, { name: "White", hex: "#FFFFFF" }];
  await check("v1.20 brand colors: her colors in her order with one default, answered with the palette; a bad list is refused", async () => {
    const none = await palette();
    assert(Array.isArray(none.brandColors) && none.brandColors.length === 0, `none by default: ${JSON.stringify(none.brandColors)}`);
    assert(none.lock && none.lock.textFont === null && none.lock.textColor === null, `nothing locked by default: ${JSON.stringify(none.lock)}`);
    const set = await postJson("/api/palette/brand", { colors: BRAND });
    assert(set.brandColors.map((c) => c.hex).join(",") === "#9FE2BF,#FFCBA4,#F4E1C1,#FFFFFF", `her order, hex upper case: ${JSON.stringify(set.brandColors)}`);
    assert(set.brandColors.map((c) => c.name).join(",") === "Sea Glass,Peach,Sand,White", "her names");
    assert(set.brandColors.filter((c) => c.default).length === 1 && set.brandColors[1].default === true, "one default");
    assert((await palette()).brandColors.length === 4, "kept");
    for (const bad of [{ colors: "pink" }, { colors: [{ name: "Pink", hex: "pink" }] }, { colors: [{ name: "", hex: "#000000" }] },
      { colors: [{ name: "A", hex: "#000000", default: true }, { name: "B", hex: "#111111", default: true }] },
      { colors: Array.from({ length: 13 }, (_, i) => ({ name: `C${i}`, hex: "#000000" })) }]) {
      const r = await sendJson("/api/palette/brand", bad);
      assert(r.status === 400, `refused: ${JSON.stringify(bad).slice(0, 80)} answered ${r.status}`);
    }
    assert((await palette()).brandColors.length === 4, "a refused list changes nothing");
  });
  await check("v1.33 search answers covers in every list by a word or a number", async () => {
    const a = await newItem("search-a.png");
    await postJson(`/api/items/${a.id}/description`, { text: "Purple wisteria over a garden path" });
    let r = await (await fetch(`${base}/api/items/search?q=wisteria`)).json();
    assert(r.items.some((i) => i.id === a.id), `a word in the description: ${JSON.stringify(r).slice(0, 200)}`);
    r = await (await fetch(`${base}/api/items/search?q=${String(a.id).padStart(3, "0")}`)).json();
    assert(r.items[0]?.id === a.id, "its number, with zeros in front");
    r = await (await fetch(`${base}/api/items/search?q=`)).json();
    assert(Array.isArray(r.items) && r.items.length === 0, "an empty search finds nothing");
  });
  await check("v1.26 no queue lock: each cover keeps its own color and font, the lock is gone from her settings, and the old endpoint is gone", async () => {
    const r = await sendJson("/api/text-lock", { textColor: "#FB0909" });
    assert(r.status === 404, `the queue lock is retired: ${r.status}`);
    const p = await palette();
    assert(!p.lock || (p.lock.textColor === null && p.lock.textFont === null), `no lock in the palette: ${JSON.stringify(p.lock)}`);
    const a = await newItem("own-a.png"), b = await newItem("own-b.png");
    await postJson(`/api/items/${a.id}/style`, { textColor: "#FB0909" });
    const list = (await (await fetch(`${base}/api/items`)).json()).items;
    const A = list.find((i) => i.id === a.id), B = list.find((i) => i.id === b.id);
    assert(A.textColor === "#FB0909" && A.textColorSet === true && B.textColor !== "#FB0909" && !B.textColorSet, "one cover's color stays on that cover");
    assert(A.fontWeight === 500 && A.textFont === "tiktok", `new text starts in TikTok Sans Medium: ${A.textFont} ${A.fontWeight}`);
  });
  await check("v1.32 Skip sends a queued cover to the very end, past waiting covers too, and changes nothing else (room #1248, Quill #1249)", async () => {
    const a = await newItem("skip-a.png"), b = await newItem("skip-b.png");
    const before = (await (await fetch(`${base}/api/items`)).json()).items;
    const was = before.find((i) => i.id === a.id);
    const r = await postJson(`/api/items/${a.id}/skip`, {});
    assert(r.item.status === "queue" && typeof r.item.skippedAt === "number", `still queued, marked: ${JSON.stringify(r.item).slice(0, 200)}`);
    let list = (await (await fetch(`${base}/api/items`)).json()).items;
    assert(list.length === before.length && list.at(-1).id === a.id, `last of ${list.length}: ${list.at(-1)?.id}`);
    const now = list.at(-1);
    for (const k of ["quote", "song", "caption", "textColor", "fontWeight", "description", "why", "slides", "imageUrl"]) {
      assert(JSON.stringify(now[k]) === JSON.stringify(was[k]), `${k} unchanged`);
    }
    await postJson(`/api/items/${b.id}/skip`, {});
    list = (await (await fetch(`${base}/api/items`)).json()).items;
    assert(list.at(-2).id === a.id && list.at(-1).id === b.id, "a second skip goes after the first");
    await postJson(`/api/items/${a.id}/skip`, {});
    list = (await (await fetch(`${base}/api/items`)).json()).items;
    assert(list.at(-1).id === a.id, "skipping again sends it to the end again");
    const decided = await postJson(`/api/items/${b.id}/decide`, { decision: "approved" });
    assert(decided.item.skippedAt === undefined, "a decision clears the mark");
    const refused = await fetch(`${base}/api/items/${b.id}/skip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert(refused.status === 409, `only a queued cover: ${refused.status}`);
    await postJson(`/api/items/${b.id}/decide`, { decision: "queue" });
  });
  await check("v1.26 the color pass sets a cover's own color from its photo, never over one she picked, and custom colors keep the 5 newest", async () => {
    const a = await newItem("auto-a.png"), b = await newItem("auto-b.png");
    await postJson(`/api/items/${b.id}/style`, { textColor: "#123456" });
    const ra = await postJson(`/api/items/${a.id}/auto-color`, { textColor: "#fbfa38" });
    assert(ra.item.textColor === "#FBFA38" && ra.item.colorAuto === true && !ra.item.textColorSet, `picked: ${JSON.stringify(ra.item).slice(0, 200)}`);
    const rb = await postJson(`/api/items/${b.id}/auto-color`, { textColor: "#FFFFFF" });
    assert(rb.skipped === true && rb.item.textColor === "#123456", "a color she picked stays");
    assert((await sendJson(`/api/items/${a.id}/auto-color`, { textColor: "yellow" })).status === 400, "a bad color is refused");
    for (const hex of ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]) await postJson(`/api/items/${b.id}/style`, { textColor: hex });
    const cc = (await palette()).customColors;
    assert(JSON.stringify(cc) === JSON.stringify(["#666666", "#555555", "#444444", "#333333", "#222222"]), `the 5 newest, newest first: ${JSON.stringify(cc)}`);
  });
  await check("v1.20 her own fonts: a font file with a name and a weight joins the fonts, is served only signed in, and covers take it", async () => {
    const FAKE_TTF = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.from("a stand-in font body for the smoke test")]);
    const sendFont = async (bytes, fields, name = "Test-Sans.ttf") => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
      form.append("font", new Blob([bytes], { type: "font/ttf" }), name);
      return fetch(`${base}/api/fonts`, { method: "POST", body: form });
    };
    const r = await sendFont(FAKE_TTF, { label: "Test Sans", weight: 400 });
    assert(r.ok, `uploaded: ${r.status} ${await r.clone().text()}`);
    const j = await r.json();
    const font = j.customFonts.find((f) => f.label === "Test Sans");
    assert(font && font.id === "custom-test-sans" && j.fonts.includes("custom-test-sans"), `in the fonts: ${JSON.stringify(j.customFonts)}`);
    assert(font.faces.length === 1 && font.faces[0].weight === 400 && font.faces[0].url.startsWith("/api/fonts/"), `one face: ${JSON.stringify(font.faces)}`);
    const served = await fetch(`${base}${font.faces[0].url}`);
    assert(served.ok && Buffer.from(await served.arrayBuffer()).equals(FAKE_TTF), "served as uploaded, signed in");
    assert((await realFetch(`${base}${font.faces[0].url}`)).status === 401, "a font file needs a session, like her photos");
    const bold = await (await sendFont(FAKE_TTF, { label: "Test Sans", weight: 700 }, "Test-Sans-Bold.ttf")).json();
    assert(bold.customFonts.find((f) => f.id === "custom-test-sans").faces.map((f) => f.weight).join(",") === "400,700", "a second weight adds a face");
    const it = await newItem("font.png");
    const styled = await postJson(`/api/items/${it.id}/style`, { textFont: "custom-test-sans", extraTexts: [{ quote: "hi", textFont: "custom-test-sans" }] });
    assert(styled.item.textFont === "custom-test-sans" && styled.item.extraTexts[0].textFont === "custom-test-sans", "a cover and its text boxes take her font");
    for (const [bytes, fields, why] of [[Buffer.from("not a font at all"), { label: "Junk", weight: 400 }, "not a font file"],
      [FAKE_TTF, { label: "", weight: 400 }, "no name"], [FAKE_TTF, { label: "Odd", weight: 450 }, "weight off the 100 steps"]]) {
      const bad = await sendFont(bytes, fields);
      assert(bad.status === 400, `refused, ${why}: ${bad.status}`);
    }
    const ignored = readFileSync(new URL("../.gitignore", import.meta.url).pathname, "utf8");
    assert(ignored.split("\n").includes("data/fonts/"), "her fonts stay out of the repo: data/fonts/ is ignored");
  });
  await check("v1.20 a text box can sit on a carousel photo: its photo is kept while that photo exists, and each photo holds up to 5", async () => {
    const it = await newItem("slides-text.png");
    const form = new FormData();
    form.append("slide", new Blob([PNG_1PX], { type: "image/png" }), "second.png");
    await fetch(`${base}/api/items/${it.id}/slides`, { method: "POST", body: form });
    const box = (quote, slide) => ({ quote, ...(slide === undefined ? {} : { slide }) });
    const sent = [box("on the cover"), box("on photo two", 0), box("no such photo", 3), box("not a number", "x"), box("negative", -1),
      ...Array.from({ length: 6 }, (_, i) => box(`two ${i}`, 0)), ...Array.from({ length: 5 }, (_, i) => box(`cover ${i}`))];
    const saved = (await postJson(`/api/items/${it.id}/style`, { extraTexts: sent })).item.extraTexts;
    const onTwo = saved.filter((b) => b.slide === 0), onCover = saved.filter((b) => b.slide === undefined || b.slide === null);
    assert(onTwo.length === 5 && onTwo[0].quote === "on photo two", `photo two holds 5: ${JSON.stringify(onTwo.map((b) => b.quote))}`);
    assert(onCover.length === 5 && onCover[0].quote === "on the cover", `the cover holds 5: ${JSON.stringify(onCover.map((b) => b.quote))}`);
    assert(!saved.some((b) => ["no such photo", "not a number", "negative"].includes(b.quote)), "a box on a photo that isn't there is dropped");
  });
  await check("v1.35 Save Color keeps a color in her custom colors, newest first, with no limit, apart from her recent colors", async () => {
    const start = await (await fetch(`${base}/api/palette`)).json();
    assert(Array.isArray(start.savedColors), `the palette lists saved colors: ${JSON.stringify(start).slice(0, 200)}`);
    const hexes = Array.from({ length: 9 }, (_, i) => `#0${i}AA${i}${i}`);
    let pal = start;
    for (const hex of hexes) pal = await postJson(`/api/palette/saved-colors`, { hex: hex.toLowerCase() });
    assert(pal.savedColors.length >= 9 && pal.savedColors[0] === hexes[8] && pal.savedColors.includes(hexes[0]), `no limit, newest first: ${JSON.stringify(pal.savedColors)}`);
    const again = await postJson(`/api/palette/saved-colors`, { hex: hexes[0] });
    assert(again.savedColors[0] === hexes[0] && again.savedColors.filter((c) => c === hexes[0]).length === 1, "saving one she has moves it to the front, once");
    assert(JSON.stringify(again.customColors) === JSON.stringify(start.customColors), "saving never touches her recent colors");
    const gone = await postJson(`/api/palette/saved-colors/remove`, { hex: hexes[3] });
    assert(!gone.savedColors.includes(hexes[3]) && gone.savedColors.length === again.savedColors.length - 1, JSON.stringify(gone.savedColors));
    for (const path of ["/api/palette/saved-colors", "/api/palette/saved-colors/remove"]) {
      const bad = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: "blue" }) });
      assert(bad.status === 400, `${path}: a bad color answers 400, got ${bad.status}`);
    }
    for (const hex of hexes) await postJson(`/api/palette/saved-colors/remove`, { hex });
  });
  await check("v1.36 Replace Photo puts a new photo behind the same text, on the cover or a carousel photo, and undo puts the old one back", async () => {
    const item = await newItem("replace.png");
    const before = (await postJson(`/api/items/${item.id}/edit`, { quote: "slow mornings" })).item;
    const NEW_PHOTO = Buffer.concat([PNG_1PX, Buffer.from([0])]); // a photo the cover can tell apart from the first
    const form = new FormData();
    form.append("photo", new Blob([NEW_PHOTO], { type: "image/png" }), "new.png");
    const r = await (await fetch(`${base}/api/items/${item.id}/photo`, { method: "POST", body: form })).json();
    assert(r.item?.imageUrl?.startsWith("/uploads/") && r.item.imageUrl !== before.imageUrl && r.photo?.mediaUrl === r.item.imageUrl, JSON.stringify(r).slice(0, 300));
    for (const key of ["quote", "caption", "song", "title", "textColor", "fontFamily", "extraTexts", "cta", "status"]) {
      assert(JSON.stringify(r.item[key]) === JSON.stringify(before[key]), `${key} stays the same: ${JSON.stringify(r.item[key])} vs ${JSON.stringify(before[key])}`);
    }
    const img = await fetch(`${base}/api/items/${item.id}/image`);
    assert(img.ok && (await img.arrayBuffer()).byteLength === NEW_PHOTO.length, "the cover draws from the new photo");
    const back = await postJson(`/api/items/${item.id}/photo`, { mediaUrl: before.imageUrl });
    assert(back.item.imageUrl === before.imageUrl && back.item.quote === before.quote, "undo sends the old photo back, text untouched");
    const slideForm = new FormData();
    slideForm.append("slide", new Blob([PNG_1PX], { type: "image/png" }), "s1.png");
    const was = (await (await fetch(`${base}/api/items/${item.id}/slides`, { method: "POST", body: slideForm })).json()).item.slides[0];
    const sf = new FormData();
    sf.append("slide", "0");
    sf.append("photo", new Blob([NEW_PHOTO], { type: "image/png" }), "s2.png");
    const rs = await (await fetch(`${base}/api/items/${item.id}/photo`, { method: "POST", body: sf })).json();
    assert(rs.item.slides[0].mediaUrl !== was.mediaUrl && rs.item.imageUrl === before.imageUrl && rs.photo.slide === 0, `a carousel photo changes, the cover doesn't: ${JSON.stringify(rs.photo)}`);
    const sb = await postJson(`/api/items/${item.id}/photo`, { slide: 0, mediaUrl: was.mediaUrl, mediaType: was.mediaType, title: was.title });
    assert(sb.item.slides[0].mediaUrl === was.mediaUrl && sb.item.slides[0].title === was.title, "undo on a carousel photo");
    const vf = new FormData();
    vf.append("photo", new Blob([Buffer.from("not a photo")], { type: "video/mp4" }), "clip.mp4");
    const video = await fetch(`${base}/api/items/${item.id}/photo`, { method: "POST", body: vf });
    assert(video.status === 400 && /photo/.test((await video.json()).error), `a video is refused, got ${video.status}`);
    const odd = await fetch(`${base}/api/items/${item.id}/photo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaUrl: "file:///etc/hosts" }) });
    assert(odd.status === 400, `an address that isn't a photo's is refused, got ${odd.status}`);
    const missing = await fetch(`${base}/api/items/${item.id}/photo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slide: 9, mediaUrl: was.mediaUrl }) });
    assert(missing.status === 404, `a slide that isn't there answers 404, got ${missing.status}`);
    assert((await postJson(`/api/items/${item.id}/photo`, { mediaUrl: before.imageUrl })).item.imageUrl === before.imageUrl, "a refused try changed nothing");
  });
  await check("v1.36 the comment CTA's line can be edited for one cover, keeps its keyword, and is what posts", async () => {
    await postJson(`/api/settings/caption-ctas`, { ctas: CALLS });
    try {
      const item = await newItem("cta-line.png");
      const edit = (body) => fetch(`${base}/api/items/${item.id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await postJson(`/api/items/${item.id}/edit`, { cta: "SLOW", caption: "golden hour" });
      const own = "Comment SLOW and the practice is yours!!";
      const set = await postJson(`/api/items/${item.id}/edit`, { ctaLine: { keyword: "slow", line: `  ${own} ` } });
      assert(set.item.ctaLine?.keyword === "SLOW" && set.item.ctaLine.line === own, JSON.stringify(set.item.ctaLine));
      assert(postedCaption(set.item, CALLS) === `${own} golden hour`, `what posts: ${postedCaption(set.item, CALLS)}`);
      const checked = await postJson(`/api/pollen/check`, { itemIds: [item.id] });
      assert(checked.items[0].caption === `${own} golden hour`, `Pollen gets her line: ${checked.items[0].caption}`);
      const lost = await edit({ ctaLine: { keyword: "SLOW", line: "Comment below and I'll send it!!" } });
      assert(lost.status === 400 && /SLOW/.test((await lost.json()).error), `a line without the keyword is refused, got ${lost.status}`);
      const unknown = await edit({ ctaLine: { keyword: "NOPE", line: "Comment NOPE now!!" } });
      assert(unknown.status === 400 && /comment CTA/.test((await unknown.json()).error), `a keyword that isn't on her list is refused, got ${unknown.status}`);
      const kept = (await postJson(`/api/items/${item.id}/edit`, { note: "hi" })).item;
      assert(kept.ctaLine?.line === own, "a refused line, and other edits, leave hers alone");
      const switched = (await postJson(`/api/items/${item.id}/edit`, { cta: "EFFORT" })).item;
      assert(postedCaption(switched, CALLS) === `${CALLS[1].line} golden hour`, "another keyword goes out with its own saved line");
      const backOn = (await postJson(`/api/items/${item.id}/edit`, { cta: "SLOW" })).item;
      assert(postedCaption(backOn, CALLS) === `${own} golden hour`, "her line for SLOW comes back with it");
      const same = (await postJson(`/api/items/${item.id}/edit`, { ctaLine: { keyword: "SLOW", line: CALLS[0].line } })).item;
      assert(!("ctaLine" in same), "her saved line word for word isn't a line of its own");
      await postJson(`/api/items/${item.id}/edit`, { ctaLine: { keyword: "SLOW", line: own } });
      const reset = (await postJson(`/api/items/${item.id}/edit`, { ctaLine: null })).item;
      assert(!("ctaLine" in reset) && postedCaption(reset, CALLS) === `${CALLS[0].line} golden hour`, "null goes back to her saved line");
    } finally {
      await postJson(`/api/settings/caption-ctas`, { ctas: [] });
    }
  });
  await check("v1.37 Choose From Queue adds other covers' photos as slides, in the order picked, up to 10 photos with the cover", async () => {
    const main = await newItem("carousel.png");
    const a = await newItem("from-a.png"), b = await newItem("from-b.png");
    const r = await postJson(`/api/items/${main.id}/slides/from`, { itemIds: [b.id, a.id] });
    assert(r.added === 2 && r.item.slides.length === 2, JSON.stringify(r).slice(0, 200));
    assert(r.item.slides[0].mediaUrl === b.imageUrl && r.item.slides[1].mediaUrl === a.imageUrl, "in the order she picked, the same photo files");
    assert(r.item.slides.every((s) => s.mediaType === "image" && s.deletedAt === null) && r.item.slides[0].fromItemId === b.id
      && r.item.slides[0].position === 0 && r.item.slides[1].position === 1, JSON.stringify(r.item.slides));
    const queued = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.map((i) => i.id);
    assert(queued.includes(a.id) && queued.includes(b.id), "the covers they came from stay in the queue");
    const inline = await newItem("inline.png");
    await postJson(`/api/items/${inline.id}/swap-photo`, { imageUrl: `data:image/png;base64,${PNG_1PX.toString("base64")}` });
    const copied = (await postJson(`/api/items/${main.id}/slides/from`, { itemIds: [inline.id] })).item.slides[2].mediaUrl;
    assert(copied.startsWith("/uploads/") && copied.endsWith(".png"), `a photo kept inline is copied in: ${copied}`);
    const got = await fetch(`${base}${copied}`);
    assert(got.ok && (await got.arrayBuffer()).byteLength === PNG_1PX.length, "the copy is the photo");
    const refuse = async (ids, status, why) => {
      const res = await fetch(`${base}/api/items/${main.id}/slides/from`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: ids }) });
      assert(res.status === status, `${why}: expected ${status}, got ${res.status}`);
      return (await res.json()).error;
    };
    await refuse([main.id], 400, "the cover itself");
    await refuse([a.id, a.id], 400, "the same cover twice");
    await refuse([], 400, "nothing picked");
    const passed = await newItem("passed.png");
    await postJson(`/api/items/${passed.id}/decide`, { decision: "rejected" });
    await refuse([passed.id], 400, "a passed cover");
    const more = [];
    for (let i = 0; i < 7; i += 1) more.push(await newItem(`more-${i}.png`));
    assert(/room for 6/.test(await refuse(more.map((m) => m.id), 409, "more than the room left")), "it says how many fit");
    const filled = await postJson(`/api/items/${main.id}/slides/from`, { itemIds: more.slice(0, 6).map((m) => m.id) });
    assert(filled.item.slides.filter((s) => !s.deletedAt).length === 9, "nine photos and the cover make ten");
    const form = new FormData();
    form.append("slide", new Blob([PNG_1PX], { type: "image/png" }), "eleventh.png");
    const plus = await fetch(`${base}/api/items/${main.id}/slides`, { method: "POST", body: form });
    assert(plus.status === 409 && /10 photos/.test((await plus.json()).error), `the + is full too, got ${plus.status}`);
    assert(/full/.test(await refuse([more[6].id], 409, "a full carousel")), "a full carousel says so");
    for (let at = 3; at < 9; at += 1) await postJson(`/api/items/${main.id}/slides/${at}/remove`);
    const after = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === main.id);
    assert(after.slides.filter((s) => !s.deletedAt).length === 3, "undo takes them off one by one");
  });
  await check("v1.40 Rewind brings a skipped cover back to its exact place, on the server, so it holds after a reload (room #1409, Quill #1410)", async () => {
    const a = await newItem("unskip-a.png"), b = await newItem("unskip-b.png"), c = await newItem("unskip-c.png");
    const order = async () => (await (await fetch(`${base}/api/items`)).json()).items.map((i) => i.id);
    const before = await order();
    const steps = [];
    for (const it of [a, b, c]) {
      const r = await postJson(`/api/items/${it.id}/skip`, {});
      assert(r.previous && "reviewOrderAt" in r.previous && "skippedAt" in r.previous, `skip answers where it was: ${JSON.stringify(r.previous)}`);
      steps.push({ id: it.id, previous: r.previous });
    }
    assert((await order()).slice(-3).join() === [a.id, b.id, c.id].join(), "three skips sit at the end, in order");
    // Last in, first out: each comes back, and the list reads as it did before that skip.
    for (const st of steps.reverse()) {
      const r = await postJson(`/api/items/${st.id}/unskip`, { previous: st.previous });
      assert(r.item.status === "queue" && r.item.rating == null, "nothing else about it changes");
    }
    assert((await order()).join() === before.join(), `every cover is back in its place: ${(await order()).join()} vs ${before.join()}`);
    const again = (await (await fetch(`${base}/api/items`)).json()).items.find((i) => i.id === a.id);
    assert(again.skippedAt === undefined, "its skip mark is gone, as before the skip");
    // A cover skipped twice goes back to its first skip's place at the end, mark and all.
    const one = await postJson(`/api/items/${a.id}/skip`, {});
    const two = await postJson(`/api/items/${a.id}/skip`, {});
    assert(two.previous.skippedAt === one.item.skippedAt && two.previous.reviewOrderAt === one.item.reviewOrderAt, "a second skip remembers the first");
    const back = await postJson(`/api/items/${a.id}/unskip`, { previous: two.previous });
    assert(back.item.skippedAt === one.item.skippedAt && back.item.reviewOrderAt === one.item.reviewOrderAt, "and goes back to it");
    await postJson(`/api/items/${a.id}/unskip`, { previous: one.previous });
    assert((await order()).join() === before.join(), "then to where it started");
    const bad = await fetch(`${base}/api/items/${a.id}/unskip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previous: { reviewOrderAt: "soon", skippedAt: null } }) });
    assert(bad.status === 400, `a place that isn't a time is refused: ${bad.status}`);
    await postJson(`/api/items/${b.id}/decide`, { decision: "approved" });
    const refused = await fetch(`${base}/api/items/${b.id}/unskip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previous: steps[1].previous }) });
    assert(refused.status === 409, `only a queued cover goes back to its place: ${refused.status}`);
    await postJson(`/api/items/${b.id}/decide`, { decision: "queue" });
  });
  await check("v1.40 Rewind brings back the cover she passed on last, to the front of the queue, until Passed is empty (room #1411, Quill #1412)", async () => {
    const count = async (st) => (await (await fetch(`${base}/api/items?status=${st}`)).json()).items.length;
    // Start from an empty Passed, so the order below is this test's own.
    for (const i of (await (await fetch(`${base}/api/items?status=rejected`)).json()).items) await postJson(`/api/items/${i.id}/decide`, { decision: "approved" });
    const none = await fetch(`${base}/api/items/rewind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const noneBody = await none.json();
    assert(none.status === 409 && noneBody.empty === true && /Passed is empty/.test(noneBody.error), `an empty Passed says so: ${none.status} ${JSON.stringify(noneBody)}`);
    const made = [];
    for (const n of ["rw-a.png", "rw-b.png", "rw-c.png"]) made.push(await newItem(n));
    const [a, b, c] = made;
    const approvedBefore = await count("approved"), queueBefore = await count("queue");
    for (const it of made) { await postJson(`/api/items/${it.id}/decide`, { decision: "rejected" }); await wait(5); }
    assert(await count("rejected") === 3 && await count("queue") === queueBefore - 3, "three passed");
    // No memory on the page is involved: each call is the whole request, as after a reload or from inside Passed.
    const first = await postJson(`/api/items/rewind`, {});
    assert(first.item.id === c.id && first.passedLeft === 2, `the last one passed comes back first: ${first.item.id}, ${first.passedLeft} left`);
    assert(first.item.status === "queue" && first.item.decidedAt === null && first.item.skippedAt === undefined, "it's queued again, with no verdict");
    let front = (await (await fetch(`${base}/api/items`)).json()).items;
    const lead = front.filter((i) => typeof i.reviewOrderAt === "number").sort((x, y) => x.reviewOrderAt - y.reviewOrderAt)[0];
    assert(lead.id === c.id, `it has the earliest place in the queue: ${lead.id}`);
    const second = await postJson(`/api/items/rewind`, {});
    const third = await postJson(`/api/items/rewind`, {});
    assert(second.item.id === b.id && third.item.id === a.id && third.passedLeft === 0, "then the one before, then the first");
    front = (await (await fetch(`${base}/api/items`)).json()).items;
    const timed = front.filter((i) => [a.id, b.id, c.id].includes(i.id)).sort((x, y) => x.reviewOrderAt - y.reviewOrderAt).map((i) => i.id);
    assert(timed.join() === [a.id, b.id, c.id].join(), `each lands in front of the one before it: ${timed.join()}`);
    const fourth = await fetch(`${base}/api/items/rewind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert(fourth.status === 409, `a fourth press has nothing to bring back: ${fourth.status}`);
    assert(await count("approved") === approvedBefore && await count("queue") === queueBefore, "approved covers are untouched and the totals add up");
    // Two presses at once never bring the same cover back twice.
    await postJson(`/api/items/${a.id}/decide`, { decision: "rejected" });
    const both = await Promise.all([0, 1].map(() => fetch(`${base}/api/items/rewind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })));
    assert(both.map((r) => r.status).sort().join() === "200,409", `one comes back, one finds Passed empty: ${both.map((r) => r.status).join()}`);
  });
  await check("v1.40 a request that fails answers plain JSON and the app keeps running: a broken photo address, a broken body, an address that isn't there", async () => {
    const it = await newItem("guard.png");
    await postJson(`/api/items/${it.id}/swap-photo`, { imageUrl: "/uploads/%E0%A4%A" });
    const broken = await fetch(`${base}/api/items/${it.id}/image`);
    assert(broken.status === 404 && /json/.test(broken.headers.get("content-type")), `a broken % code is a missing photo: ${broken.status}`);
    assert((await fetch(`${base}/api/health`)).ok, "the app is still up after it");
    await postJson(`/api/items/${it.id}/restore-original`, {});
    const bad = await fetch(`${base}/api/items/${it.id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    const badBody = await bad.text();
    assert(bad.status === 400 && /json/.test(bad.headers.get("content-type")) && !/node_modules|at JSON\.parse/.test(badBody), `a broken body answers JSON with no stack trace: ${bad.status} ${badBody.slice(0, 120)}`);
    const lost = await fetch(`${base}/api/no-such-thing`);
    assert(lost.status === 404 && /json/.test(lost.headers.get("content-type")), `an address that isn't there answers JSON: ${lost.status}`);
    const rated = await fetch(`${base}/api/items/${it.id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "approved", rating: "great" }) });
    const still = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === it.id);
    assert(rated.status === 400 && still, `a rating that isn't a number is refused before anything changes: ${rated.status}`);
    const stars = await fetch(`${base}/api/items/${it.id}/rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualityRating: "x" }) });
    assert(stars.status === 400, `and so is a part rating: ${stars.status}`);
    const head = await fetch(`${base}/api/health`);
    assert(head.headers.get("x-content-type-options") === "nosniff" && !head.headers.get("x-powered-by"), "answers carry nosniff and don't name the server software");
  });
  await check("v1.40 uploads are photos and videos, and a kept file is never shown as a page", async () => {
    const send = (name, type, body = PNG_1PX) => { const f = new FormData(); f.append("photos", new Blob([body], { type }), name); return fetch(`${base}/api/items/upload`, { method: "POST", body: f }); };
    const page = await send("page.html", "text/html", Buffer.from("<script>1</script>"));
    assert(page.status === 400 && /photo or a video/.test((await page.json()).error), `a page is refused: ${page.status}`);
    const dressed = await send("page.html", "image/png");
    assert(dressed.status === 400, `a page that says it's a photo is refused by its name: ${dressed.status}`);
    const drawing = await send("drawing.svg", "image/svg+xml", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    assert(drawing.status === 400, `an SVG can carry script, so it's refused: ${drawing.status}`);
    const ok = await send("phone.heic", "application/octet-stream");
    assert(ok.ok, `a photo the browser couldn't name still uploads by its ending: ${ok.status}`);
    const long = await send(`${"n".repeat(400)}.png`, "image/png");
    const longItem = (await long.json()).created[0];
    assert(long.ok && longItem.imageUrl.length < 180 && longItem.imageUrl.endsWith(".png"), `a very long name is cut, ending kept: ${longItem?.imageUrl?.length}`);
    const photo = await fetch(`${base}${longItem.imageUrl}`);
    assert(photo.ok && /sandbox/.test(photo.headers.get("content-security-policy") || "") && !photo.headers.get("content-disposition"), "a photo shows as a photo, sandboxed");
    writeFileSync(join(DATA, "uploads", "old.html"), "<script>1</script>"); // a file kept from before uploads were checked
    const old = await fetch(`${base}/uploads/old.html`);
    assert(old.ok && old.headers.get("content-disposition") === "attachment" && /sandbox/.test(old.headers.get("content-security-policy") || ""), "an old page in her uploads downloads and never runs");
  });
  await check("v1.40 a photo kept at another address is fetched from the public internet only, and signed out the update status names no folder", async () => {
    const { privateAddress, fetchPhoto } = await import("../server/safety.js");
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
      assert(privateAddress(a) === true, `${a} is private`);
    }
    for (const a of ["8.8.8.8", "142.250.72.14", "2607:f8b0:4005:80a::200e"]) assert(privateAddress(a) === false, `${a} is public`);
    for (const u of [`${base}/api/health`, `http://127.0.0.1:${PORT}/x.png`, "http://[::1]/x.png", "http://localhost/x.png", "file:///etc/hosts", "http://user:pw@8.8.8.8/x.png", "not an address"]) {
      assert((await fetchPhoto(u)) === null, `${u} is never fetched`);
    }
    const it = await newItem("far.png");
    await postJson(`/api/items/${it.id}/swap-photo`, { imageUrl: `http://127.0.0.1:${PORT}/brand/ubee-bee-chartreuse.png` });
    const r = await fetch(`${base}/api/items/${it.id}/image`);
    assert(r.status === 502, `a cover pointed at this computer doesn't load through the app: ${r.status}`);
    await postJson(`/api/items/${it.id}/restore-original`, {});
    const open = await (await realFetch(`${base}/api/update`)).json();
    assert(open.current?.version && open.savedPatch === null && (open.lastUpdate == null || open.lastUpdate.savedPatch === null), "signed out: the version, and no folder path");
  });
  await check("v1.40 Chats: the light list carries each thread's end, then only what changed, and an open chat reads its whole thread (Arjang #1445)", async () => {
    const thread = Array.from({ length: 30 }, (_, i) => ({ from: i % 3 === 1 ? "me" : "them", kind: "text", text: `message ${i + 1}`, at: new Date(Date.UTC(2026, 10, 1, 10, i)).toISOString() }));
    thread.push({ from: "them", kind: "reaction", text: "❤️", at: new Date(Date.UTC(2026, 10, 1, 11, 0)).toISOString() });
    const made = await dm("importitem", { kind: "dm", thread_id: "t-light-1", sender: "light.one", incoming_text: "message 30", thread_messages: thread });
    const other = await dm("importitem", { kind: "dm", thread_id: "t-light-2", sender: "light.two", incoming_text: "hello" });
    const whole = await dm("listitems", { filter: "all" });
    assert(whole.cursor === undefined && whole.items.find((i) => i.id === made.id).thread_messages.length === 31, "asked the old way, the list is whole, as before");
    const first = await dm("listitems", { filter: "all", light: true });
    assert(first.full === true && typeof first.cursor === "string" && first.items.length === whole.items.length && first.stats.total === whole.stats.total, `the first light list has every chat: ${first.items.length}`);
    const mine = first.items.find((i) => i.id === made.id);
    assert(mine.light === true && mine.thread_count === 31 && mine.thread_messages.length === 2, `only the thread's end: ${JSON.stringify(mine.thread_messages).slice(0, 200)}`);
    assert(mine.thread_messages[0].text === "message 30" && mine.thread_messages[1].kind === "reaction", "from the latest message that isn't a reaction to the end");
    assert(JSON.stringify(first).length < JSON.stringify(whole).length, "and it's smaller than the whole list");
    const none = await dm("listitems", { filter: "all", light: true, since: first.cursor });
    assert(none.full === false && none.items.length === 0 && none.removed.length === 0 && none.cursor === first.cursor && none.stats.total === first.stats.total, `nothing changed, nothing sent: ${JSON.stringify(none).slice(0, 200)}`);
    await dm("markreadinbuild", { id: made.id });
    await dm("deleteitem", { id: other.id });
    const some = await dm("listitems", { filter: "all", light: true, since: first.cursor });
    assert(some.items.map((i) => i.id).join() === String(made.id) && some.removed.join() === String(other.id) && some.cursor !== first.cursor, `one changed, one gone: ${JSON.stringify({ items: some.items.map((i) => i.id), removed: some.removed })}`);
    assert((await dm("listitems", { filter: "all", light: true, since: some.cursor })).items.length === 0, "and then nothing again");
    for (const bad of ["nonsense", "00000000:5", `${first.cursor.split(":")[0]}:999999`, 7]) {
      const r = await dm("listitems", { filter: "all", light: true, since: bad });
      assert(r.full === true && r.items.length === whole.items.length - 1, `a cursor this copy didn't give answers the whole list: ${JSON.stringify(bad)}`);
    }
    const open = await dm("getthread", { id: made.id });
    assert(open.thread_messages.length === 31 && open.thread_messages[0].text === "message 1", "an open chat reads its whole thread");
    await dmFails("getthread", { id: 99999999 }, 404, "no longer exists");
    await dm("generatedraft", { id: made.id, mode: "dm" });
    const asked = (await dm("draftswanted")).items.find((i) => i.id === made.id);
    const said = asked.prompt.split("\n").filter((l) => /^(Them|the creator): /.test(l));
    assert(said.length === 25 && said[0].endsWith("message 7") && /call back to a detail from earlier/.test(asked.prompt), `a draft reads the last 25 messages and may call back: ${said.length}, ${said[0]}`);
  });
  await check("v1.40 Chats: a DM or comment comes in on arrival, one chat a call, with no pull, and the page hears when her Muse last looked (Arjang #1452)", async () => {
    const before = await dm("listitems", { filter: "all", light: true });
    const sync = await dm("getsync");
    const came = await dm("importitem", { kind: "dm", thread_id: "t-arrive-1", sender: "new.fan", incoming_text: "just found you",
      thread_messages: [{ from: "them", kind: "text", text: "just found you", at: new Date().toISOString() }] });
    assert(came.created === true, "the arriving DM is in");
    const after = await dm("getsync");
    assert(after.state === sync.state && after.asked_at === sync.asked_at, "no pull was started for it: nothing reads as syncing");
    const one = await dm("listitems", { filter: "all", light: true, since: before.cursor });
    assert(one.items.length === 1 && one.items[0].id === came.id && one.items[0].needs_reply === true, `the page gets that one chat: ${one.items.map((i) => i.id)}`);
    const again = await dm("importitem", { kind: "dm", thread_id: "t-arrive-1", sender: "new.fan", incoming_text: "are you there",
      thread_messages: [{ from: "them", kind: "text", text: "just found you", at: new Date(Date.now() - 1000).toISOString() }, { from: "them", kind: "text", text: "are you there", at: new Date().toISOString() }] });
    assert(again.id === came.id && again.created === false, "their next message lands on the same chat, never a copy");
    const next = await dm("listitems", { filter: "all", light: true, since: one.cursor });
    assert(next.items.length === 1 && next.items[0].thread_messages.at(-1).text === "are you there", "and the page gets that chat's new end");
    const note = await dm("importitem", { kind: "comment", comment_id: "c-arrive-1", media_id: "m-arrive", sender: "kind.soul", incoming_text: "love this",
      media_preview_url: "https://example.com/p.jpg", media_permalink: "https://www.instagram.com/p/abc/" });
    const row = (await dm("listitems", { filter: "all", light: true })).items.find((i) => i.id === note.id);
    assert(row.kind === "comment" && row.media_id === "m-arrive" && row.media_preview_url === "https://example.com/p.jpg", "a comment arrives with its post, for the reply screen");
    assert(note.missing === undefined && came.missing === undefined, "a comment with its post, or a DM, lacks nothing");
    const bare = await dm("importitem", { kind: "comment", comment_id: "c-arrive-2", sender: "no.post", incoming_text: "hi" });
    assert(bare.created === true && bare.missing.join() === "media_id,media_preview_url,media_permalink", `a comment that came without its post says what's missing: ${JSON.stringify(bare)}`);
    const filled = await dm("importitem", { kind: "comment", comment_id: "c-arrive-2", sender: "no.post", incoming_text: "hi", media_id: "m-arrive",
      media_preview_url: "https://example.com/p.jpg", media_permalink: "https://www.instagram.com/p/abc/" });
    assert(filled.id === bare.id && filled.missing === undefined, "sent again with its post, the same comment has it");
    await dm("syncwanted");
    assert(typeof (await dm("getsync")).muse_seen_at === "string", "the page hears when her Muse last looked for a pull");
  });
  await check("no em or en dashes anywhere in the app's copy, code or docs (house rule)", async () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);
    const root = new URL("../", import.meta.url).pathname;
    const files = execFileSync("git", ["ls-files", "client/src", "server", "scripts", "docs", "README.md", "AGENTS.md", "TROUBLESHOOTING.md"], { cwd: root }).toString().split("\n").filter(Boolean);
    const hits = files.filter((f) => existsSync(join(root, f)) && dashes.test(readFileSync(join(root, f), "utf8")));
    assert(!hits.length, `dashes found in: ${hits.join(", ")}`);
  });
  await check("smoke never touched the repo's own data folder", async () => {
    const now = execFileSync("git", ["status", "--porcelain", "--", "data"], { cwd: join(REPO_DATA, "..") }).toString();
    assert(now === repoDataBefore, `repo data changed during smoke:\n${now}`);
    assert(!existsSync(join(REPO_DATA, "db.json")) || repoDataBefore.includes("db.json") || existsSync(join(DATA, "db.json")), "smoke data should be in the temp folder");
    assert(existsSync(join(DATA, "db.json")), "the temp folder should hold the smoke data");
  });
} finally {
  server.kill();
  hiveServer.close();
  symServer.close();
  rmSync(DATA, { recursive: true, force: true });
  for (const d of [SONGS, NO_MANIFEST, join(SONGS, "..", "outside.m4a")]) rmSync(d, { recursive: true, force: true });
}
console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
