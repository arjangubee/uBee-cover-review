import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The page knows which version it was built from, so a copy that can't pull from GitHub can still tell
// when uBee ships a newer one.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:4173", "/uploads": "http://localhost:4173", "/brand": "http://localhost:4173" } },
});
