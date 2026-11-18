import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Self-updater. Every creator runs her own copy, so a push to GitHub reaches nobody until
// her copy pulls it. This checks GitHub when the app starts and every 2 minutes after
// (which covers "once a day" too), lists what's new, and on UPDATE NOW it backs up her
// data, pulls, reinstalls, rebuilds and restarts. Her photos, decisions and notes live in
// files git never touches. A Muse's local code fix is kept when it doesn't clash with the
// new version, and saved as a patch in data/backups when it does.

const DATA_FILES = ["db.json", "settings.json", "grievances.json", "quotes.json", "trending.json", "song-pool.json", "drive-plan.json", "last-update.json"];
const KEEP_BACKUPS = 10;
const CHECK_EVERY_MS = 2 * 60 * 1000;
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

export function createUpdater({ root, dataDir, branch = "main", remote = null, commands = DEFAULT_COMMANDS, restart = defaultRestart } = {}) {
  const git = (...args) => run("git", args, root, 2 * 60 * 1000);
  // Updates come from uBee's repo. A copy cloned from a creator's own fork names uBee's repo "upstream",
  // so that one wins when it exists; otherwise "origin" is uBee's repo.
  async function source() {
    if (remote) return remote;
    const r = await git("remote");
    return r.ok && r.out.split("\n").map((x) => x.trim()).includes("upstream") ? "upstream" : "origin";
  }
  const state = { git: null, current: null, latest: null, available: false, whatsNew: [], checkedAt: null, state: "idle", error: null, savedPatch: null };
  let timer = null;
  let checking = null;

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
    state.available = true;
    state.latest = { commit: sha.slice(0, 7) };
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
    const all = readdirSync(join(dataDir, "backups")).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) rmSync(join(dataDir, "backups", old), { recursive: true, force: true });
    return dir;
  }

  function fail(error) {
    state.state = "failed";
    state.error = error;
    return { ok: false, error };
  }

  async function apply() {
    if (state.state === "updating") return { ok: false, error: "An update is already running." };
    state.git = await isGit();
    if (!state.git) return fail("This copy wasn't installed with git, so it can't update itself. Tell your Muse: reinstall Cover Review with git clone.");
    state.state = "updating";
    state.error = null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = backupData(stamp);

    // A Muse may have fixed something in the code locally. Keep it out of the way while pulling.
    let stashed = false;
    let savedPatch = null;
    const dirty = await git("status", "--porcelain", "--untracked-files=no");
    if (dirty.out) {
      const diff = await git("diff", "HEAD");
      savedPatch = join(backupDir, "local-changes.patch");
      writeFileSync(savedPatch, diff.out + "\n");
      const st = await git("stash", "push", "--quiet", "-m", `cover-review update ${stamp}`);
      if (!st.ok) return fail("Couldn't set your copy's local changes aside. Tell your Muse: update my Cover Review.");
      stashed = true;
    }

    const src = await source();
    const remoteRef = `refs/remotes/${src}/${branch}`;
    const fetched = await git("fetch", "--quiet", src, `+refs/heads/${branch}:${remoteRef}`);
    const merged = fetched.ok ? await git("merge", "--ff-only", "--quiet", remoteRef) : fetched;
    if (!merged.ok) {
      if (stashed) await git("stash", "pop", "--quiet");
      return fail(fetched.ok
        ? "Your copy has its own saved changes that the new version can't sit on top of. Tell your Muse: update my Cover Review."
        : "Couldn't reach GitHub to download the update. Check the internet and tap UPDATE NOW again.");
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
      if (!r.ok) return fail(`The new version downloaded, but "${cmd} ${args.join(" ")}" failed. Tell your Muse: finish my Cover Review update.`);
    }

    const from = state.current?.commit || null;
    state.state = "restarting";
    state.available = false;
    state.whatsNew = [];
    state.current = versionInfo();
    // The restarted app reads this to say "Updated" once, and to point a Muse at a saved patch.
    writeFileSync(join(dataDir, "last-update.json"), JSON.stringify({ at: new Date().toISOString(), from, to: state.current.commit, version: state.current.version, savedPatch }, null, 1));
    restart();
    return { ok: true, state: "restarting", savedPatch };
  }

  function lastUpdate() {
    try { return JSON.parse(readFileSync(join(dataDir, "last-update.json"), "utf8")); } catch { return null; }
  }

  function status() {
    return { ...state, current: state.current || versionInfo(), lastUpdate: lastUpdate() };
  }

  function start() {
    if (timer) return;
    setTimeout(() => check().catch(() => {}), 3000);
    timer = setInterval(() => check().catch(() => {}), CHECK_EVERY_MS);
    timer.unref?.();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  return { check, apply, status, start, stop, versionInfo };
}
