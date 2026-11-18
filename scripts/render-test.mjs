// Client logic checked without a browser: the layout math that puts the quote on the posted cover where
// the review deck shows it, the words the Approved grid uses, and the new-version check for hosted copies.
// Run: node scripts/render-test.mjs
import { PREVIEW_WIDTH, coverLayout, wrapText } from "../client/src/renderCover.js";
import { LOCKED, badgeFor, formatDay, selectable } from "../client/src/pollenView.js";
import { RELEASE_URL, newer, releaseBanner } from "../client/src/release.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const tenPerChar = (s) => s.length * 10;
const atPx = (px) => (s) => s.length * px * 0.5; // a monospace font, half as wide as it is tall
const base = { quote: "golden hour again", fontSize: 58, fontWeight: 500, textFont: "tiktok", textAlign: "center",
  textColor: "#FFFFFF", opacity: 100, horizontalPosition: 50, verticalPosition: 50 };

check("long quotes wrap at spaces inside the box and keep every word", () => {
  const lines = wrapText("one two three four five six", 100, tenPerChar);
  assert(lines.every((l) => tenPerChar(l) <= 100), `a line is too wide: ${JSON.stringify(lines)}`);
  assert(lines.join(" ") === "one two three four five six", `words changed: ${JSON.stringify(lines)}`);
  assert(lines.length === 3, `expected 3 lines, got ${JSON.stringify(lines)}`);
});
check("a word wider than the box breaks inside the word, like the preview", () => {
  const lines = wrapText("supercalifragilistic", 100, tenPerChar);
  assert(lines.every((l) => tenPerChar(l) <= 100) && lines.join("") === "supercalifragilistic", JSON.stringify(lines));
});
check("line breaks she typed stay", () => {
  const lines = wrapText("first line\nsecond", 1000, tenPerChar);
  assert(JSON.stringify(lines) === JSON.stringify(["first line", "second"]), JSON.stringify(lines));
});
check("text size scales from the preview width, so it covers the same share of the photo", () => {
  const L = coverLayout(base, PREVIEW_WIDTH * 4, 2400, atPx);
  assert(Math.abs(L.fontPx - 58 * 0.55 * 4) < 1e-9, `font ${L.fontPx}`);
});
check("small sizes keep the preview's 14 pixel floor before scaling", () => {
  const L = coverLayout({ ...base, fontSize: 20 }, PREVIEW_WIDTH * 2, 1000, atPx);
  assert(Math.abs(L.fontPx - 28) < 1e-9, `font ${L.fontPx}`);
});
check("the quote box is 84% wide and centered on the slider spot", () => {
  const W = PREVIEW_WIDTH, H = 600;
  const L = coverLayout({ ...base, quote: "a b c d e f g h i j k l m n o p q r s t u v w x y z", horizontalPosition: 30, verticalPosition: 40 }, W, H, atPx);
  const boxW = W * 0.84;
  assert(L.lines.every((l) => atPx(L.fontPx)(l) <= boxW + 1e-9), "a line spills out of the 84% box");
  assert(Math.abs(L.x - W * 0.3) < 1e-9, `center x ${L.x}`);
  assert(Math.abs(L.top + (L.lines.length * L.fontPx) / 2 - H * 0.4) < 1e-9, `box middle ${L.top}`);
});
check("left and right alignment hang off the box edges", () => {
  const W = PREVIEW_WIDTH, left = coverLayout({ ...base, textAlign: "left" }, W, 600, atPx), right = coverLayout({ ...base, textAlign: "right" }, W, 600, atPx);
  assert(Math.abs(left.x - (W / 2 - W * 0.42)) < 1e-9 && left.align === "left", `left x ${left.x}`);
  assert(Math.abs(right.x - (W / 2 + W * 0.42)) < 1e-9 && right.align === "right", `right x ${right.x}`);
});
check("opacity carries over", () => {
  assert(coverLayout({ ...base, opacity: 40 }, PREVIEW_WIDTH, 600, atPx).alpha === 0.4, "alpha");
});
check("booked days read like Tue Nov 24 in any time zone", () => {
  assert(formatDay("2026-11-24") === "Tue Nov 24", formatDay("2026-11-24"));
  assert(formatDay(null) === "", "no day, no words");
});
check("badges say where each cover stands", () => {
  assert(badgeFor(null) === null, "an unsent cover has no badge");
  assert(badgeFor({ status: "waiting" }).text === "Waiting for Pollen", "waiting");
  assert(badgeFor({ status: "leased" }).text === "Waiting for Pollen", "leased reads the same as waiting");
  assert(badgeFor({ status: "booked", bookedDay: "2026-11-24" }).text === "Booked Tue Nov 24", "booked");
  const b = badgeFor({ status: "booked", bookedDay: "2026-11-24" });
  assert(b.label === "Booked" && b.detail === "Tue Nov 24", "a booked tile shows Booked over the day, so it never breaks mid-date");
  assert(badgeFor({ status: "posted" }).text === "Posted", "posted");
  assert(badgeFor({ status: "failed", error: "no empty day" }).text === "Didn't book", "failed");
  assert(badgeFor({ status: "not_sent", error: "offline" }).text === "Not sent", "not sent");
});
check("booked, waiting and posted covers can't be picked again; failed and unsent ones can", () => {
  for (const s of ["waiting", "leased", "booked", "posted"]) assert(LOCKED.includes(s) && !selectable({ pollen: { status: s } }), s);
  for (const s of ["failed", "not_sent"]) assert(selectable({ pollen: { status: s } }), s);
  assert(selectable({ pollen: null }), "a fresh cover");
});

check("version numbers compare as numbers, not text", () => {
  assert(newer("1.4.0", "1.3.0") && newer("1.10.0", "1.9.9") && newer("2.0.0", "1.99.99"), "newer versions should win");
  assert(!newer("1.3.0", "1.3.0") && !newer("1.3.0", "1.10.0") && !newer("bad", "1.0.0") && !newer(null, "1.0.0"), "same, older or broken is not newer");
});
check("a hosted copy hears about a new release and gets one line to send its Muse", () => {
  const b = releaseBanner({ version: "1.4.0", whatsNew: ["Carousels", "Unschedule"] }, "1.3.0");
  assert(b && b.version === "1.4.0" && b.whatsNew.join() === "Carousels,Unschedule", JSON.stringify(b));
  assert(b.ask === "Update my Cover Review to version 1.4.0.", b.ask);
  assert(releaseBanner({ version: "1.3.0" }, "1.3.0") === null && releaseBanner(null, "1.3.0") === null, "nothing new, no banner");
  assert(RELEASE_URL === "https://raw.githubusercontent.com/arjangubee/uBee-cover-review/main/release.json", RELEASE_URL);
});

console.log(failed ? "RENDER TEST FAILED" : "RENDER TEST OK");
process.exitCode = failed ? 1 : 0;
