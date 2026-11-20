// Updater test: builds a throwaway "GitHub" (a bare repo), a publisher copy and a creator copy
// in a temp folder, then proves the updater sees new commits, updates safely and keeps data.
// Run: node scripts/update-test.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_COMMANDS, createUpdater } from "../server/update.js";

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
  writeFileSync(join(pub, ".gitignore"), "data/db.json\ndata/settings.json\ndata/backups/\ndata/accounts.json\ndata/accounts/\n");
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
  // 1.15.0: the accounts, and another account's own data in its folder.
  writeFileSync(join(copy, "data", "accounts.json"), JSON.stringify({ accounts: [{ handle: "her", owner: true }, { handle: "pal" }], sessions: [] }));
  mkdirSync(join(copy, "data", "accounts", "pal"), { recursive: true });
  writeFileSync(join(copy, "data", "accounts", "pal", "db.json"), JSON.stringify({ items: [{ id: 1, note: "pal's note" }] }));
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
    assert(existsSync(join(copy, "data", "backups", backups[0], "accounts.json")), "the accounts are in the backup (1.15.0)");
    const pal = JSON.parse(readFileSync(join(copy, "data", "backups", backups[0], "accounts", "pal", "db.json"), "utf8"));
    assert(pal.items[0].note === "pal's note", "and every other account's own data (1.15.0)");
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

  // 1.13.10 (Arjang #729, Quill #733): a git copy updates itself at a quiet moment instead of waiting for UPDATE NOW.
  await check("1.13.10 auto-update: a git copy updates itself after a quiet minute, nothing touched and no editor or sheet open", async () => {
    let t = 1_000_000, restarts = 0;
    const u = updaterFor(copy, { now: () => t, restart: () => { restarts++; } });
    assert((await u.check()).available === true, "the copy is one version behind");
    assert((await u.autoTick()).reason === "not-quiet", "right after a start it waits a quiet minute first");
    t += 30_000;
    u.noteActivity({}); // a tap
    t += 59_000;
    assert((await u.autoTick()).reason === "not-quiet", "a tap 59 s ago is too recent");
    u.noteActivity({ busy: true, idleMs: 59_000 }); // the editor is open, untouched
    t += 20_000;
    u.noteActivity({ busy: true, idleMs: 79_000 }); // and still open 20 s later
    t += 20_000;
    assert((await u.autoTick()).reason === "not-quiet", "an open editor holds it, even untouched");
    t += 46_000; // the editor closed: no word from it for 46 s, and no tap for 145 s
    const r = await u.autoTick();
    assert(r.applied === true && restarts === 1, `quiet: it updates on its own and restarts once: ${JSON.stringify(r)} ${restarts}`);
    assert(git(copy, "rev-parse", "HEAD") === git(pub, "rev-parse", "HEAD"), "the copy is on the new version");
    const last = JSON.parse(readFileSync(join(copy, "data", "last-update.json"), "utf8"));
    assert(last.auto === true, `the restarted app can say it updated itself: ${JSON.stringify(last)}`);
    assert(readdirSync(join(copy, "data", "backups")).length >= 1, "her data was backed up first, the same as UPDATE NOW");
  });

  await check("1.13.10 auto-update: a failed update puts the old version back with her Muse's local fix, says so, and isn't tried again on its own", async () => {
    const before = git(copy, "rev-parse", "HEAD");
    const aBefore = readFileSync(join(copy, "server", "a.js"), "utf8");
    writeFileSync(join(copy, "server", "b.js"), "export const b = 'muse fix 2';\n");
    publish("server/a.js", "export const a = 5;\n", "A version whose build fails");
    const runs = join(tmp, "build-runs.txt");
    writeFileSync(runs, "");
    const failing = [[process.execPath, ["-e", "require('fs').appendFileSync(process.argv[1], 'x'); process.exit(3)", runs]]];
    let t = 2_000_000, restarts = 0;
    const u = updaterFor(copy, { now: () => t, restart: () => { restarts++; }, commands: failing });
    await u.check();
    t += 61_000;
    const r = await u.autoTick();
    assert(r.applied === false && r.reason === "failed", `the build fails: ${JSON.stringify(r)}`);
    assert(git(copy, "rev-parse", "HEAD") === before && readFileSync(join(copy, "server", "a.js"), "utf8") === aBefore, "the old version is back");
    assert(readFileSync(join(copy, "server", "b.js"), "utf8").includes("muse fix 2"), "with her Muse's local fix");
    assert(restarts === 0, "no restart: the old version keeps running");
    const s = u.status();
    assert(s.state === "failed" && /went back to version 1\.1\.0/.test(s.error) && s.failed?.auto === true, `a notice says so: ${JSON.stringify([s.state, s.error, s.failed])}`);
    const tried = readFileSync(runs, "utf8").length;
    t += 600_000;
    await u.check();
    assert((await u.autoTick()).reason === "failed-before" && readFileSync(runs, "utf8").length === tried, "the same version isn't tried again on its own");
    const manual = await u.apply();
    assert(manual.ok === false && readFileSync(runs, "utf8").length > tried, "Try again tries it again");
    publish("server/a.js", "export const a = 6;\n", "A newer version");
    await u.check();
    const afterManual = readFileSync(runs, "utf8").length;
    t += 61_000;
    assert((await u.autoTick()).reason === "failed" && readFileSync(runs, "utf8").length > afterManual, "a newer version gets its own try");
    assert(git(copy, "rev-parse", "HEAD") === before, "and the old version is back again");
  });

  await check("a copy without git says so and refuses to update", async () => {
    mkdirSync(join(plain, "data"), { recursive: true });
    writeFileSync(join(plain, "package.json"), JSON.stringify({ name: "x", version: "1.1.0" }));
    const u = updaterFor(plain);
    const s = await u.check();
    assert(s.git === false && s.available === false, "plain folder is not a git copy");
    const r = await u.apply();
    assert(r.ok === false && /git/i.test(r.error), "apply should refuse without git");
    assert(typeof u.autoTick === "function" && (await u.autoTick()).applied === false, "and it never updates itself");
  });

  await check("version info reads package.json and the commit", async () => {
    const v = updaterFor(copy).versionInfo();
    assert(v.version === "1.1.0", `version was ${v.version}`);
    assert(v.commit && v.commit.length === 7, "short commit expected");
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
await check("the update installs the client's build tools even where npm skips dev packages (NODE_ENV=production)", async () => {
  const client = DEFAULT_COMMANDS.find(([, args]) => args.includes("--prefix") && args.includes("client") && args.includes("install"));
  assert(client && client[1].includes("--include=dev"), `client install: ${JSON.stringify(client)}`);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert(/npm --prefix client install --include=dev/.test(pkg.scripts.setup), `setup script: ${pkg.scripts.setup}`);
  // The 1.3 to 1.4 hop runs 1.3's own install commands, then this release's build script, so the build installs vite itself.
  assert(/npm --prefix client install --include=dev/.test(pkg.scripts.build), `build script: ${pkg.scripts.build}`);
});
console.log(failed ? "UPDATE TEST FAILED" : "UPDATE TEST OK");
process.exitCode = failed ? 1 : 0;
