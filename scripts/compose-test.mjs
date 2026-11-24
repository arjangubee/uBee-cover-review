// Compose check test (1.21.0, Big Edit item 12): the check argues each decision like a caveman, one short line for the
// quote and one for the song, and none for the image, which comes first. This server has no model, so it writes its own
// lines from the words the photo, the quote and the song share. A space with a model can write better ones: they land
// only for the quote and song they were written for, and a check keeps them. Run: node scripts/compose-test.mjs
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { offlineRationale, rationaleProblems } from "../server/rationale.js";

const REPO_DATA = new URL("../data/", import.meta.url).pathname;
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

const SONGS = mkdtempSync(join(tmpdir(), "cr-compose-songs-"));
mkdirSync(join(SONGS, "hooks"));
const LIST = [["beat--dance-floor", "Beat Club", "Dance Floor"], ["night--slow-night", "Night Owls", "Slow Night"]];
for (const [id] of LIST) writeFileSync(join(SONGS, "hooks", `${id}.m4a`), `clip ${id}`);
writeFileSync(join(SONGS, "manifest.json"), JSON.stringify({ songs: LIST.map(([id, artist, title]) => ({ id, artist, title, hookStart: 10, hookEnd: 25, hookFile: `hooks/${id}.m4a` })) }));
const QUOTES = ["Dance like the floor is yours", "Coffee first then the world"];

const dirs = [];
async function withCopy(port, fn) {
  const dir = mkdtempSync(join(tmpdir(), "cr-compose-"));
  dirs.push(dir);
  for (const f of ["default-quotes.json", "quiz-quotes.json", "trending-instagram.json"]) copyFileSync(join(REPO_DATA, f), join(dir, f));
  const at = `http://localhost:${port}`;
  const child = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(port), COVER_REVIEW_NO_UPDATE_LOOP: "1", COVER_REVIEW_DATA_DIR: dir,
    COVER_REVIEW_POLLEN_SYNC_MS: "3600000", COVER_REVIEW_SYMPHONY_URL: "http://127.0.0.1:9/none" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${at}/api/health`)).ok) break; } catch {} await wait(200); }
    const r = await (await fetch(`${at}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: "composer" }) })).json();
    const h = (x = {}) => ({ Authorization: `Bearer ${r.token}`, ...x });
    const api = {
      get: async (p) => (await fetch(`${at}${p}`, { headers: h() })).json(),
      post: async (p, b) => (await fetch(`${at}${p}`, { method: "POST", headers: h({ "Content-Type": "application/json" }), body: JSON.stringify(b || {}) })).json(),
      upload: async (name) => {
        const form = new FormData();
        form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), name);
        return (await (await fetch(`${at}/api/items/upload`, { method: "POST", headers: h(), body: form })).json()).created[0];
      },
    };
    await api.post("/api/quotes/connect", { quotes: QUOTES, replace: true });
    await api.post("/api/songs/folder", { folder: SONGS });
    await fn(api);
  } finally {
    await new Promise((res) => { if (child.exitCode != null) return res(); child.once("exit", res); child.kill(); });
  }
}
async function cover(api, name, { description, quote, song }) {
  const it = await api.upload(name);
  if (description) await api.post(`/api/items/${it.id}/description`, { text: description });
  await api.post(`/api/items/${it.id}/edit`, { quote, ...(song ? { song } : {}) });
  return it.id;
}
const checked = async (api, id) => (await api.post(`/api/items/${id}/verify`)).item;
const words = (line) => line.trim().split(/\s+/).length;
const LONG_DASH = String.fromCharCode(0x2014);

