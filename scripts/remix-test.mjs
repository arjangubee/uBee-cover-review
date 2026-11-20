// Remix test (1.17.0, Quill #798 and #811): the remix menu's New quote and New song. The app picks by plain pattern-match:
// her prompt, the photo's description and the cover's quote, word by word, against her own quote stock and the song
// list, with hidden songs never picked and saved songs winning ties. A pick lands as a new queue cover only once it
// passes the compose gate, and a finished remix goes right after the cover she's on. Run: node scripts/remix-test.mjs
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

// A songs folder: four songs, in this order.
const SONGS = mkdtempSync(join(tmpdir(), "cr-remix-songs-"));
mkdirSync(join(SONGS, "hooks"));
const LIST = [["sea--blue-waves", "The Sea", "Blue Waves"], ["night--slow-night", "Night Owls", "Slow Night"],
  ["beat--dance-floor", "Beat Club", "Dance Floor"], ["sun--sunset-drive", "Sun Kids", "Sunset Drive"]];
for (const [id] of LIST) writeFileSync(join(SONGS, "hooks", `${id}.m4a`), `clip ${id}`);
writeFileSync(join(SONGS, "manifest.json"), JSON.stringify({ songs: LIST.map(([id, artist, title]) => ({ id, artist, title, hookStart: 10, hookEnd: 25, hookFile: `hooks/${id}.m4a` })) }));
const FILE = (id) => `hooks/${id}.m4a`;
const QUOTES = ["Coffee first then the world", "The ocean remembers every wave", "Dance like the floor is yours", "Slow mornings are a love language"];

const dirs = [];
async function withCopy(port, fn) {
  const dir = mkdtempSync(join(tmpdir(), "cr-remix-"));
  dirs.push(dir);
  for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(dir, f));
  const at = `http://localhost:${port}`;
  let child = null;
  const start = async () => {
    child = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(port), COVER_REVIEW_NO_UPDATE_LOOP: "1", COVER_REVIEW_DATA_DIR: dir,
      COVER_REVIEW_POLLEN_SYNC_MS: "3600000", COVER_REVIEW_SYMPHONY_URL: "http://127.0.0.1:9/none", COVER_REVIEW_REMIX_DELAY_MS: "700" }, stdio: "ignore" });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${at}/api/health`)).ok) break; } catch {} await wait(200); }
  };
  const stop = () => new Promise((res) => { if (!child || child.exitCode != null) return res(); child.once("exit", res); child.kill(); });
  try {
    await start();
    const r = await (await fetch(`${at}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: "remixer" }) })).json();
    const h = (x = {}) => ({ Authorization: `Bearer ${r.token}`, ...x });
    const api = {
      dir,
      restart: async () => { await stop(); await start(); }, // what an update does: the server goes away and comes back
      get: async (p) => (await fetch(`${at}${p}`, { headers: h() })).json(),
      post: async (p, b) => (await fetch(`${at}${p}`, { method: "POST", headers: h({ "Content-Type": "application/json" }), body: JSON.stringify(b || {}) })).json(),
      status: async (p, b) => (await fetch(`${at}${p}`, { method: "POST", headers: h({ "Content-Type": "application/json" }), body: JSON.stringify(b || {}) })).status,
      upload: async (name) => {
        const form = new FormData();
        form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), name);
        return (await (await fetch(`${at}/api/items/upload`, { method: "POST", headers: h(), body: form })).json()).created[0];
      },
    };
    // Her own quotes, the songs folder, and one cover with a description, a quote and a look of its own.
    await api.post("/api/quotes/connect", { quotes: QUOTES, replace: true });
    await api.post("/api/songs/folder", { folder: SONGS });
    await fn(api);
  } finally {
    await stop();
  }
}
async function cover(api, name, fields) {
  const it = await api.upload(name);
  if (fields.description) await api.post(`/api/items/${it.id}/description`, { text: fields.description });
  await api.post(`/api/items/${it.id}/edit`, { quote: fields.quote ?? it.quote, ...(fields.song ? { song: fields.song } : {}) });
  await api.post(`/api/items/${it.id}/style`, { textColor: "#FB0909", fontSize: 72, horizontalPosition: 30, verticalPosition: 70 });
  return (await api.get("/api/items")).items.find((i) => i.id === it.id);
}
async function finished(api, id) {
  for (let i = 0; i < 50; i++) {
    const r = (await api.get("/api/remixes")).remixes.find((x) => x.id === id);
    if (r && r.status !== "pending") return r;
    await wait(150);
  }
  throw new Error(`remix ${id} never finished`);
}
const itemOf = async (api, id, status = "queue") => (await api.get(`/api/items?status=${status}`)).items.find((i) => i.id === id);

