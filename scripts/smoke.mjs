// Smoke test: boots the API on a test port and walks the photos-only flow.
// Run with the server stopped: node scripts/smoke.mjs
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captionProblems } from "../server/captionRules.js";

// Smoke runs in a throwaway data folder, so it never touches a creator's real photos,
// decisions, workspace or settings.
const REPO_DATA = new URL("../data/", import.meta.url).pathname;
const DATA = mkdtempSync(join(tmpdir(), "cr-smoke-"));
for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(DATA, f));
const repoDataBefore = execFileSync("git", ["status", "--porcelain", "--", "data"], { cwd: join(REPO_DATA, "..") }).toString();
const seedBefore = readFileSync(join(DATA, "trending-instagram.json"), "utf8");

// A fake Bee Hive: the same four actions the real one answers, plus the signed upload URL and a
// remote photo for the same-origin image route. It records everything so checks can count calls.
const TINY_JPEG = Buffer.from("/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xAClAAADAQEBAQAAAAAAAAAAAAAHBQQGAwIAAQADAQEBAAAAAAAAAAAAAAAHBQQDBgIQAAADBgAKBAwHAQAAAAAAAAIBAwAREgUTBDRBgYKyMjFCISKxwkMURQaTwcMzgweEVFEV0VLSFlXTo2IRAAIBAgMCCAwHAQEAAAAAAAECAxEEBRIAMSETs0FCMgYzInSysXKChIFxNTRRIxQHwbQ2Q3NiYf/AABEIADIAKAMBIgACEQADEQD/2gAMAwEAAhEDEQA/ABcI7xW5USQ4whjN8BBAEgkYhCGNwQhL6iMixNqLeZz5G6CEKrhkA1SFBbmCmYT544TTgdvPc/htZdbiAP7khBWGp3QYUHmESwERENQITLegxFzflI3NogKJFYFZU3LcVu6RHHTr1KcW2Onu+sdxhZRjOKPiMlZYVZQxyJIeF4NZVViwzEdwdE91QadLTy/wuF7leFfMYHmaNmHOSQAIlQ2VmoCKNXduU6ynjJMppdCtg3qsZgIYk+REihUg4hEkEiERuLi89jJ5YrfCEoG3PjDGPgmQQhARmYhCHyhIvqZkTPpwIwHKU0zBbKpqKjIhieVvUVAJM1BCI9UnGKInkW0m4y0dQpsioYLpZRRFSBMTiuSSWENWmIJFrBeYYSiMuISZxY39xa4TGkJMaLWiIzKihrkqXyKQgXeZD3x7+XU8MXB3qlXYMOcNzAmGuXMO9Xm9H2cmm6EwnyMKAVHOAapctsYKZvFUqQmCD/qJz+G1u/3aefN2/lLD8WqAJMpaVnSct67ucRx0u8VacW2Olu+sdxhZdAl/CXHlLn9DQrilzIXLSLHR2AzEfcA/sGa4TutyUzD/AKOk97gti1w8hgFy0rNJIwSpDuxLK5FvLVwd7FiG37xrGX2EqZuiTUpa5Zehpr7CVM3RJqUtcsvQ057JPM/TTfHvn/WJuMGpZl2Wd1WgQ3snna+ZdlndVoEN7J526Ky+ST0vHOoYu3Ht8XTdPULL0t0bmnqFl6W6N5O0+/SG47eX/R/GOvru0XVXGIIHkbnG8JbpFjNn1v4vzVVUIQ2zzN7iqoliM8ajemLssw1LP0BNwN7iE1vEMqxmiNtDc0D6MNdh11UWF/hXBd78ZcTcJn35fuQ9CmWnTO2vJoHT+TzCXd37yhSqVIOdMT4YH6gxOc8trJLOyuFo6YInQv5gltf9TJjH7x/BnxXoGwUk7f2fWYs9WLKLEerdreyl1kk4aoQgJ3bmRBQMrHYPrt1hh8Sz4pHA1QrZt46W6Itygjb/AOa928gmiiQRBt3kb3HURLGZY1Go/bs3+W/1R/sYpyzA0s/TEzJs5LONXcVfcxG0fX3aFGL4zc2uKX8CJCVhuriJSwYsQkrKK0cCtBvoBoMMXZZhqWfoCYRMXZZhqWfoCYMYr2XoSeQaMP5h/P8AV3wibjLXWW94/gz4r0DYKSdv7PrNvfeP4M+K9A2Cknb+z6zHrqT/AA2w9Y/ey6zwn45D6fENovSzA0s/TEzJlsswNLP0xMybKbtZPOby6A3WD45ivh93x76//9k=", "base64");
const CH_IG = "11111111-1111-4111-8111-111111111111";
const CH_SUBSTACK = "22222222-2222-4222-8222-222222222222";
const hive = { code: "smoke-pollen-code-0123456789-abcdefghijklmnop", revoked: false, dropSubmitOnce: false,
  uploads: {}, requests: [], submits: 0 };
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
    return send(200, { Key: url.pathname.slice(8) });
  }
  if (hive.revoked || req.headers.authorization !== `Bearer ${hive.code}`) return send(401, { error: "That Pollen code doesn't work anymore. Ask uBee for a new one." });
  const body = JSON.parse(raw.toString() || "{}");
  if (body.action === "hello") {
    return send(200, { ok: true, creator: { id: "cr-1", display_name: "Test Creator" }, channels: [
      { id: CH_IG, platform: "instagram", handle: "@smoke_ig", photo: true, ready: true, default_on: true },
      { id: CH_SUBSTACK, platform: "substack", handle: "smoke", photo: true, ready: true, default_on: false }] });
  }
  if (body.action === "upload_url") {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(body.client_key || "")) return send(400, { error: "bad client_key" });
    return send(200, { ok: true, path: `cr-1/${body.client_key}.jpg`, signed_url: `${hiveBase}/upload/cr-1/${body.client_key}.jpg?token=t0k`, token: "t0k" });
  }
  if (body.action === "submit") {
    hive.submits += 1;
    if (!hive.uploads[body.image_path]) return send(400, { error: "the image must be uploaded first" });
    let r = hive.requests.find((x) => x.client_key === body.client_key);
    if (!r) {
      r = { id: `${String(hive.requests.length + 1).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, client_key: body.client_key, caption: body.caption,
        channel_ids: body.channel_ids, width: body.width, height: body.height, has_slides: body.has_slides, status: "waiting", booked_day: null, posts: [], error: null };
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

const PORT = 4199;
const base = `http://localhost:${PORT}`;
const server = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(PORT), COVER_REVIEW_NO_UPDATE_LOOP: "1", COVER_REVIEW_DATA_DIR: DATA,
  COVER_REVIEW_BEE_HIVE_URL: `${hiveBase}/api/public/cover-review`, COVER_REVIEW_POLLEN_SYNC_MS: "3600000" }, stdio: "pipe" });
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
  await check("connectors registry lists drive, spotify, instagram, pollen with Muse steps", async () => {
    const c = await (await fetch(`${base}/api/connectors`)).json();
    const ids = c.connectors.map((x) => x.id).sort().join(",");
    assert(ids === "google_drive,instagram,pollen,spotify", `unexpected connectors: ${ids}`);
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
    assert(verified.beacons.QUOTE_IN_STOCK === null, "a new cover has its quote off, so the stock check doesn't apply (1.5.2)");
    const slideForm = new FormData();
    slideForm.append("slide", new Blob([png], { type: "image/png" }), "slide1.png");
    const withSlide = await (await fetch(`${base}/api/items/${item.id}/slides`, { method: "POST", body: slideForm })).json();
    assert(withSlide.item.slides.length === 1, "slide should attach");
    const framed = await (await fetch(`${base}/api/items/${item.id}/story-framing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyPanX: 20, storyPanY: 80 }) })).json();
    assert(framed.item.storyPanY === 80, "story framing should save");
    const remix = await (await fetch(`${base}/api/items/${item.id}/remix`, { method: "POST" })).json();
    assert(remix.item.parentId === item.id && remix.item.revision === 2, "remix should create revision 2 in queue");
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
    const remix = (await postJson(`/api/items/${item.id}/remix`, {})).item;
    await postJson(`/api/items/${remix.id}/slides/0/remove`, {});
    const original = (await (await fetch(`${base}/api/items?status=queue`)).json()).items.find((i) => i.id === item.id);
    assert(!original.slides[0].deletedAt, "removing the remix's slide removed the original's too");
    assert(remix.pollen == null && remix.pollenRender == null && remix.beacons == null, `remix carries Pollen or check state: ${JSON.stringify([remix.pollen, remix.pollenRender, remix.beacons])}`);
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
    await fetch(`${base}/api/quiz/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: quiz.quotes[0].text, keep: true }) });
    const st1 = await (await fetch(`${base}/api/quotes/status`)).json();
    assert(st1.unlocked === true && st1.creatorQuoteCount >= 1, "stealing one quote should unlock");
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
  rmSync(DATA, { recursive: true, force: true });
}
console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
