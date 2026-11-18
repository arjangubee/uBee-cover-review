// A copy that can't pull from GitHub (a hosted Muse space, a downloaded zip) still needs to know when a
// new version is out. It reads uBee's public release note straight from GitHub and compares it with the
// version this page was built from. Updating that copy is her Muse's job, so the banner hands her one line
// to send her Muse.

export const RELEASE_URL = "https://raw.githubusercontent.com/arjangubee/uBee-cover-review/main/release.json";
/* global __APP_VERSION__ */
export const BUILT_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

const parts = (v) => (/^\d+\.\d+\.\d+$/.test(String(v ?? "")) ? String(v).split(".").map(Number) : null);

/** True when version a is newer than version b (x.y.z, compared as numbers). */
export function newer(a, b) {
  const x = parts(a), y = parts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** The banner for a hosted copy, or null when there's nothing newer than what this page was built from. */
export function releaseBanner(release, current) {
  if (!release || !newer(release.version, current)) return null;
  return {
    version: release.version,
    whatsNew: Array.isArray(release.whatsNew) ? release.whatsNew.map(String).slice(0, 12) : [],
    ask: `Update my Cover Review to version ${release.version}.`,
  };
}
