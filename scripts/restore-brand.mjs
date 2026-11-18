// Brand PNGs travel through some file pipelines as base64 text (.png.b64).
// This restores the real PNG files next to them when they are missing.
// Safe to run any time: existing PNGs are left alone.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const brandDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand");
for (const name of ["ubee-bee-chartreuse.png", "ubee-wordmark-chartreuse.png"]) {
  const png = join(brandDir, name);
  const b64 = join(brandDir, `${name}.b64`);
  if (!existsSync(png) && existsSync(b64)) {
    writeFileSync(png, Buffer.from(readFileSync(b64, "utf8").replace(/\s+/g, ""), "base64"));
    console.log(`restored ${name}`);
  }
}