try {
  await check("v1.21 offline lines: the photo and the quote share a word, the song shares one with the quote, and no line for the image", async () => {
    const r = offlineRationale({ description: "a woman dancing on a beach at sunset", quote: "Dance like the floor is yours", song: "Beat Club - Dance Floor", songSource: "downloaded" },
      { quoteOn: true, saved: false });
    assert(r.quote === "Picture have dancing. Words say dance. Same thing, so them go together.", `quote line: ${r.quote}`);
    assert(r.song === "Song say dance. Words say dance too. Song fit words.", `song line: ${r.song}`);
    assert(!("image" in r) && Object.keys(r).sort().join() === "quote,song", `only the quote and the song: ${Object.keys(r)}`);
  });

  await check("v1.21 offline lines say why when nothing is shared: her own words, a quote that's off, and where the song came from", async () => {
    const base = { description: "a cup on a table", quote: "Slow mornings are a love language" };
    assert(offlineRationale({ ...base, song: "" }, { quoteOn: true }).quote === "Words come from your own list. Your words go with your picture.", "her own words");
    assert(offlineRationale({ ...base, song: "" }, { quoteOn: false }).quote === "No words on picture this time. Picture talk alone.", "a quote that's off");
    assert(offlineRationale({ ...base, quote: "  ", song: "" }, { quoteOn: true }).quote === null, "no quote at all, no line");
    assert(offlineRationale({ ...base, song: "" }, { quoteOn: true }).song === null, "no song, no line");
    const song = (o, ctx = {}) => offlineRationale({ ...base, song: "Night Owls - Slow Night", ...o }, { quoteOn: true, ...ctx }).song;
    assert(song({}) === "Song say slow. Words say slow too. Song fit words.", `a word shared with the quote first: ${song({})}`);
    assert(song({ quote: "Coffee first then the world", description: "a slow night drive" }) === "Song say slow. Picture have slow too. Song fit picture.",
      `then a word shared with the photo: ${song({ quote: "Coffee first then the world", description: "a slow night drive" })}`);
    const plain = { quote: "Coffee first then the world" };
    assert(song(plain, { saved: true }) === "You save this song. You like it, so it go here.", "a saved song");
    assert(song({ ...plain, songSource: "trending" }) === "Many people use this song now. People hear it and stop to look.", "a trending song");
    assert(song({ ...plain, songSource: "spotify" }) === "Song come from your own music. It sound like you.", "her Spotify");
    assert(song({ ...plain, songSource: "downloaded" }) === "Song come from your song list. It ready for your posts.", "her song list");
    assert(song({ ...plain, songSource: "downloaded" }, { quoteOn: false }) === "Song come from your song list. It ready for your posts.", "a quote that's off isn't matched");
  });

  await check("v1.21 offline lines never argue for a part that fails its check: a quote off her list or a song off her song list says so", async () => {
    const it = { description: "a woman dancing on a beach", quote: "Dance like the floor is yours", song: "Beat Club - Dance Floor", songSource: "trending" };
    const r = offlineRationale(it, { quoteOn: true, saved: true, quoteInStock: false, songInPool: false });
    assert(r.quote === "Words not on your list. Pick words from your list.", `quote off her list: ${r.quote}`);
    assert(r.song === "Song not on your song list. Pick a song from your list.", `song off her list: ${r.song}`);
    const ok = offlineRationale(it, { quoteOn: true, quoteInStock: true, songInPool: true });
    assert(ok.quote.startsWith("Picture have dancing.") && ok.song.startsWith("Song say dance."), `passing parts argue as before: ${JSON.stringify(ok)}`);
    assert(offlineRationale(it, { quoteOn: false, quoteInStock: null }).quote === "No words on picture this time. Picture talk alone.", "a quote that's off has nothing to fail");
  });

  await check("v1.21 the rules for a model's lines: short, plain, no emoji, no dashes", async () => {
    assert(!rationaleProblems({ quote: "Picture have beach. Words say ocean. Beach have ocean, so them go together.", song: "Song go slow like waves." }).length, "good lines");
    assert(rationaleProblems({ quote: "x ".repeat(19).trim(), song: "fine" }).length === 1, "19 words");
    assert(rationaleProblems({ quote: "fine", song: "y".repeat(121) }).length === 1, "121 characters");
    assert(rationaleProblems({ quote: `Sun! ${String.fromCodePoint(0x2600, 0xFE0F)}`, song: "fine" }).length === 1, "an emoji");
    assert(rationaleProblems({ quote: `Sun ${LONG_DASH} good`, song: "fine" }).length === 1, "a long dash");
    assert(rationaleProblems({ quote: "one\ntwo", song: "fine" }).length === 1, "two lines");
    assert(rationaleProblems({ quote: "", song: "fine" }).length === 1, "an empty line");
  });

  await check("v1.21 a check writes the caveman lines for what the cover shows, and a new quote gets new lines", async () => {
    await withCopy(4196, async (api) => {
      const id = await cover(api, "a.png", { description: "a woman dancing on a beach at sunset", quote: QUOTES[0], song: "Beat Club - Dance Floor" });
      let it = await checked(api, id);
      assert(it.beacons?.STEPS_VERIFIED === true, `checked: ${JSON.stringify(it.beacons)}`);
      assert(it.rationale?.quote === "Picture have dancing. Words say dance. Same thing, so them go together.", `quote line: ${JSON.stringify(it.rationale)}`);
      assert(it.rationale.song === "Song say dance. Words say dance too. Song fit words.", `song line: ${it.rationale.song}`);
      assert(it.rationale.source === "offline" && it.rationale.basedOn?.quote === QUOTES[0] && it.rationale.basedOn.song === "Beat Club - Dance Floor"
        && it.rationale.basedOn.quoteOn === true, `what the lines are for: ${JSON.stringify(it.rationale)}`);
      await api.post("/api/music/save", { id: "beat--dance-floor", on: true });
      await api.post(`/api/items/${id}/edit`, { quote: QUOTES[1] });
      it = await checked(api, id);
      assert(it.rationale.quote === "Words come from your own list. Your words go with your picture." && it.rationale.basedOn.quote === QUOTES[1], `a new quote, new lines: ${JSON.stringify(it.rationale)}`);
      assert(it.rationale.song === "Song say dance. Picture have dancing. Song fit picture.", `the song line follows: ${it.rationale.song}`);
      await api.post(`/api/items/${id}/quote-toggle`, { showQuote: false, set: true });
      it = await checked(api, id);
      assert(it.beacons.QUOTE_IN_STOCK === null && it.rationale.quote === "No words on picture this time. Picture talk alone." && it.rationale.basedOn.quoteOn === false,
        `a quote that's off: ${JSON.stringify([it.beacons, it.rationale])}`);
    });
  });

  await check("v1.21 a model's lines land only for the quote and song they were written for, inside the rules, and a check keeps them", async () => {
    await withCopy(4196, async (api) => {
      const id = await cover(api, "a.png", { description: "a woman dancing on a beach at sunset", quote: QUOTES[0], song: "Beat Club - Dance Floor" });
      const p = await api.get(`/api/items/${id}/rationale-prompt`);
      assert(/caveman/i.test(p.prompt) && p.prompt.includes(QUOTES[0]) && p.prompt.includes("Beat Club - Dance Floor") && p.prompt.includes("dancing on a beach"), `the prompt: ${p.prompt}`);
      assert(p.basedOn?.quote === QUOTES[0] && p.basedOn.song === "Beat Club - Dance Floor" && p.basedOn.quoteOn === true && p.imageUrl, `what it's for: ${JSON.stringify(p)}`);
      const lines = { quote: "Lady dance on sand. Words say dance. Same dance, so them go together.", song: "Song say dance floor. Beach is her dance floor." };
      let r = await api.post(`/api/items/${id}/rationale-draft`, { ...lines, basedOn: { ...p.basedOn, quote: "an old quote" } });
      assert(r.saved === false && r.reason === "changed", `written for another quote: ${JSON.stringify(r)}`);
      r = await api.post(`/api/items/${id}/rationale-draft`, { quote: `Sun ${LONG_DASH} good`, song: lines.song, basedOn: p.basedOn });
      assert(r.saved === false && r.reason === "rules" && r.problems?.length === 1, `outside the rules: ${JSON.stringify(r)}`);
      r = await api.post(`/api/items/${id}/rationale-draft`, { ...lines, basedOn: p.basedOn });
      assert(r.saved === true && r.item.rationale.quote === lines.quote && r.item.rationale.source === "model", `saved: ${JSON.stringify(r)}`);
      let it = await checked(api, id);
      assert(it.rationale.quote === lines.quote && it.rationale.source === "model", `a check keeps the model's lines: ${JSON.stringify(it.rationale)}`);
      await api.post("/api/quotes/connect", { quotes: [QUOTES[1]], replace: true }); // her quote left her list
      it = await checked(api, id);
      assert(it.rationale.source === "offline" && it.rationale.quote === "Words not on your list. Pick words from your list.",
        `a part that fails isn't argued for, even by a model: ${JSON.stringify(it.rationale)}`);
      await api.post("/api/quotes/connect", { quotes: QUOTES, replace: true });
      await api.post(`/api/items/${id}/edit`, { quote: QUOTES[1] });
      it = await checked(api, id);
      assert(it.rationale.source === "offline" && it.rationale.basedOn.quote === QUOTES[1], `a new quote, so the lines are new: ${JSON.stringify(it.rationale)}`);
      const f = await api.post(`/api/items/${id}/rationale-fill`);
      assert(f.drafted === false && f.reason === "no-model", `no model here: ${JSON.stringify(f)}`);
      const words19 = await api.post(`/api/items/${id}/rationale-draft`, { quote: Array(19).fill("go").join(" "), song: "fine", basedOn: (await api.get(`/api/items/${id}/rationale-prompt`)).basedOn });
      assert(words19.reason === "rules" && words(Array(19).fill("go").join(" ")) === 19, "19 words is too many");
    });
  });
} finally {
  for (const d of [...dirs, SONGS]) rmSync(d, { recursive: true, force: true });
}
console.log(process.exitCode ? "COMPOSE TEST FAILED" : "COMPOSE TEST OK");