try {
  await check("v1.17 a remix needs New quote, New song or both, and keeps each prompt short", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      for (const body of [{}, { quote: { on: false, prompt: "ocean" } }, { quote: { on: false }, song: { on: false } }]) {
        assert((await api.status(`/api/items/${c.id}/remix`, body)) === 400, `none ticked: ${JSON.stringify(body)}`);
      }
      assert((await api.status(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "x".repeat(301) } })) === 400, "a prompt over 300 characters");
      assert((await api.status("/api/items/999/remix", { quote: { on: true } })) === 404, "a cover that isn't there");
      assert((await api.get("/api/items")).items.length === 1, "nothing was made");
    });
  });

  await check("v1.17 New quote picks from her own stock by her words, and the new cover keeps the photo, the look and the song, right after the source", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], description: "a woman on a beach at sunset", song: "Night Owls - Slow Night" });
      const other = await cover(api, "b.png", { quote: QUOTES[3] });
      const { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "ocean waves" }, song: { on: false, prompt: "dance" } });
      assert(remix?.status === "pending" && remix.sourceId === c.id, `pending: ${JSON.stringify(remix)}`);
      const done = await finished(api, remix.id);
      assert(done.status === "done" && done.itemId, `done: ${JSON.stringify(done)}`);
      const n = await itemOf(api, done.itemId);
      assert(n.quote === "The ocean remembers every wave", `her words picked the quote: ${n.quote}`);
      assert(n.parentId === c.id && n.imageUrl === c.imageUrl && n.title === "a.png (remix)", "same photo, a new version of it");
      for (const k of ["textColor", "fontSize", "horizontalPosition", "verticalPosition", "song", "songFile"]) assert(n[k] === c[k], `${k} carries over: ${n[k]} vs ${c[k]}`);
      assert(n.captionSource === "placeholder", "a new quote gets a fresh caption draft");
      const src = await itemOf(api, c.id);
      assert(src.quote === QUOTES[0], "the source cover isn't touched");
      assert((await api.get("/api/items")).items.map((i) => i.id).join() === [c.id, n.id, other.id].join(), "it waits right after the source");
    });
  });

  await check("v1.17 New song never picks a hidden song, matches her words, and a saved song wins a tie", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      await api.post("/api/music/hide", { id: "sea--blue-waves", on: true });
      let { remix } = await api.post(`/api/items/${c.id}/remix`, { song: { on: true, prompt: "blue waves at sunset" } });
      let n = await itemOf(api, (await finished(api, remix.id)).itemId);
      assert(n.songFile === FILE("sun--sunset-drive"), `the hidden best match is skipped, the next best is picked: ${n.songFile}`);
      assert(n.quote === c.quote, "New song alone keeps the quote");
      await api.post("/api/music/save", { id: "beat--dance-floor", on: true });
      ({ remix } = await api.post(`/api/items/${c.id}/remix`, { song: { on: true, prompt: "" } }));
      n = await itemOf(api, (await finished(api, remix.id)).itemId);
      assert(n.songFile === FILE("beat--dance-floor"), `with nothing to match, her saved song wins: ${n.songFile}`);
    });
  });

  await check("v1.17 both ticked: the quote first, then the song matched to the new quote", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      const { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "dance floor" }, song: { on: true, prompt: "" } });
      const n = await itemOf(api, (await finished(api, remix.id)).itemId);
      assert(n.quote === "Dance like the floor is yours" && n.songFile === FILE("beat--dance-floor"), `quote then song: ${n.quote} / ${n.songFile}`);
    });
  });

  await check("v1.17 a remix that can't pick lands nothing: no new cover, the slot frees, and the source cover says why", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      for (const [id] of LIST) await api.post("/api/music/hide", { id, on: true });
      await api.post("/api/trending/refresh", { songs: [] });
      const { remix } = await api.post(`/api/items/${c.id}/remix`, { song: { on: true } });
      const r = await finished(api, remix.id);
      assert(r.status === "failed" && /song/i.test(r.error || "") && !r.itemId, `failed: ${JSON.stringify(r)}`);
      assert((await api.get("/api/items")).items.length === 1, "no new cover");
      const src = await itemOf(api, c.id);
      assert(src.lastRemix?.status === "failed" && src.lastRemix.error === r.error, `the source says why: ${JSON.stringify(src.lastRemix)}`);
      await api.post(`/api/remixes/${r.id}/ack`, {});
      assert(!(await api.get("/api/remixes")).remixes.some((x) => x.id === r.id), "once the page has shown it, it's done");
    });
  });

  await check("v1.17 a finished remix goes right after the cover she's on, even after she decided another cover first", async () => {
    await withCopy(4185, async (api) => {
      const a = await cover(api, "a.png", { quote: QUOTES[0] }), b = await cover(api, "b.png", { quote: QUOTES[1] }), c = await cover(api, "c.png", { quote: QUOTES[2] });
      const { remix } = await api.post(`/api/items/${a.id}/remix`, { quote: { on: true, prompt: "slow love" } });
      await api.post(`/api/items/${a.id}/decide`, { decision: "approved" });
      assert((await api.get("/api/remixes")).remixes.find((x) => x.id === remix.id)?.status === "pending", "still working while she reviews");
      const done = await finished(api, remix.id);
      const placed = await api.post(`/api/remixes/${done.id}/ack`, { after: b.id });
      assert(placed.remix?.placed === true, `placed: ${JSON.stringify(placed)}`);
      assert((await api.get("/api/items")).items.map((i) => i.id).join() === [b.id, done.itemId, c.id].join(), "her remix is next after the cover she's on");
      const { remix: r2 } = await api.post(`/api/items/${b.id}/remix`, { quote: { on: true } });
      const d2 = await finished(api, r2.id);
      await api.post(`/api/remixes/${d2.id}/ack`, { after: null });
      assert((await api.get("/api/items")).items[0].id === d2.itemId, "off the queue screen, it goes to the front of the queue");
      assert(!(await api.get("/api/remixes")).remixes.length, "nothing left waiting");
    });
  });

  await check("v1.17 the new cover drops what was about the old quote or song, and a new quote shows even where the old one was off", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      await api.post(`/api/items/${c.id}/why`, { text: "The beach photo and the coffee quote belong together." });
      await api.post(`/api/items/${c.id}/rate`, { qualityRating: 8, songRating: 6, quoteRating: 4 });
      await api.post(`/api/items/${c.id}/quote-toggle`, { showQuote: false, set: true });
      let { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "ocean" } });
      let n = await itemOf(api, (await finished(api, remix.id)).itemId);
      assert(n.why === null && n.quoteRating === null && n.songRating === 6 && n.qualityRating === 8, `new quote: ${JSON.stringify({ why: n.why, q: n.quoteRating, s: n.songRating, p: n.qualityRating })}`);
      assert(!n.showQuoteSet, "she asked for a new quote, so it shows");
      ({ remix } = await api.post(`/api/items/${c.id}/remix`, { song: { on: true } }));
      n = await itemOf(api, (await finished(api, remix.id)).itemId);
      assert(n.why === null && n.songRating === null && n.quoteRating === 4 && n.qualityRating === 8, `new song: ${JSON.stringify({ why: n.why, q: n.quoteRating, s: n.songRating, p: n.qualityRating })}`);
      assert(n.showQuoteSet === true && n.showQuote === false, "New song alone keeps her quote choice");
      const src = await itemOf(api, c.id);
      assert(src.why?.text && src.songRating === 6 && src.quoteRating === 4 && src.showQuoteSet === true, "the source cover isn't touched");
    });
  });

  await check("v1.17 a remix still waiting when the app restarts finishes once the page asks again", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      const { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "ocean waves" } });
      await api.restart(); // inside the 700 ms the remix takes here
      const waiting = (await api.get("/api/remixes")).remixes.find((x) => x.id === remix.id);
      assert(waiting?.status === "pending", `still waiting after the restart: ${JSON.stringify(waiting)}`);
      const done = await finished(api, remix.id);
      assert(done.status === "done" && (await itemOf(api, done.itemId))?.quote === "The ocean remembers every wave", `done: ${JSON.stringify(done)}`);
    });
  });

  await check("v1.17 the gate's quote test reads a stock quote without the spaces around it, so a pick from it lands", async () => {
    await withCopy(4185, async (api) => {
      writeFileSync(join(api.dir, "quotes.json"), JSON.stringify([{ text: "Coffee first then the world" }, { text: "  The ocean remembers every wave  " }]));
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      const { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true } });
      const done = await finished(api, remix.id);
      assert(done.status === "done", `the pick passed the gate: ${JSON.stringify(done)}`);
      const n = await itemOf(api, done.itemId);
      assert(n.quote === "The ocean remembers every wave", `stored without the spaces: "${n.quote}"`);
      const { beacons } = await api.post(`/api/items/${n.id}/verify`);
      assert(beacons.QUOTE_IN_STOCK === true, `the compose check agrees: ${JSON.stringify(beacons)}`);
    });
  });

  await check("v1.17.1 the quote stock check reads quotes the original's way: case, curly quotes, punctuation and runs of spaces don't matter", async () => {
    await withCopy(4185, async (api) => {
      // Quill #826: the original's normalizeForStockCheck lowercases, makes curly quotes straight, turns anything but a-z,
      // 0-9 and spaces into a space, collapses runs of spaces, then trims.
      writeFileSync(join(api.dir, "quotes.json"), JSON.stringify([{ text: "The ocean  remembers every wave" }, { text: "Don\u2019t stop now" },
        { text: "Slow mornings, a love language." }, { text: "Coffee first then the world" }]));
      for (const [quote, inStock] of [["The ocean remembers every wave", true], ["Don't stop now", true], ["slow mornings a love language", true],
        ["  COFFEE   first then the world!! ", true], ["Coffee first, then the whole world", false]]) {
        const c = await cover(api, "a.png", { quote });
        const { beacons } = await api.post(`/api/items/${c.id}/verify`);
        assert(beacons.QUOTE_IN_STOCK === inStock, `"${quote}" should read ${inStock ? "in" : "not in"} stock: ${JSON.stringify(beacons)}`);
      }
    });
  });

  await check("v1.17.1 a remix never picks the quote the cover already has, however it's written", async () => {
    await withCopy(4185, async (api) => {
      writeFileSync(join(api.dir, "quotes.json"), JSON.stringify([{ text: "Don\u2019t stop now" }, { text: "The ocean remembers every wave" }]));
      const c = await cover(api, "a.png", { quote: "don't stop now" });
      for (let i = 0; i < 3; i++) {
        const { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "stop now" } });
        const n = await itemOf(api, (await finished(api, remix.id)).itemId);
        assert(n.quote === "The ocean remembers every wave", `the same quote came back: ${n.quote}`);
      }
    });
  });

  await check("v1.17.1 a remix of a remix keeps one (remix) on its title", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      let { remix } = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true } });
      const first = await itemOf(api, (await finished(api, remix.id)).itemId);
      ({ remix } = await api.post(`/api/items/${first.id}/remix`, { quote: { on: true } }));
      const second = await itemOf(api, (await finished(api, remix.id)).itemId);
      assert(first.title === "a.png (remix)" && second.title === "a.png (remix)", `titles: ${first.title} / ${second.title}`);
      assert(second.parentId === first.id && second.revision === 3, `still the next version of its parent: ${second.parentId} v${second.revision}`);
    });
  });
} finally {
  for (const d of [...dirs, SONGS]) rmSync(d, { recursive: true, force: true });
}
console.log(process.exitCode ? "REMIX TEST FAILED" : "REMIX TEST OK");
