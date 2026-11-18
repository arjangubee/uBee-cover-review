// Updater test: builds a throwaway "GitHub" (a bare repo), a publisher copy and a creator copy
// in a temp folder, then proves the updater sees new commits, updates safely and keeps data.
// Run: node scripts/update-test.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdater } from "../server/update.js";

const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_TERMINAL_PROMPT: "0" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}

const tmp = mkdtempSync(join(tmpdir(), "cr-update-"));
const origin = join(tmp, "origin.git");
const pub = join(tmp, "publisher");
const copy = join(tmp, "creator");
const plain = join(tmp, "plain");

function setup() {
  git(tmp, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(join(pub, "server"), { recursive: true });
  mkdirSync(join(pub, "data"), { recursive: true });
  writeFileSync(join(pub, "package.json"), JSON.stringify({ name: "x", version: "1.1.0" }));
  writeFileSync(join(pub, ".gitignore"), "data/db.json\ndata/settings.json\ndata/backups/\n");
  writeFileSync(join(pub, "server", "a.js"), "export const a = 1;\n");
  writeFileSync(join(pub, "server", "b.js"), "export const b = 1;\n");
  writeFileSync(join(pub, "data", "seed.json"), "[]\n");
  git(pub, "init", "-q", "-b", "main");
  git(pub, "add", "-A");
  git(pub, "commit", "-q", "-m", "First version");
  git(pub, "remote", "add", "origin", origin);
  git(pub, "push", "-q", "origin", "main");
  git(tmp, "clone", "-q", origin, copy);
  writeFileSync(join(copy, "data", "db.json"), JSON.stringify({ items: [{ id: 1, note: "her note" }] }));
  writeFileSync(join(copy, "data", "settings.json"), JSON.stringify({ setupComplete: true }));
}
function publish(file, text, subject) {
  writeFileSync(join(pub, file), text);
  git(pub, "commit", "-q", "-am", subject);
  git(pub, "push", "-q", "origin", "main");
  return git(pub, "rev-parse", "HEAD");
}
const updaterFor = (root, extra = {}) => createUpdater({ root, dataDir: join(root, "data"), commands: [], restart: () => {}, ...extra });

try {
  setup();

  await check("no update when the copy is current", async () => {
    const u = updaterFor(copy);
    const s = await u.check();
    assert(s.git === true, "copy should be seen as a git copy");
    assert(s.available === false, "nothing new yet");
  });

  await check("a new commit is noticed with its what's-new line", async () => {
    publish("server/b.js", "export const b = 2;\n", "Add Schedule with Pollen");
    const s = await updaterFor(copy).check();
    assert(s.available === true, "update should be available");
    assert(s.whatsNew.includes("Add Schedule with Pollen"), `whatsNew was ${JSON.stringify(s.whatsNew)}`);
    assert(s.latest && s.latest.commit.length >= 7, "latest commit should be reported");
  });

  await check("UPDATE NOW lands the new version, backs up data, and restarts once", async () => {
    let restarts = 0;
    const u = updaterFor(copy, { restart: () => { restarts++; } });
    await u.check();
    const r = await u.apply();
    assert(r.ok === true, `apply failed: ${r.error}`);
    assert(git(copy, "rev-parse", "HEAD") === git(pub, "rev-parse", "HEAD"), "copy should match the publisher");
    const backups = readdirSync(join(copy, "data", "backups"));
    assert(backups.length === 1, "one backup folder expected");
    const saved = JSON.parse(readFileSync(join(copy, "data", "backups", backups[0], "db.json"), "utf8"));
    assert(saved.items[0].note === "her note", "her data should be in the backup");
    assert(JSON.parse(readFileSync(join(copy, "data", "db.json"), "utf8")).items[0].note === "her note", "her data stays in place");
    assert(restarts === 1, `restart should run once, ran ${restarts}`);
    assert((await u.check()).available === false, "nothing left to update");
  });

  await check("a local fix in another file survives the update", async () => {
    writeFileSync(join(copy, "server", "a.js"), "export const a = 'muse fix';\n");
    publish("server/b.js", "export const b = 3;\n", "Tweak b");
    const u = updaterFor(copy);
    await u.check();
    const r = await u.apply();
    assert(r.ok === true, `apply failed: ${r.error}`);
    assert(readFileSync(join(copy, "server", "b.js"), "utf8").includes("3"), "new version should land");
    assert(readFileSync(join(copy, "server", "a.js"), "utf8").includes("muse fix"), "her Muse's fix should be kept");
    assert(r.savedPatch === null, "no clash, no saved patch");
  });

  await check("a clashing local fix is saved as a patch and the update still lands", async () => {
    // The copy still carries the uncommitted 'muse fix' in a.js; the publisher now changes the same line.
    const head = publish("server/a.js", "export const a = 'official';\n", "Official change to a");
    const u = updaterFor(copy);
    await u.check();
    const r = await u.apply();
    assert(r.ok === true, `apply failed: ${r.error}`);
    assert(git(copy, "rev-parse", "HEAD") === head, "copy should be on the new version");
    assert(readFileSync(join(copy, "server", "a.js"), "utf8").includes("official"), "new version wins the clash");
    assert(git(copy, "status", "--porcelain", "--untracked-files=no") === "", "no conflict markers left behind");
    assert(r.savedPatch && existsSync(r.savedPatch), "the local fix should be saved as a patch");
    assert(readFileSync(r.savedPatch, "utf8").includes("muse fix"), "the patch should hold her Muse's fix");
    assert(u.status().savedPatch === r.savedPatch, "status should point at the saved patch");
  });

  await check("the restarted app knows what the last update did", async () => {
    const fresh = updaterFor(copy); // a new process after restart
    const last = fresh.status().lastUpdate;
    assert(last && last.to === git(copy, "rev-parse", "--short=7", "HEAD"), "lastUpdate.to should be the new commit");
    assert(last.from && last.from !== last.to, "lastUpdate.from should be the old commit");
    assert(last.savedPatch && last.savedPatch.endsWith("local-changes.patch"), "lastUpdate should carry the saved patch");
    assert(typeof last.at === "string", "lastUpdate.at expected");
  });

  await check("a copy cloned from a creator's fork still updates from uBee's repo", async () => {
    // A Muse that forks the repo usually sets origin = her fork and upstream = uBee's repo.
    const fork = join(tmp, "fork.git");
    const forkCopy = join(tmp, "fork-copy");
    git(tmp, "clone", "-q", "--bare", origin, fork);
    git(tmp, "clone", "-q", fork, forkCopy);
    git(forkCopy, "remote", "add", "upstream", origin);
    const head = publish("server/a.js", "export const a = 3;\n", "Ship from uBee's repo");
    const u = updaterFor(forkCopy);
    const s = await u.check();
    assert(s.available === true && s.whatsNew.includes("Ship from uBee's repo"), `the fork copy should see uBee's new commit: ${JSON.stringify(s.whatsNew)}`);
    const r = await u.apply();
    assert(r.ok, `apply failed: ${r.error}`);
    assert(git(forkCopy, "rev-parse", "HEAD") === head, "the fork copy should land on uBee's commit");
  });

  await check("a copy without git says so and refuses to update", async () => {
    mkdirSync(join(plain, "data"), { recursive: true });
    writeFileSync(join(plain, "package.json"), JSON.stringify({ name: "x", version: "1.1.0" }));
    const u = updaterFor(plain);
    const s = await u.check();
    assert(s.git === false && s.available === false, "plain folder is not a git copy");
    const r = await u.apply();
    assert(r.ok === false && /git/i.test(r.error), "apply should refuse without git");
  });

  await check("version info reads package.json and the commit", async () => {
    const v = updaterFor(copy).versionInfo();
    assert(v.version === "1.1.0", `version was ${v.version}`);
    assert(v.commit && v.commit.length === 7, "short commit expected");
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? "UPDATE TEST FAILED" : "UPDATE TEST OK");
process.exitCode = failed ? 1 : 0;
