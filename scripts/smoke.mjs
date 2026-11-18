// Smoke test: boots the API on a test port and walks the photos-only flow.
// Run with the server stopped: node scripts/smoke.mjs
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Smoke runs in a throwaway data folder, so it never touches a creator's real photos,
// decisions, workspace or settings.
const REPO_DATA = new URL("../data/", import.meta.url).pathname;
const DATA = mkdtempSync(join(tmpdir(), "cr-smoke-"));
for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(DATA, f));
const repoDataBefore = execFileSync("git", ["status", "--porcelain", "--", "data"], { cwd: join(REPO_DATA, "..") }).toString();
const seedBefore = readFileSync(join(DATA, "trending-instagram.json"), "utf8");

const PORT = 4199;
const base = `http://localhost:${PORT}`;
const server = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(PORT), COVER_REVIEW_NO_UPDATE_LOOP: "1", COVER_REVIEW_DATA_DIR: DATA }, stdio: "pipe" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

try {
  await wait(900);
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
  await check("connectors registry lists drive, spotify, instagram with Muse steps", async () => {
    const c = await (await fetch(`${base}/api/connectors`)).json();
    const ids = c.connectors.map((x) => x.id).sort().join(",");
    assert(ids === "google_drive,instagram,spotify", `unexpected connectors: ${ids}`);
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
    const badColor = await (await fetch(`${base}/api/items/${item.id}/style`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textColor: "#123456" }) })).json();
    assert(badColor.item.textColor === "#FB0909", "off-palette color must be rejected");
    const rated = await (await fetch(`${base}/api/items/${item.id}/rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualityRating: 8, songRating: 7, quoteRating: 9 }) })).json();
    assert(rated.item.quoteRating === 9, "per-part ratings should save");
    const verified = await (await fetch(`${base}/api/items/${item.id}/verify`, { method: "POST" })).json();
    assert(verified.beacons.QUOTE_IN_STOCK === true, "default pack quote should verify in stock");
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
  await check("health and grievance loop", async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert(health.ok === true, "health should respond");
    const g = await (await fetch(`${base}/api/grievances`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "smoke grievance", context: { smoke: true } }) })).json();
    assert(g.grievance.status === "open", "grievance should open");
    const resolved = await (await fetch(`${base}/api/grievances/${g.grievance.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution: "smoke resolved" }) })).json();
    assert(resolved.grievance.status === "resolved", "grievance should resolve");
  });
  await check("smoke never touched the repo's own data folder", async () => {
    const now = execFileSync("git", ["status", "--porcelain", "--", "data"], { cwd: join(REPO_DATA, "..") }).toString();
    assert(now === repoDataBefore, `repo data changed during smoke:\n${now}`);
    assert(!existsSync(join(REPO_DATA, "db.json")) || repoDataBefore.includes("db.json") || existsSync(join(DATA, "db.json")), "smoke data should be in the temp folder");
    assert(existsSync(join(DATA, "db.json")), "the temp folder should hold the smoke data");
  });
} finally {
  server.kill();
  rmSync(DATA, { recursive: true, force: true });
}
console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
