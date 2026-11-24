// Remix test (1.17.0, Quill #798 and #811; on the spot since 1.21.0): the remix menu's New quote and New song. The app picks
// by plain pattern-match: her prompt, the photo's description and the cover's quote, word by word, against her own quote
// stock and the song list, with hidden songs never picked and saved songs winning ties. A pick lands only once it passes
// the compose gate, and it changes the cover she's on: a remix never makes a copy (room #960). Run: node scripts/remix-test.mjs
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      // Changes her saved data with the server stopped, the way a page from before an update left it, then starts again.
      edit: async (fn) => {
        await stop();
        const file = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith("db.json")).map((f) => join(dir, f))
          .find((f) => (JSON.parse(readFileSync(f, "utf8")).items || []).length > 0);
        const db = JSON.parse(readFileSync(file, "utf8"));
        fn(db);
        writeFileSync(file, JSON.stringify(db));
        await start();
      },
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
const itemOf = async (api, id, status = "queue") => (await api.get(`/api/items?status=${status}`)).items.find((i) => i.id === id);

try {
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

  // 1.21.0 (Big Edit item 16, Arjang: "It should remix it instantly instead of putting it next in queue."): Submit changes
  // the cover she's on, right away, with 1.17's picks and gate. Nothing new comes into the queue, and undo puts it back.
  const now = (api, id, body) => api.post(`/api/items/${id}/remix-now`, body);
  const back = (api, id, fields) => api.post(`/api/items/${id}/remix-fields`, { fields });

  // 1.21.0, Arjang's final word on item 16 (room #960): "remix on the spot instead of putting it next in queue and/or
  // duplicating it. It should never duplicate." A remix changes the cover she's on, and nothing ever makes a copy.
  const APOS = String.fromCharCode(0x2019);
  await check("v1.21 a remix needs New quote, New song or both, and keeps each prompt short", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      for (const body of [{}, { quote: { on: false, prompt: "ocean" } }, { quote: { on: false }, song: { on: false } }]) {
        assert((await api.status(`/api/items/${c.id}/remix-now`, body)) === 400, `none ticked: ${JSON.stringify(body)}`);
      }
      assert((await api.status(`/api/items/${c.id}/remix-now`, { quote: { on: true, prompt: "x".repeat(301) } })) === 400, "a prompt over 300 characters");
      assert((await api.status("/api/items/999/remix-now", { quote: { on: true } })) === 404, "a cover that isn't there");
      const items = (await api.get("/api/items")).items;
      assert(items.length === 1 && items[0].quote === QUOTES[0] && items[0].revision === 1, `nothing changed: ${JSON.stringify(items.map((i) => [i.quote, i.revision]))}`);
    });
  });

  await check("v1.21 the 1.17 remix route never makes a copy: it says to reload, and nothing changes", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      assert((await api.status(`/api/items/${c.id}/remix`, { quote: { on: true, prompt: "ocean" } })) === 410, "the old route is gone");
      const r = await api.post(`/api/items/${c.id}/remix`, { quote: { on: true } });
      assert(/on the spot/.test(r.error || ""), `it says why: ${JSON.stringify(r)}`);
      const items = (await api.get("/api/items")).items;
      assert(items.length === 1 && items[0].quote === QUOTES[0] && items[0].revision === 1, "no copy, and the cover is as it was");
      assert(!(await api.get("/api/remixes")).remixes.length, "nothing waits");
    });
  });

  await check("v1.21 a remix left waiting from before 1.21 closes with a note and makes no copy", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      await api.edit((db) => {
        db.remixes = [{ id: 7, sourceId: c.id, quote: { on: true, prompt: "ocean" }, song: { on: false, prompt: "" }, status: "pending",
          itemId: null, error: null, createdAt: Date.now(), finishedAt: null }];
        db.nextRemixId = 8;
      });
      const { remixes } = await api.get("/api/remixes");
      assert(remixes.length === 1 && remixes[0].status === "failed" && /on the spot/.test(remixes[0].error || ""), `closed with a note: ${JSON.stringify(remixes)}`);
      await wait(1200); // longer than a 1.17 remix took here, so a copy would have shown by now
      const items = (await api.get("/api/items")).items;
      assert(items.length === 1 && items[0].quote === QUOTES[0], "no copy, and the cover is as it was");
      await api.post("/api/remixes/7/ack", {});
      assert(!(await api.get("/api/remixes")).remixes.length, "once the page has shown it, it's done");
    });
  });

  await check("v1.21 a remix finished before 1.21 still goes where the page puts it, with a Drive batch at the front", async () => {
    await withCopy(4185, async (api) => {
      const a = await cover(api, "a.png", { quote: QUOTES[0] });
      const sent = await api.post("/api/items/enqueue", { items: [
        { imageUrl: "https://example.com/d1.jpg", driveId: "remix-d1", title: "d1", quote: QUOTES[1] },
        { imageUrl: "https://example.com/d2.jpg", driveId: "remix-d2", title: "d2", quote: QUOTES[2] }] });
      const [d1, d2] = sent.created;
      const made = await cover(api, "made-before.png", { quote: QUOTES[3] }); // stands in for the copy a 1.20 page's remix made
      const order = async () => (await api.get("/api/items")).items.map((i) => i.id).join();
      assert(await order() === [d1.id, d2.id, a.id, made.id].join(), `the batch is first: ${await order()}`);
      const done = (id, sourceId) => ({ id, sourceId, quote: { on: true, prompt: "" }, song: { on: false, prompt: "" }, status: "done", itemId: made.id, error: null, createdAt: 1, finishedAt: 2 });
      await api.edit((db) => { db.remixes = [done(7, d1.id)]; });
      await api.post("/api/remixes/7/ack", { after: d1.id });
      assert(await order() === [d1.id, made.id, d2.id, a.id].join(), `right after the cover she's on: ${await order()}`);
      await api.edit((db) => { db.remixes = [done(8, a.id)]; });
      await api.post("/api/remixes/8/ack", { after: null });
      assert(await order() === [made.id, d1.id, d2.id, a.id].join(), `to the front, ahead of the batch: ${await order()}`);
      assert((await api.get("/api/items")).items.length === 4, "nothing new was made");
    });
  });

  await check("v1.21 the gate's quote test reads a stock quote without the spaces around it, so a pick from it lands", async () => {
    await withCopy(4185, async (api) => {
      writeFileSync(join(api.dir, "quotes.json"), JSON.stringify([{ text: "Coffee first then the world" }, { text: "  The ocean remembers every wave  " }]));
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      const r = await now(api, c.id, { quote: { on: true } });
      assert(r.item?.quote === "The ocean remembers every wave", `stored without the spaces: ${JSON.stringify(r).slice(0, 200)}`);
      const { beacons } = await api.post(`/api/items/${c.id}/verify`);
      assert(beacons.QUOTE_IN_STOCK === true, `the compose check agrees: ${JSON.stringify(beacons)}`);
    });
  });

  await check("v1.21 a remix never picks the quote the cover already has, however it's written", async () => {
    await withCopy(4185, async (api) => {
      writeFileSync(join(api.dir, "quotes.json"), JSON.stringify([{ text: `Don${APOS}t stop now` }, { text: "The ocean remembers every wave" }]));
      const c = await cover(api, "a.png", { quote: "don't stop now" });
      const first = await now(api, c.id, { quote: { on: true, prompt: "stop now" } });
      assert(first.item?.quote === "The ocean remembers every wave", `the same quote came back: ${first.item?.quote}`);
      const second = await now(api, c.id, { quote: { on: true, prompt: "ocean" } });
      assert(second.item?.quote === `Don${APOS}t stop now`, `and the next one isn't the ocean again: ${second.item?.quote}`);
    });
  });

  await check("v1.21 a remix drops what was about the old quote or song, and a new quote shows even where the old one was off", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      await api.post(`/api/items/${c.id}/why`, { text: "The beach photo and the coffee quote belong together." });
      await api.post(`/api/items/${c.id}/rate`, { qualityRating: 8, songRating: 6, quoteRating: 4 });
      await api.post(`/api/items/${c.id}/quote-toggle`, { showQuote: false, set: true });
      let n = (await now(api, c.id, { quote: { on: true, prompt: "ocean" } })).item;
      assert(n.why === null && n.quoteRating === null && n.songRating === 6 && n.qualityRating === 8, `new quote: ${JSON.stringify({ why: n.why, q: n.quoteRating, s: n.songRating, p: n.qualityRating })}`);
      assert(!n.showQuoteSet, "she asked for a new quote, so it shows");
      await api.post(`/api/items/${c.id}/why`, { text: "The ocean quote and the slow song belong together." });
      await api.post(`/api/items/${c.id}/rate`, { quoteRating: 4 });
      await api.post(`/api/items/${c.id}/quote-toggle`, { showQuote: false, set: true });
      n = (await now(api, c.id, { song: { on: true } })).item;
      assert(n.why === null && n.songRating === null && n.quoteRating === 4 && n.qualityRating === 8, `new song: ${JSON.stringify({ why: n.why, q: n.quoteRating, s: n.songRating, p: n.qualityRating })}`);
      assert(n.showQuoteSet === true && n.showQuote === false, "New song alone keeps her quote choice");
    });
  });

  await check("v1.21 Remix changes the cover she's on right away: the same cover, her stock quote by her words, nothing new in the queue", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], description: "a woman on a beach at sunset", song: "Night Owls - Slow Night" });
      const other = await cover(api, "b.png", { quote: QUOTES[3] });
      const r = await now(api, c.id, { quote: { on: true, prompt: "ocean waves" }, song: { on: false, prompt: "dance" } });
      assert(r.item?.id === c.id, `the same cover: ${JSON.stringify(r)}`);
      assert(r.item.quote === "The ocean remembers every wave", `her words picked the quote: ${r.item.quote}`);
      assert(r.item.revision === 2 && r.item.title === "a.png" && r.item.status === "queue", `v2, same title, still queued: ${r.item.revision} ${r.item.title} ${r.item.status}`);
      for (const k of ["textColor", "fontSize", "horizontalPosition", "verticalPosition", "imageUrl", "song", "songFile"]) assert(r.item[k] === c[k], `${k} stays: ${r.item[k]} vs ${c[k]}`);
      assert(r.before?.quote === QUOTES[0] && r.after?.quote === r.item.quote && r.before.revision === 1 && r.after.revision === 2, `before and after: ${JSON.stringify([r.before, r.after])}`);
      const items = (await api.get("/api/items")).items;
      assert(items.map((i) => i.id).join() === [c.id, other.id].join(), `nothing new, same order: ${items.map((i) => i.id)}`);
      assert(!(await api.get("/api/remixes")).remixes.length, "nothing waits in the background");
      assert((await itemOf(api, c.id)).quote === r.item.quote, "it's saved");
    });
  });

  await check("v1.21 Remix on the spot: New song skips hidden songs and her saved song wins a tie, and both ticked matches the song to the new quote", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      await api.post("/api/music/hide", { id: "sea--blue-waves", on: true });
      let r = await now(api, c.id, { song: { on: true, prompt: "blue waves at sunset" } });
      assert(r.item.songFile === FILE("sun--sunset-drive") && r.item.quote === QUOTES[0], `hidden skipped, quote kept: ${r.item.songFile} / ${r.item.quote}`);
      await api.post("/api/music/save", { id: "beat--dance-floor", on: true });
      r = await now(api, c.id, { song: { on: true, prompt: "" } });
      assert(r.item.songFile === FILE("beat--dance-floor"), `her saved song wins: ${r.item.songFile}`);
      const d = await cover(api, "d.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      r = await now(api, d.id, { quote: { on: true, prompt: "dance floor" }, song: { on: true, prompt: "" } });
      assert(r.item.quote === "Dance like the floor is yours" && r.item.songFile === FILE("beat--dance-floor"), `quote then song: ${r.item.quote} / ${r.item.songFile}`);
      assert(r.item.revision === 2, `one remix, one version: v${r.item.revision}`);
    });
  });

  await check("v1.21 Undo puts back everything a remix changed, and Redo does it again", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      await api.post(`/api/items/${c.id}/why`, { text: "The beach photo and the coffee quote belong together." });
      await api.post(`/api/items/${c.id}/rate`, { qualityRating: 8, songRating: 6, quoteRating: 4 });
      await api.post(`/api/items/${c.id}/quote-toggle`, { showQuote: false, set: true });
      const was = await itemOf(api, c.id);
      const r = await now(api, c.id, { quote: { on: true, prompt: "ocean" }, song: { on: true, prompt: "" } });
      assert(r.item.why === null && r.item.quoteRating === null && r.item.songRating === null && r.item.qualityRating === 8, `what was about the old picks drops: ${JSON.stringify(r.item)}`);
      assert(!r.item.showQuoteSet, "she asked for a new quote, so it shows");
      let u = (await back(api, c.id, r.before)).item;
      for (const k of ["quote", "song", "songFile", "songSource", "songPreviewUrl", "songHook", "quoteRating", "songRating", "qualityRating", "showQuote", "showQuoteSet", "caption", "captionSource", "revision"]) {
        assert(JSON.stringify(u[k]) === JSON.stringify(was[k]), `undo puts back ${k}: ${JSON.stringify(u[k])} vs ${JSON.stringify(was[k])}`);
      }
      assert(u.why?.text === was.why.text, `undo puts back why: ${JSON.stringify(u.why)}`);
      u = (await back(api, c.id, r.after)).item;
      for (const k of ["quote", "songFile", "revision", "why", "quoteRating", "songRating", "showQuoteSet"]) {
        assert(JSON.stringify(u[k] ?? null) === JSON.stringify(r.item[k] ?? null), `redo does ${k} again: ${JSON.stringify(u[k])} vs ${JSON.stringify(r.item[k])}`);
      }
    });
  });

  await check("v1.21 undo takes only a remix's own fields, and only good values", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      const u = (await back(api, c.id, { status: "approved", imageUrl: "/elsewhere.png", parentId: 9, beacons: { STEPS_VERIFIED: true }, revision: 3 })).item;
      assert(u.status === "queue" && u.imageUrl === c.imageUrl && u.parentId == null && !u.beacons && u.revision === 3, `only its own fields: ${JSON.stringify(u)}`);
      assert((await api.status(`/api/items/${c.id}/remix-fields`, { fields: { songFile: "../../etc/passwd", song: "x" } })) === 400, "a song clip outside the songs folder");
      assert((await api.status(`/api/items/${c.id}/remix-fields`, { fields: { revision: 0 } })) === 400, "a version below 1");
      assert((await api.status(`/api/items/${c.id}/remix-fields`, { fields: { captionSource: "robot" } })) === 400, "a caption source that isn't one");
      assert((await api.status(`/api/items/${c.id}/remix-fields`, {})) === 400, "no fields");
      assert((await api.status("/api/items/999/remix-fields", { fields: { revision: 2 } })) === 404, "a cover that isn't there");
    });
  });

  await check("v1.21 a remix that can't pick changes nothing and says why, with no note left on the cover", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      for (const [id] of LIST) await api.post("/api/music/hide", { id, on: true });
      await api.post("/api/trending/refresh", { songs: [] });
      assert((await api.status(`/api/items/${c.id}/remix-now`, { song: { on: true } })) === 422, "it can't pick");
      const r = await now(api, c.id, { song: { on: true } });
      assert(/song/i.test(r.error || ""), `it says why: ${JSON.stringify(r)}`);
      const after = await itemOf(api, c.id);
      assert(after.song === c.song && after.revision === (c.revision || 1) && !after.lastRemix, `unchanged: ${JSON.stringify([after.song, after.revision, after.lastRemix])}`);
      for (const body of [{}, { quote: { on: false, prompt: "ocean" } }]) assert((await api.status(`/api/items/${c.id}/remix-now`, body)) === 400, `none ticked: ${JSON.stringify(body)}`);
      assert((await api.status(`/api/items/${c.id}/remix-now`, { quote: { on: true, prompt: "x".repeat(301) } })) === 400, "a prompt over 300 characters");
      assert((await api.status("/api/items/999/remix-now", { quote: { on: true } })) === 404, "a cover that isn't there");
    });
  });

  await check("v1.21 a caption she typed stays hers through a new quote, and a drafted one is drafted again", async () => {
    await withCopy(4185, async (api) => {
      const mine = await cover(api, "a.png", { quote: QUOTES[0] });
      await api.post(`/api/items/${mine.id}/edit`, { caption: "my own words", captionSource: "human" });
      let r = await now(api, mine.id, { quote: { on: true, prompt: "ocean" } });
      assert(r.item.caption === "my own words" && r.item.captionSource === "human", `hers stays: ${r.item.caption} (${r.item.captionSource})`);
      const drafted = await cover(api, "b.png", { quote: QUOTES[0] });
      await api.post(`/api/items/${drafted.id}/edit`, { caption: "a model's caption", captionSource: "model" });
      r = await now(api, drafted.id, { quote: { on: true, prompt: "ocean" } });
      assert(r.item.captionSource === "placeholder" && r.item.caption !== "a model's caption", `drafted again for the new quote: ${r.item.caption} (${r.item.captionSource})`);
    });
  });

  await check("v1.21 a checked cover is checked again with its new picks, and an unchecked one stays unchecked", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0], song: "Night Owls - Slow Night" });
      await api.post(`/api/items/${c.id}/verify`);
      let r = await now(api, c.id, { quote: { on: true, prompt: "ocean" }, song: { on: true } });
      assert(r.item.beacons?.QUOTE_IN_STOCK === true && r.item.beacons.SONG_IN_POOL === true && r.item.beacons.STEPS_VERIFIED === true && r.item.composeAttestedAt,
        `checked again: ${JSON.stringify(r.item.beacons)}`);
      const u = (await back(api, c.id, r.before)).item;
      assert(u.beacons?.STEPS_VERIFIED === true, `undo checks it again too: ${JSON.stringify(u.beacons)}`);
      const d = await cover(api, "b.png", { quote: QUOTES[0] });
      r = await now(api, d.id, { quote: { on: true } });
      assert(!r.item.beacons && !r.item.composeAttestedAt, `still unchecked: ${JSON.stringify(r.item.beacons)}`);
    });
  });

  await check("v1.21 an approved cover remixes on the spot and stays approved", async () => {
    await withCopy(4185, async (api) => {
      const c = await cover(api, "a.png", { quote: QUOTES[0] });
      await api.post(`/api/items/${c.id}/decide`, { decision: "approved" });
      const r = await now(api, c.id, { quote: { on: true, prompt: "ocean" } });
      assert(r.item.status === "approved" && r.item.quote === "The ocean remembers every wave", `approved, new quote: ${r.item.status} ${r.item.quote}`);
      assert(!(await api.get("/api/items?status=queue")).items.length, "nothing came into the queue");
    });
  });

} finally {
  for (const d of [...dirs, SONGS]) rmSync(d, { recursive: true, force: true });
}
console.log(process.exitCode ? "REMIX TEST FAILED" : "REMIX TEST OK");
