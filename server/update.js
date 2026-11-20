import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Self-updater. Every creator runs her own copy, so a push to GitHub reaches nobody until
// her copy pulls it. This checks GitHub when the app starts and every 2 minutes after
// (which covers "once a day" too), lists what's new, and on UPDATE NOW it backs up her
// data, pulls, reinstalls, rebuilds and restarts. Her photos, decisions and notes live in
// files git never touches. A Muse's local code fix is kept when it doesn't clash with the
// new version, and saved as a patch in data/backups when it does.
//
// 1.13.10 (Arjang #729, Quill #733): it also updates on its own at a quiet moment, the same steps as UPDATE NOW.
// Quiet means no tap, key, scroll or wheel on any open page for QUIET_MS, and no page has said within BUSY_HOLD_MS
// that it has an editor, a sheet or a text box open (a page with one open says so every 20 seconds). The minute
// starts when the app starts, so an open page has time to speak up first. Once a new version is known, it looks for
// a quiet moment every AUTO_TICK_MS. If an update fails, the old version goes back on disk (code, packages and the
// built page) and keeps running, the page shows a notice, and that version isn't tried again on its own: Try again,
// a restart of the app, or a newer version tries again.

const DATA_FILES = ["db.json", "settings.json", "grievances.json", "quotes.json", "trending.json", "song-pool.json", "drive-plan.json", "last-update.json",
  "accounts.json"];
// Each account's own files (1.15.0), backed up from data/accounts/<handle>/ the same way.
const ACCOUNT_FILES = ["db.json", "settings.json", "grievances.json", "quotes.json", "trending.json"];
const KEEP_BACKUPS = 10;
const CHECK_EVERY_MS = 2 * 60 * 1000;
const QUIET_MS = 60 * 1000;
const BUSY_HOLD_MS = 45 * 1000;
const AUTO_TICK_MS = 15 * 1000;
// The client's build tool (vite) is a dev package. --include=dev keeps the build working on a machine
// where npm skips dev packages (NODE_ENV=production or omit=dev).
export const DEFAULT_COMMANDS = [
  ["npm", ["install", "--no-audit", "--no-fund"]],
  ["npm", ["--prefix", "client", "install", "--include=dev", "--no-audit", "--no-fund"]],
  ["npm", ["run", "build"]],
];

function run(cmd, args, cwd, timeout = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, shell: process.platform === "win32" && cmd === "npm" },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: String(stdout || "").trim(), err: String(stderr || "").trim() }));
  });
}

export function defaultRestart() {
  if (process.env.COVER_REVIEW_SUPERVISED === "1") {
    setTimeout(() => process.exit(75), 300); // scripts/run.mjs starts the new version
    return;
  }
  const child = spawn(process.execPath, process.argv.slice(1), { cwd: process.cwd(), env: process.env, detached: true, stdio: "ignore" });
  child.unref();
  setTimeout(() => process.exit(0), 300); // the new copy retries the port until this one lets go
}

