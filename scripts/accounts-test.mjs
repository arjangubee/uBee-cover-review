// Accounts test (1.15.0): sign-in by Instagram username, sessions that never expire, the owner of data saved before
// accounts, sign-ups, two accounts that never see each other's data, the copy's shared library, and Save and Hide.
// Every copy here runs on its own server and its own throwaway data folder. Run with: node scripts/accounts-test.mjs
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_DATA = new URL("../data/", import.meta.url).pathname;
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

// A songs folder in Symphony's shape: three songs with hook clips, in this order.
const SONGS = mkdtempSync(join(tmpdir(), "cr-acct-songs-"));
mkdirSync(join(SONGS, "hooks"));
const SONG = (k) => `artist-${k}--song-${k}`;
for (const k of ["a", "b", "c"]) writeFileSync(join(SONGS, "hooks", `${SONG(k)}.m4a`), `clip ${k}`);
writeFileSync(join(SONGS, "manifest.json"), JSON.stringify({ songs: ["a", "b", "c"].map((k) => ({
  id: SONG(k), artist: `Artist ${k.toUpperCase()}`, title: `Song ${k.toUpperCase()}`, hookStart: 10, hookEnd: 25, hookFile: `hooks/${SONG(k)}.m4a` })) }));
const FILE = (k) => `hooks/${SONG(k)}.m4a`;

const dirs = [];
function newDir(fill) {
  const dir = mkdtempSync(join(tmpdir(), "cr-acct-"));
  for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(dir, f));
  if (fill) fill(dir);
  dirs.push(dir);
  return dir;
}
// Data a copy saved before accounts: three covers (one in each list) with a photo, two of her quotes, one grievance.
function oldData(handle) {
  return (dir) => {
    const item = (id, status) => ({ id, status, title: `old ${id}`, imageUrl: `/uploads/old-${id}.png`, quote: "", song: "", caption: "" });
    writeFileSync(join(dir, "db.json"), JSON.stringify({ items: [item(1, "queue"), item(2, "approved"), item(3, "rejected")], voiceSamples: [], nextId: 4 }));
    writeFileSync(join(dir, "quotes.json"), JSON.stringify([{ text: "Old quote one" }, { text: "Old quote two" }]));
    writeFileSync(join(dir, "grievances.json"), JSON.stringify([{ id: 1, text: "old grievance", status: "open" }]));
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ setupComplete: true, quotesUnlocked: true, quotesSource: "connected", quizDecisions: {},
      workspace: { mode: "own_drive", clientName: null }, voiceProfile: null,
      connectors: { google_drive: { status: "not_connected", rootFolderId: null, folders: {} }, spotify: { status: "not_connected" },
        instagram: { status: handle ? "connected" : "not_connected", handle, captionConsent: false, trendingConsent: true } } }));
    mkdirSync(join(dir, "uploads"));
    for (const id of [1, 2, 3]) writeFileSync(join(dir, "uploads", `old-${id}.png`), PNG_1PX);
  };
}

async function boot(port, dir) {
  const child = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(port), COVER_REVIEW_NO_UPDATE_LOOP: "1",
    COVER_REVIEW_DATA_DIR: dir, COVER_REVIEW_POLLEN_SYNC_MS: "3600000", COVER_REVIEW_SYMPHONY_URL: "http://127.0.0.1:9/none" }, stdio: "ignore" });
  const at = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${at}/api/health`)).ok) break; } catch {} await wait(200); }
  return { at, stop: () => new Promise((r) => { child.once("exit", r); child.kill(); }) };
}
async function withCopy(port, fill, fn) {
  const dir = newDir(fill);
  const s = await boot(port, dir);
  try { await fn(s.at, dir); } finally { await s.stop(); }
}

// One signed-in account: its token goes as Authorization: Bearer, the page's copy of the session.
function account(at, token) {
  const headers = (extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra });
  return {
    token,
    raw: (p, o = {}) => fetch(`${at}${p}`, { ...o, headers: headers(o.headers || {}) }),
    get: async (p) => (await fetch(`${at}${p}`, { headers: headers() })).json(),
    post: async (p, b) => (await fetch(`${at}${p}`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(b || {}) })).json(),
    postStatus: async (p, b) => (await fetch(`${at}${p}`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(b || {}) })).status,
    upload: async (name) => {
      const form = new FormData();
      form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), name);
      return (await (await fetch(`${at}/api/items/upload`, { method: "POST", headers: headers(), body: form })).json()).created[0];
    },
  };
}
async function signIn(at, handle, extra = {}) {
  const r = await fetch(`${at}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, ...extra }) });
  const body = await r.json();
  return { status: r.status, body, cookie: r.headers.get("set-cookie") || "", as: body.token ? account(at, body.token) : null };
}
const accountsFile = (dir) => (existsSync(join(dir, "accounts.json")) ? JSON.parse(readFileSync(join(dir, "accounts.json"), "utf8")) : { accounts: [], sessions: [] });

