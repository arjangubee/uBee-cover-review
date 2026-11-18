// Keeps Cover Review running across updates. `npm start` runs this.
// When UPDATE NOW finishes, the server exits with code 75 and this starts the new version.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let child = null;

function start() {
  child = spawn(process.execPath, [join(root, "server", "index.js")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, COVER_REVIEW_SUPERVISED: "1" },
  });
  child.on("exit", (code, signal) => {
    if (code === 75) {
      console.log("Cover Review updated. Starting the new version...");
      start();
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { if (child) child.kill(sig); });
start();