export function createUpdater({ root, dataDir, branch = "main", remote = null, commands = DEFAULT_COMMANDS, restart = defaultRestart,
  now = () => Date.now(), quietMs = QUIET_MS, busyHoldMs = BUSY_HOLD_MS } = {}) {
  const git = (...args) => run("git", args, root, 2 * 60 * 1000);
  // Updates come from uBee's repo. A copy cloned from a creator's own fork names uBee's repo "upstream",
  // so that one wins when it exists; otherwise "origin" is uBee's repo.
  async function source() {
    if (remote) return remote;
    const r = await git("remote");
    return r.ok && r.out.split("\n").map((x) => x.trim()).includes("upstream") ? "upstream" : "origin";
  }
  const state = { git: null, current: null, latest: null, available: false, whatsNew: [], checkedAt: null, state: "idle", error: null, savedPatch: null, failed: null };
  let timer = null;
  let autoTimer = null;
  let checking = null;
  const activity = { lastInteractionAt: now(), busyUntil: 0 };
  let failedCommit = null; // the version that failed: not tried again on its own

  function packageVersion() {
    try { return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version || "0.0.0"; } catch { return "0.0.0"; }
  }
  function headSync() {
    try { return readFileSync(join(root, ".git", "HEAD"), "utf8").trim(); } catch { return null; }
  }
  function versionInfo() {
    // Reads the commit without spawning git so /api/health stays instant.
    let commit = null;
    const head = headSync();
    if (head) {
      if (head.startsWith("ref: ")) {
        const ref = head.slice(5);
        try { commit = readFileSync(join(root, ".git", ref), "utf8").trim(); }
        catch {
          try {
            const packed = readFileSync(join(root, ".git", "packed-refs"), "utf8").split("\n").find((l) => l.endsWith(` ${ref}`));
            commit = packed ? packed.split(" ")[0] : null;
          } catch { commit = null; }
        }
      } else commit = head;
    }
    return { version: packageVersion(), commit: commit ? commit.slice(0, 7) : null };
  }

  async function isGit() {
    const r = await git("rev-parse", "--is-inside-work-tree");
    return r.ok && r.out === "true";
  }

  async function doCheck() {
    state.git = await isGit();
    state.current = versionInfo();
    state.checkedAt = new Date().toISOString();
    if (!state.git) {
      Object.assign(state, { available: false, latest: null, whatsNew: [] });
      return status();
    }
    const src = await source();
    const remoteHead = await git("ls-remote", src, `refs/heads/${branch}`);
    const sha = remoteHead.ok ? remoteHead.out.split(/\s+/)[0] : "";
    if (!sha) {
      if (state.state !== "updating") state.error = "Couldn't reach GitHub to check for updates. It tries again in 2 minutes.";
      return status();
    }
    if (state.state !== "updating" && state.state !== "failed") state.error = null;
    const head = await git("rev-parse", "HEAD");
    if (head.out === sha || (await git("merge-base", "--is-ancestor", sha, "HEAD")).ok) {
      Object.assign(state, { available: false, latest: { commit: sha.slice(0, 7) }, whatsNew: [] });
      return status();
    }
    // Only fetch when there is something new, so the 2-minute check stays tiny.
    const have = await git("cat-file", "-e", `${sha}^{commit}`);
    if (!have.ok) await git("fetch", "--quiet", src, `+refs/heads/${branch}:refs/remotes/${src}/${branch}`);
    const log = await git("log", "--format=%s", `HEAD..${sha}`);
    let version = null;
    try { version = JSON.parse((await git("show", `${sha}:package.json`)).out).version || null; } catch { version = null; }
    state.available = true;
    state.latest = { commit: sha.slice(0, 7), version };
    state.whatsNew = log.ok ? log.out.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12) : [];
    return status();
  }

  function check() {
    if (!checking) checking = doCheck().finally(() => { checking = null; });
    return checking;
  }

  function backupData(stamp) {
    const dir = join(dataDir, "backups", stamp);
    mkdirSync(dir, { recursive: true });
    for (const f of DATA_FILES) if (existsSync(join(dataDir, f))) copyFileSync(join(dataDir, f), join(dir, f));
    let handles = [];
    try { handles = readdirSync(join(dataDir, "accounts"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none */ }
    for (const h of handles) {
      const from = join(dataDir, "accounts", h), to = join(dir, "accounts", h);
      for (const f of ACCOUNT_FILES) if (existsSync(join(from, f))) { mkdirSync(to, { recursive: true }); copyFileSync(join(from, f), join(to, f)); }
    }
    const all = readdirSync(join(dataDir, "backups")).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) rmSync(join(dataDir, "backups", old), { recursive: true, force: true });
    return dir;
  }

  function fail(error) {
    state.state = "failed";
    state.error = error;
    return { ok: false, error };
  }

  // A failed update puts the old version back on disk, so the code, its packages and the built page all match the
  // version that keeps running, and her Muse's local fix goes back on top. False if rebuilding the old version failed too.
  async function putBack(oldHead, localPatch) {
    await git("reset", "--hard", "--quiet", oldHead);
    if (localPatch) await git("apply", localPatch);
    for (const [cmd, args] of commands) if (!(await run(cmd, args, root)).ok) return false;
    return true;
  }

  async function apply({ auto = false } = {}) {
    if (state.state === "updating") return { ok: false, error: "An update is already running." };
    state.git = await isGit();
    if (!state.git) return fail("This copy wasn't installed with git, so it can't update itself. Tell your Muse: reinstall Cover Review with git clone.");
    if (!auto) failedCommit = null; // Try again always tries
    state.state = "updating";
    state.error = null;
    const fromVersion = packageVersion();
    const oldHead = (await git("rev-parse", "HEAD")).out;
    let target = state.latest?.commit || null;
    const failed = (error) => {
      failedCommit = target;
      state.failed = { from: fromVersion, to: state.latest?.version || null, commit: target, at: new Date().toISOString(), auto };
      return fail(error);
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = backupData(stamp);

    // A Muse may have fixed something in the code locally. Keep it out of the way while pulling.
    let stashed = false;
    let savedPatch = null;
    let localPatch = null; // her Muse's fix as it was, to put back if the update fails
    const dirty = await git("status", "--porcelain", "--untracked-files=no");
    if (dirty.out) {
      const diff = await git("diff", "HEAD");
      localPatch = savedPatch = join(backupDir, "local-changes.patch");
      writeFileSync(savedPatch, diff.out + "\n");
      const st = await git("stash", "push", "--quiet", "-m", `cover-review update ${stamp}`);
      if (!st.ok) return failed("Couldn't set your copy's local changes aside. Tell your Muse: update my Cover Review.");
      stashed = true;
    }

    const src = await source();
    const remoteRef = `refs/remotes/${src}/${branch}`;
    const fetched = await git("fetch", "--quiet", src, `+refs/heads/${branch}:${remoteRef}`);
    if (fetched.ok) {
      const head = await git("rev-parse", remoteRef);
      if (head.ok && head.out) target = head.out.slice(0, 7);
    }
    const merged = fetched.ok ? await git("merge", "--ff-only", "--quiet", remoteRef) : fetched;
    if (!merged.ok) {
      if (stashed) await git("stash", "pop", "--quiet");
      return failed(fetched.ok
        ? "Your copy has its own saved changes that the new version can't sit on top of. Tell your Muse: update my Cover Review."
        : "Couldn't reach GitHub to download the update. Check the internet and tap Try again.");
    }

    if (stashed) {
      const pop = await git("stash", "pop", "--quiet");
      if (pop.ok) {
        savedPatch = null; // her fix sits cleanly on the new version
      } else {
        await git("reset", "--hard", "--quiet", "HEAD"); // the new version wins; her fix stays in the patch and the stash
      }
    }
    state.savedPatch = savedPatch;

    for (const [cmd, args] of commands) {
      const r = await run(cmd, args, root);
      if (!r.ok) {
        const rebuilt = await putBack(oldHead, localPatch);
        return failed(`The new version downloaded, but "${cmd} ${args.join(" ")}" failed, so the app went back to version ${fromVersion}`
          + `${rebuilt ? "" : ", and rebuilding that version didn't finish either"}. Tell your Muse: check my Cover Review update.`);
      }
    }

    const from = state.current?.commit || null;
    state.state = "restarting";
    state.available = false;
    state.whatsNew = [];
    state.current = versionInfo();
    // The restarted app reads this to say "Updated" once, and to point a Muse at a saved patch.
    writeFileSync(join(dataDir, "last-update.json"), JSON.stringify({ at: new Date().toISOString(), from, to: state.current.commit, version: state.current.version, savedPatch, auto }, null, 1));
    restart();
    return { ok: true, state: "restarting", savedPatch };
  }

  function lastUpdate() {
    try { return JSON.parse(readFileSync(join(dataDir, "last-update.json"), "utf8")); } catch { return null; }
  }

  function status() {
    return { ...state, current: state.current || versionInfo(), lastUpdate: lastUpdate() };
  }

  // What the page says about her: busy while an editor, a sheet or a text box is open, and how long since her last tap,
  // key, scroll or wheel (idleMs). The latest word from any page counts.
  function noteActivity({ busy = false, idleMs = 0 } = {}) {
    const t = now();
    const idle = Math.max(0, Math.min(Number(idleMs) || 0, 60 * 60 * 1000));
    activity.lastInteractionAt = Math.max(activity.lastInteractionAt, t - idle);
    if (busy) activity.busyUntil = Math.max(activity.busyUntil, t + busyHoldMs);
  }
  function quiet() {
    const t = now();
    return t - activity.lastInteractionAt >= quietMs && t >= activity.busyUntil;
  }
  // One look for a quiet moment. The loop runs it every AUTO_TICK_MS; tests call it directly.
  async function autoTick() {
    if (state.state === "updating" || state.state === "restarting") return { applied: false, reason: "updating" };
    if (!state.git || !state.available || !state.latest?.commit) return { applied: false, reason: "nothing-new" };
    if (failedCommit && failedCommit === state.latest.commit) return { applied: false, reason: "failed-before" };
    if (!quiet()) return { applied: false, reason: "not-quiet" };
    const r = await apply({ auto: true });
    return r.ok ? { applied: true, reason: "applied" } : { applied: false, reason: "failed", error: r.error };
  }

  function start() {
    if (timer) return;
    setTimeout(() => check().catch(() => {}), 3000);
    timer = setInterval(() => check().catch(() => {}), CHECK_EVERY_MS);
    timer.unref?.();
    autoTimer = setInterval(() => autoTick().catch(() => {}), AUTO_TICK_MS);
    autoTimer.unref?.();
  }
  function stop() {
    if (timer) clearInterval(timer);
    if (autoTimer) clearInterval(autoTimer);
    timer = null;
    autoTimer = null;
  }

  return { check, apply, status, start, stop, versionInfo, noteActivity, autoTick };
}