try {
  await check("v1.15 signed out, personal calls answer 401 in plain words, and health, the update status and the session status still answer", async () => {
    await withCopy(4191, null, async (at) => {
      const r = await fetch(`${at}/api/items`);
      assert(r.status === 401, `items answered ${r.status} signed out`);
      const j = await r.json();
      assert(j.signedIn === false && /sign in/i.test(j.error || ""), `the 401 says to sign in: ${JSON.stringify(j)}`);
      for (const [p, o] of [["/api/setup/status"], ["/api/quotes/status"], ["/api/songs"], ["/api/symphony"], ["/api/grievances"], ["/api/music"],
        ["/uploads/x.png"], ["/api/library/Images/x.jpg"], ["/api/dm/listitems", { method: "POST" }], ["/api/update/apply", { method: "POST" }]]) {
        const s = (await fetch(`${at}${p}`, o)).status;
        assert(s === 401, `${p} answered ${s} signed out`);
      }
      const h = await (await fetch(`${at}/api/health`)).json();
      assert(h.ok === true && h.signedIn === false && h.items === undefined && h.connectors === undefined, `health signed out tells nothing personal: ${JSON.stringify(h)}`);
      assert((await fetch(`${at}/api/update`)).ok, "the update status answers signed out");
      assert((await (await fetch(`${at}/api/session`)).json()).signedIn === false, "the session status says signed out");
    });
  });

  await check("v1.15 a username is cleaned (the @ and capitals) and checked by Instagram's rule, and a bad one is refused in plain words", async () => {
    await withCopy(4191, null, async (at, dir) => {
      const r = await signIn(at, "  @Smoke.Owner ");
      assert(r.status === 200 && r.body.signedIn === true && r.body.handle === "smoke.owner", `cleaned: ${JSON.stringify(r.body)}`);
      for (const bad of ["", "@", "two words", "dash-name", "semi;colon", "emoji\u{1F600}", "a".repeat(31), ".", "..", ".lead", "trail.", "two..dots"]) {
        const x = await signIn(at, bad);
        assert(x.status === 400 && /username/i.test(x.body.error || "") && !x.body.token, `"${bad}" should be refused: ${x.status} ${JSON.stringify(x.body)}`);
      }
      assert((await signIn(at, "a".repeat(30))).status === 200, "30 characters is fine");
      const again = await signIn(at, "SMOKE.OWNER");
      assert(again.body.handle === "smoke.owner" && again.body.token !== r.body.token, "the same handle opens the same account, with a session of its own");
      assert(accountsFile(dir).accounts.filter((a) => a.handle === "smoke.owner").length === 1, "one account per handle");
    });
  });

  await check("v1.15 the session holds: the cookie and the page's copy both open it, each visit renews the cookie, a restart keeps it, and logout ends it", async () => {
    const dir = newDir();
    let s = await boot(4191, dir);
    try {
      const r = await signIn(s.at, "keeper");
      assert(/^cr_session_4191=/.test(r.cookie) && /HttpOnly/i.test(r.cookie) && /SameSite=Lax/i.test(r.cookie) && /Path=\//i.test(r.cookie), `the cookie: ${r.cookie}`);
      const maxAge = Number(/Max-Age=(\d+)/i.exec(r.cookie)?.[1]);
      assert(maxAge >= 400 * 24 * 3600 - 60, `the cookie lasts 400 days (Chrome's cap), got ${maxAge}`);
      const cookie = r.cookie.split(";")[0];
      const visit = await fetch(`${s.at}/api/session`, { headers: { cookie } });
      const v = await visit.json();
      assert(v.signedIn === true && v.handle === "keeper" && v.owner === true, `the cookie opens it: ${JSON.stringify(v)}`);
      assert(/^cr_session_4191=/.test(visit.headers.get("set-cookie") || ""), "each visit renews the cookie, named for this copy's port so two copies on one computer never share it");
      assert((await (await fetch(`${s.at}/api/session`, { headers: { Authorization: `Bearer ${r.body.token}` } })).json()).signedIn === true, "the page's copy opens it");
      assert((await fetch(`${s.at}/api/items`, { headers: { cookie } })).ok, "the cookie opens personal calls");
      assert((await fetch(`${s.at}/api/items`, { headers: { Authorization: "Bearer not-a-session" } })).status === 401, "a made-up token opens nothing");
      assert(!JSON.stringify(accountsFile(dir)).includes(r.body.token), "the server keeps only a hash of the token");
      await s.stop();
      s = await boot(4191, dir);
      assert((await (await fetch(`${s.at}/api/session`, { headers: { cookie } })).json()).signedIn === true, "a restart keeps her signed in");
      const out = await fetch(`${s.at}/api/session`, { method: "DELETE", headers: { cookie } });
      assert((await out.json()).signedIn === false, "logout answers signed out");
      assert(/^cr_session_4191=;/.test(out.headers.get("set-cookie") || "") && /Max-Age=0/i.test(out.headers.get("set-cookie") || ""), "logout clears the cookie");
      assert((await fetch(`${s.at}/api/items`, { headers: { Authorization: `Bearer ${r.body.token}` } })).status === 401, "logout ends the session on the server too");
      assert(accountsFile(dir).accounts.some((a) => a.handle === "keeper"), "logout deletes nothing of hers");
    } finally { await s.stop(); }
  });

  await check("v1.15 a broken or stale cookie never stops the page: it reads as signed out, and signing in still works", async () => {
    await withCopy(4191, null, async (at) => {
      for (const cookie of ["cr_session_4191=%E0%A4%A", "cr_session_4191=", "cr_session_4191=stale-token; other=1"]) {
        const r = await fetch(`${at}/api/session`, { headers: { cookie } });
        assert(r.status === 200 && (await r.json()).signedIn === false, `${cookie}: ${r.status}`);
        const s = await fetch(`${at}/api/session`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ handle: "fresh" }) });
        assert(s.status === 200 && (await s.json()).token, `${cookie}: sign-in answered ${s.status}`);
      }
    });
  });

  await check("v1.15 data saved before accounts belongs to the Instagram connector's handle, and another handle sees none of it", async () => {
    await withCopy(4191, oldData("@OldOwner"), async (at, dir) => {
      const before = readFileSync(join(dir, "db.json"), "utf8");
      const someone = await signIn(at, "someone");
      assert(someone.status === 200 && someone.body.owner === false && !someone.body.needsClaim, `someone else: ${JSON.stringify(someone.body)}`);
      assert((await someone.as.get("/api/setup/status")).photoCount === 0, "another handle sees none of the old covers");
      assert((await someone.as.raw("/uploads/old-1.png")).status === 404, "nor their photos");
      assert((await someone.as.get("/api/quotes/status")).creatorQuoteCount === 0 && (await someone.as.get("/api/grievances")).grievances.length === 0, "nor her quotes or grievances");
      const owner = await signIn(at, "OldOwner");
      assert(owner.body.owner === true && !owner.body.needsClaim, `the connector's handle owns them: ${JSON.stringify(owner.body)}`);
      const st = await owner.as.get("/api/setup/status");
      assert(st.photoCount === 3 && st.counts.queue === 1 && st.counts.approved === 1 && st.counts.rejected === 1, `owner counts: ${JSON.stringify(st.counts)}`);
      assert((await owner.as.raw("/uploads/old-1.png")).status === 200, "the owner sees her photos");
      assert((await owner.as.get("/api/quotes/status")).creatorQuoteCount === 2 && (await owner.as.get("/api/grievances")).grievances.length === 1, "and her quotes and grievance");
      assert(readFileSync(join(dir, "db.json"), "utf8") === before, "no row was rewritten");
    });
  });

  await check("v1.15 with no connector handle, the first new handle is asked with the counts, no makes a fresh account, and a later yes makes the owner", async () => {
    await withCopy(4191, oldData(null), async (at, dir) => {
      const first = await signIn(at, "first");
      assert(first.status === 200 && first.body.needsClaim === true && !first.body.token, `asked first: ${JSON.stringify(first.body)}`);
      assert(first.body.counts?.photos === 3 && first.body.counts?.quotes === 2, `the counts: ${JSON.stringify(first.body.counts)}`);
      assert(!accountsFile(dir).accounts.some((a) => a.handle === "first"), "no account until she answers");
      const no = await signIn(at, "first", { claim: false });
      assert(no.body.owner === false && no.as && (await no.as.get("/api/setup/status")).photoCount === 0, "no leaves them ownerless, with an empty account");
      const back = await signIn(at, "first");
      assert(!back.body.needsClaim && back.body.owner === false, "she isn't asked again");
      const yes = await signIn(at, "second", { claim: true });
      assert(yes.body.owner === true && (await yes.as.get("/api/setup/status")).photoCount === 3, "yes makes the owner, with the old covers");
      const third = await signIn(at, "third");
      assert(!third.body.needsClaim && third.body.owner === false, "once there's an owner, nobody else is asked");
    });
  });

  await check("v1.15 on an empty copy the first sign-in is the owner, with no question", async () => {
    await withCopy(4191, null, async (at) => {
      const r = await signIn(at, "newcopy");
      assert(r.body.owner === true && !r.body.needsClaim && r.as, `first sign-in: ${JSON.stringify(r.body)}`);
      assert((await signIn(at, "second")).body.owner === false, "the next one isn't");
    });
  });

  await check("v1.15 sign-ups are open by default, the owner can keep them to handles the copy knows, and only the owner can change that", async () => {
    await withCopy(4191, null, async (at) => {
      const boss = await signIn(at, "boss");
      const pal = await signIn(at, "pal");
      assert((await boss.as.get("/api/session")).restrictSignups === false, "open by default");
      assert((await pal.as.postStatus("/api/accounts/signups", { restrict: true })) === 403, "only the owner changes sign-ups");
      assert((await boss.as.post("/api/accounts/signups", { restrict: true })).restrictSignups === true, "the owner restricts them");
      const stranger = await signIn(at, "stranger");
      assert(stranger.status === 403 && /new sign-ups/i.test(stranger.body.error || "") && !stranger.body.token, `a new handle is refused: ${JSON.stringify(stranger.body)}`);
      assert((await signIn(at, "pal")).status === 200, "a handle the copy knows still signs in");
      await boss.as.post("/api/accounts/signups", { restrict: false });
      assert((await signIn(at, "stranger")).status === 200, "open again");
    });
  });

  await check("v1.15 two accounts never see each other's covers, photos, quotes, quiz verdicts, grievances, Chats items or settings", async () => {
    await withCopy(4191, null, async (at) => {
      const a = (await signIn(at, "alpha")).as, b = (await signIn(at, "beta")).as;
      const pa = await a.upload("alpha.png"), pb = await b.upload("beta.png");
      assert((await a.get("/api/items")).items.map((i) => i.title).join() === "alpha.png", "alpha sees only her cover");
      assert((await b.get("/api/items")).items.map((i) => i.title).join() === "beta.png", "beta sees only hers");
      assert((await a.raw(pa.imageUrl)).status === 200 && (await b.raw(pa.imageUrl)).status === 404, "a photo's address opens only for its own account");
      assert((await b.raw(pb.imageUrl)).status === 200 && (await a.raw(pb.imageUrl)).status === 404, "both ways");
      await b.post(`/api/items/${pb.id}/edit`, { caption: "beta's caption" });
      assert((await a.get("/api/items")).items[0].caption !== "beta's caption", "the same cover number in another account is another cover");
      await a.post("/api/quotes/connect", { quotes: ["Alpha's own line"] });
      assert((await a.get("/api/quotes/status")).creatorQuoteCount === 1 && (await b.get("/api/quotes/status")).creatorQuoteCount === 0, "quotes are hers");
      const quiz = (await b.get("/api/quiz/quotes")).quotes[0].text;
      await b.post("/api/quiz/decide", { text: quiz, keep: false });
      assert((await a.get("/api/quiz/quotes")).quotes.some((q) => q.text === quiz) && !(await b.get("/api/quiz/quotes")).quotes.some((q) => q.text === quiz), "quiz verdicts are hers");
      await a.post("/api/grievances", { text: "alpha's grievance" });
      assert((await a.get("/api/grievances")).grievances.length === 1 && (await b.get("/api/grievances")).grievances.length === 0, "grievances are hers");
      await a.post("/api/dm/createitem", { kind: "dm", sender: "fan", incoming_text: "hi alpha" });
      assert((await a.post("/api/dm/listitems", {})).stats?.total === 1 && (await b.post("/api/dm/listitems", {})).stats?.total === 0, "Chats items are hers");
      await a.post("/api/settings/caption-voice", { voice: "Alpha's voice notes" });
      assert((await b.get("/api/settings/caption-voice")).voice !== "Alpha's voice notes", "settings are hers");
    });
  });

  await check("v1.15 the copy's shared library: the songs folder and Symphony change only for the owner, everyone gets its songs, and a trending refresh stays with its account", async () => {
    await withCopy(4191, null, async (at, dir) => {
      const boss = (await signIn(at, "boss")).as, pal = (await signIn(at, "pal")).as;
      assert((await pal.postStatus("/api/songs/folder", { folder: SONGS })) === 403, "only the owner connects the songs folder");
      assert((await pal.postStatus("/api/connectors/symphony", { code: null })) === 403, "only the owner changes the Symphony connection");
      assert((await boss.post("/api/songs/folder", { folder: SONGS })).connected === true, "the owner connects it");
      assert((await pal.get("/api/songs")).songs.length === 3, "everyone gets the copy's songs");
      const shared = JSON.stringify((await boss.get("/api/trending")).songs);
      await pal.post("/api/trending/refresh", { songs: [{ artist: "Pal", title: "Own pick" }] });
      assert((await pal.get("/api/trending")).songs[0]?.artist === "Pal", "her refresh is her list");
      assert(JSON.stringify((await boss.get("/api/trending")).songs) === shared && !existsSync(join(dir, "trending.json")), "and never rewrites the shared one");
    });
  });

  await check("v1.15 Save and Hide, by song id and per account: hidden songs are never picked, saved songs come first, and the library itself never changes", async () => {
    await withCopy(4191, null, async (at) => {
      const boss = (await signIn(at, "boss")).as, pal = (await signIn(at, "pal")).as;
      await boss.post("/api/songs/folder", { folder: SONGS });
      assert((await boss.postStatus("/api/music/save", { id: "../etc", on: true })) === 400, "only a song id is taken");
      let m = await boss.post("/api/music/hide", { id: SONG("a"), on: true });
      assert(m.hidden.join() === SONG("a") && m.saved.length === 0, `hidden: ${JSON.stringify(m)}`);
      m = await boss.post("/api/music/save", { id: SONG("c"), on: true });
      assert(m.saved.join() === SONG("c"), `saved: ${JSON.stringify(m)}`);
      const n1 = await boss.upload("n1.png"), n2 = await boss.upload("n2.png");
      assert(n1.songFile === FILE("c") && n2.songFile === FILE("c"), `new covers take her saved song: ${n1.songFile} ${n2.songFile}`);
      const seen = [];
      let item = n1;
      for (let k = 0; k < 4; k++) { item = (await boss.post(`/api/items/${item.id}/edit`, { shuffleSong: true })).item; seen.push(item.songFile); }
      assert(seen.join() === [FILE("b"), FILE("c"), FILE("b"), FILE("c")].join(), `Shuffle goes saved first, then the rest, never the hidden one: ${seen.join()}`);
      const p = [await pal.upload("p1.png"), await pal.upload("p2.png"), await pal.upload("p3.png")];
      assert(p.some((x) => x.songFile === FILE("a")), "another account's picks never feel her Hide");
      assert((await pal.get("/api/music")).hidden.length === 0 && (await pal.get("/api/music")).saved.length === 0, "nor see her adjustments");
      m = await boss.post("/api/music/hide", { id: SONG("a"), on: false });
      assert(m.hidden.length === 0, "Unhide brings it back");
      assert((await boss.get("/api/songs")).songs.length === 3 && (await pal.get("/api/songs")).songs.length === 3, "the shared library never changes");
      const sym = await boss.get("/api/symphony");
      assert(Array.isArray(sym.music?.saved) && sym.music.saved.join() === SONG("c"), "the Songs screen gets her adjustments with the songs");
    });
  });
  await check("v1.15 accounts and their data never go into git: data/accounts.json and every account's folder are ignored", async () => {
    const root = new URL("../", import.meta.url).pathname;
    for (const f of ["data/accounts.json", "data/accounts/someone/db.json", "data/accounts/someone/uploads/x.png", "data/accounts/someone/settings.json"]) {
      let ignored = true;
      try { execFileSync("git", ["check-ignore", "-q", f], { cwd: root }); } catch { ignored = false; }
      assert(ignored, `${f} should be in .gitignore`);
    }
  });
} finally {
  for (const d of [...dirs, SONGS]) rmSync(d, { recursive: true, force: true });
}
console.log(process.exitCode ? "ACCOUNTS TEST FAILED" : "ACCOUNTS TEST OK");
