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
import { cleanKey, fileUrl, forgetDevice, looksLikeKey, saveDevice, savedDevice } from "../client/src/beeline/beelineApi.js";

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
  uploads: {}, uploadTypes: {}, requests: [], submits: 0, songs: false };
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
    return send(200, { ok: true, creator: { id: "cr-1", display_name: "Test Creator" }, ...(hive.songs ? { features: { songs: true } } : {}), channels: [
      { id: CH_IG, platform: "instagram", handle: "@smoke_ig", photo: true, ready: true, default_on: true },
      { id: CH_SUBSTACK, platform: "substack", handle: "smoke", photo: true, ready: true, default_on: false }] });
  }
  if (body.action === "upload_url") {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(body.client_key || "")) return send(400, { error: "bad client_key" });
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
        ...(body.song ? { song: body.song } : {}) };
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
  COVER_REVIEW_BEE_HIVE_URL: `${hiveBase}/api/public/cover-review`, COVER_REVIEW_POLLEN_SYNC_MS: "3600000",
  COVER_REVIEW_SYMPHONY_URL: `${symBase}/functions/v1/symphony` }, stdio: "pipe" });
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
// The remix menu (1.17.0): ask for a remix, wait for it to be made, put it in place, and answer the new cover.
async function remixOf(id, body) {
  const { remix } = await postJson(`/api/items/${id}/remix`, body);
  for (let i = 0; i < 50; i++) {
    const r = (await (await fetch(`${base}/api/remixes`)).json()).remixes.find((x) => x.id === remix.id);
    if (r && r.status !== "pending") {
      await postJson(`/api/remixes/${r.id}/ack`, { after: null });
      if (r.status !== "done") throw new Error(`the remix didn't land: ${r.error}`);
      return (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === r.itemId);
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("the remix was never made");
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
    const remix = await remixOf(item.id, { quote: { on: true } });
    assert(remix.parentId === item.id && remix.revision === 2, "remix should create revision 2 in queue");
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
  await check("v1.8 new covers and new text boxes start in TikTok Sans Regular; saved covers keep their weight", async () => {
    const item = await newItem("regular.png");
    assert(item.textFont === "tiktok" && item.fontWeight === 400, `${item.textFont} ${item.fontWeight}`);
    const styled = await postJson(`/api/items/${item.id}/style`, { extraTexts: [{ quote: "mine" }] });
    assert(styled.item.extraTexts[0].fontWeight === 400 && styled.item.extraTexts[0].textFont === "tiktok", JSON.stringify(styled.item.extraTexts[0]));
    const medium = await postJson(`/api/items/${item.id}/style`, { fontWeight: 500 });
    assert(medium.item.fontWeight === 500, "a saved weight stays");
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
  await check("v1.4 a remix is its own cover: removing its slide keeps the original's, and it isn't booked with Pollen", async () => {
    const item = await newItem("quill-remix.png");
    const form = new FormData();
    form.append("slide", new Blob([PNG_1PX], { type: "image/png" }), "remix-slide.png");
    await (await fetch(`${base}/api/items/${item.id}/slides`, { method: "POST", body: form })).json();
    await postJson(`/api/items/${item.id}/verify`); // a checked cover: its check and its stamp stay with it (1.13.9)
    const remix = await remixOf(item.id, { quote: { on: true } });
    await postJson(`/api/items/${remix.id}/slides/0/remove`, {});
    const original = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === item.id);
    assert(!original.slides[0].deletedAt, "removing the remix's slide removed the original's too");
    assert(remix.pollen == null && remix.pollenRender == null && remix.beacons == null && remix.composeAttestedAt == null && remix.beaconsVersion == null,
      `remix carries Pollen or check state: ${JSON.stringify([remix.pollen, remix.pollenRender, remix.beacons, remix.composeAttestedAt, remix.beaconsVersion])}`);
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
      assert(r1.rechecked === true && r1.changed?.join(",") === "QUOTE_IN_STOCK" && r1.item.beacons.QUOTE_IN_STOCK === true && r1.item.beacons.STEPS_VERIFIED === true,
        `an unmarked cover's quote is checked now: ${JSON.stringify(r1).slice(0, 300)}`);
      assert(r1.item.composeAttestedAt === 1000 && r1.item.beaconsVersion === 1, `still verified, so it keeps when it was, and it's stamped: ${r1.item.composeAttestedAt} ${r1.item.beaconsVersion}`);
      const r2 = await post("/api/items/2/recheck");
      assert(r2.changed?.join(",") === "QUOTE_IN_STOCK,STEPS_VERIFIED" && r2.item.beacons.QUOTE_IN_STOCK === false && r2.item.composeAttestedAt === null,
        `a quote that isn't on her list fails the check now: ${JSON.stringify(r2).slice(0, 300)}`);
      const [r3, r4] = [await post("/api/items/3/recheck"), await post("/api/items/4/recheck")];
      assert(r3.rechecked === true && r3.changed?.length === 0 && r3.item.beacons.QUOTE_IN_STOCK === null, `a post she turned off stays NOT NEEDED: ${JSON.stringify(r3).slice(0, 300)}`);
      assert(r4.rechecked === true && r4.changed?.length === 0, `a check that was already right is rechecked and stays: ${JSON.stringify(r4).slice(0, 300)}`);
      const r5 = await post("/api/items/5/recheck");
      assert(r5.rechecked === false && r5.reason === "done" && r5.item.beacons == null, `a cover nobody checked is left alone: ${JSON.stringify(r5).slice(0, 300)}`);
      const again = await post("/api/items/1/recheck");
      assert(again.rechecked === false && again.reason === "done", "a cover is rechecked once");
      const after = await get("/api/beacons/wanted");
      assert(after.ids.length === 0 && JSON.stringify(after.recheck) === JSON.stringify({ rechecked: 4, coversChanged: 2, valuesChanged: 3 }), `the tally: ${JSON.stringify(after)}`);
      const now = await all();
      for (const row of rows) {
        const n = now[row.id];
        assert(n.showQuote === row.showQuote && n.showQuoteSet === row.showQuoteSet && n.status === row.status && n.quote === row.quote,
          `beacons only, never her choices: ${JSON.stringify(n).slice(0, 300)}`);
      }
      assert(!("beaconsVersion" in now[5]), "a cover nobody checked gets no stamp");
      const saved = JSON.parse(readFileSync(join(dir, "db.json"), "utf8")).items;
      assert(saved.filter((i) => i.beaconsVersion === 1).map((i) => i.id).join(",") === "1,2,3,4", "the stamps are saved");
      const checked = await post("/api/items/5/verify");
      assert(checked.item.beaconsVersion === 1 && (await get("/api/beacons/wanted")).ids.length === 0, "a check made now is stamped, so it's never wanted");
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
    assert(JSON.stringify(live.thread_messages) === JSON.stringify([
      { from: "them", kind: "text", text: "first message", url: null, reply_to: null, at: null },
      { from: "me", kind: "reaction", text: null, url: null, reply_to: null, at: null },
      { from: "them", kind: "share_reel", text: null, url: "https://example.com/r/1", reply_to: null, at: "2026-11-20T01:00:00-08:00" },
      { from: "them", kind: "text", text: "kept as text", url: null, reply_to: "story", at: null }]), `thread: ${JSON.stringify(live.thread_messages)}`);
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
    assert(live.prompt.includes("Thread so far, oldest first:\nThem: first message\nthe creator: [reacted to a message]\nThem: [shared a reel]\nThem: kept as text"), `thread in the prompt: ${live.prompt}`);
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
  await check("v1.14 Send hands the approved text to her Muse, and only her Muse's report marks it sent", async () => {
    await dmFails("publishitem", { id: dmIds.holdout }, 409, "blind holdout");
    await dmFails("publishitem", { id: dmIds.comment, verdict: "approved" }, 409, "nothing to publish yet");
    const sent = await dm("publishitem", { id: dmIds.live, revision_text: "Yayyy welcome in!!\nLemme know how it lands", verdict: "edited" });
    assert(sent.ok === true && sent.status === "publishing" && sent.text === "Yayyy welcome in!!\nLemme know how it lands", `sent: ${JSON.stringify(sent)}`);
    await dmFails("publishitem", { id: dmIds.live }, 409, "already on its way");
    const wanted = (await dm("publishwanted")).items;
    assert(wanted.length === 1 && wanted[0].id === dmIds.live && wanted[0].text === sent.text && wanted[0].kind === "dm" && wanted[0].sender === "@test.person" && wanted[0].thread_id === "t-1", `wanted: ${JSON.stringify(wanted)}`);
    assert(wanted[0].incoming_text === "hi there, how do I start?" && !("actual_reply" in wanted[0]), "what to find, and nothing sealed");
    await dm("confirmpublish", { id: dmIds.live, ok: false, detail: "thread not found" });
    let item = await dmItem(dmIds.live);
    assert(item.publish_status === "publish_failed" && item.publish_error === "thread not found", `failed: ${JSON.stringify(item).slice(0, 300)}`);
    assert((await dm("listitems", { filter: "ready" })).items.map((i) => i.id).join(",") === String(dmIds.live), "a failed send is ready to try again");
    assert((await dm("publishwanted")).items.length === 0, "nothing waits after a report");
    await dm("publishitem", { id: dmIds.live, revision_text: "Yayyy welcome in!!\nLemme know how it lands", verdict: "edited" });
    await dm("confirmpublish", { id: dmIds.live, ok: true });
    item = await dmItem(dmIds.live);
    assert(item.publish_status === "published" && item.published_text === "Yayyy welcome in!!\nLemme know how it lands" && item.published_at && item.publish_error === null, "published");
    await dmFails("publishitem", { id: dmIds.live }, 409, "already published");
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
    assert(capEndings("Hi!\nSo good \u{1F602}\n\u{1F602}", rule) === "Hi!\nSo good\n\u{1F602}", "a single ! isn't a mark, an emoji ending is, a lone emoji is content");
    assert(capEndings("Yesss!!!\nAmazing \u{1F483}\u{1F483}", [{ title: "A", body: "No pet names" }]) === "Yesss\nAmazing \u{1F483}\u{1F483}", "no rule: every !! goes and an emoji stays");
    assert(capEndings("A!!\nB!!\nC!!", [{ title: "P", body: "1 in 1 end with !!" }]) === "A!!\nB!!\nC", "never on every line of a longer draft");
    assert(capEndings("Wow!!\n\nOkay!!", rule) === "Wow\n\nOkay", "empty lines stay and don't count");
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
