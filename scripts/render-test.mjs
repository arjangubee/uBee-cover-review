// Client logic checked without a browser: the layout math that puts the quote on the posted cover where
// the review deck shows it, the words the Approved grid uses, and the new-version check for hosted copies.
// Run: node scripts/render-test.mjs
import { PREVIEW_WIDTH, balanceLines, contrastPixel, coverLayout, mosaicRects, textBoxes, wrapText } from "../client/src/renderCover.js";
import { createHistory } from "../client/src/undo.js";
import { changedFields, displayTitle, parseSong, randomLayout, starsFor, storyCrop, valueForStars } from "../client/src/reviewMath.js";
import { LOCKED, badgeFor, formatDay, selectable } from "../client/src/pollenView.js";
import { RELEASE_URL, newer, releaseBanner } from "../client/src/release.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const tenPerChar = (s) => s.length * 10;
const previewSize = (size) => Math.max(14, size * 0.55);
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
check("the quote box is 84% wide and a short quote sits centered on the slider spot", () => {
  const W = PREVIEW_WIDTH, H = 600;
  const L = coverLayout({ ...base, quote: "a b c d e f g h i j k l m n o p q r s t u v w x y z" }, W, H, atPx);
  assert(L.lines.every((l) => atPx(L.fontPx)(l) <= W * 0.84 + 1e-9), "a line spills out of the 84% box");
  const S = coverLayout({ ...base, quote: "a b c", horizontalPosition: 30, verticalPosition: 40 }, W, H, atPx);
  assert(Math.abs(S.x - W * 0.3) < 1e-9, `center x ${S.x}`);
  assert(Math.abs(S.top + (S.lines.length * S.fontPx) / 2 - H * 0.4) < 1e-9, `box middle ${S.top}`);
});
check("left and right alignment hang off the box edges", () => {
  const W = PREVIEW_WIDTH, left = coverLayout({ ...base, textAlign: "left" }, W, 600, atPx), right = coverLayout({ ...base, textAlign: "right" }, W, 600, atPx);
  assert(Math.abs(left.x - (W / 2 - W * 0.42)) < 1e-9 && left.align === "left", `left x ${left.x}`);
  assert(Math.abs(right.x - (W / 2 + W * 0.42)) < 1e-9 && right.align === "right", `right x ${right.x}`);
});
check("opacity carries over", () => {
  assert(coverLayout({ ...base, opacity: 40 }, PREVIEW_WIDTH, 600, atPx).alpha === 0.4, "alpha");
});
// ---------- v1.4: Quill look. Lines, width, height, justify, extra boxes, image effects, undo ----------
const longQuote = "a lot of people are surprised to find out I don't just make rugs";
const widthOf = (L, row) => atPx(L.fontPx)(row.text);
check("old covers keep the v1.3 layout when the new fields are missing", () => {
  const L = coverLayout(base, PREVIEW_WIDTH, 600, atPx);
  assert(Math.abs(L.boxW - PREVIEW_WIDTH * 0.84) < 1e-9 && Math.abs(L.lineHeight - L.fontPx) < 1e-9, `box ${L.boxW} line ${L.lineHeight}`);
  assert(L.rows.length === L.lines.length && L.rows.every((r, i) => r.text === L.lines[i]), "rows follow lines");
});
check("text width sets the wrap box", () => {
  const W = PREVIEW_WIDTH, L = coverLayout({ ...base, quote: longQuote, textWidth: 50 }, W, 600, atPx);
  assert(L.boxW === W * 0.5, `box ${L.boxW}`);
  assert(L.lines.every((l) => atPx(L.fontPx)(l) <= W * 0.5 + 1e-9), "a line spills out of the 50% box");
});
check("text height spaces the lines and keeps the block centered", () => {
  const H = 600, L = coverLayout({ ...base, quote: longQuote, textHeight: 150, verticalPosition: 50 }, PREVIEW_WIDTH, H, atPx);
  assert(Math.abs(L.lineHeight - L.fontPx * 1.5) < 1e-9, `line ${L.lineHeight}`);
  assert(Math.abs(L.top + (L.rows.length * L.lineHeight) / 2 - H / 2) < 1e-9, `top ${L.top}`);
  assert(Math.abs(L.rows[1].y - L.rows[0].y - L.lineHeight) < 1e-9, "rows step by the line height");
});
check("Lines 2 splits the quote into two balanced rows and keeps every word", () => {
  const rows = balanceLines(longQuote, 2, tenPerChar);
  assert(rows.length === 2 && rows.join(" ") === longQuote, JSON.stringify(rows));
  const widths = rows.map(tenPerChar);
  assert(Math.abs(widths[0] - widths[1]) <= 60, `unbalanced ${widths}`);
});
check("Lines never makes more rows than words, and an empty quote makes none", () => {
  assert(JSON.stringify(balanceLines("hello world", 4, tenPerChar)) === JSON.stringify(["hello", "world"]), "two words, two rows");
  assert(balanceLines("", 3, tenPerChar).length === 0 && balanceLines("   ", 2, tenPerChar).length === 0, "empty quote, no rows");
  const L = coverLayout({ ...base, quote: "", lineCount: 3 }, PREVIEW_WIDTH, 600, atPx);
  assert(L.rows.length === 0, "no rows to draw");
});
check("Lines shrinks the text when a row would be wider than the box, so nothing leaves the photo", () => {
  const W = PREVIEW_WIDTH, L = coverLayout({ ...base, quote: longQuote, lineCount: 1, fontSize: 90 }, W, 600, atPx);
  assert(L.rows.length === 1, `rows ${L.rows.length}`);
  assert(L.fontPx < previewSize(90) * (W / PREVIEW_WIDTH), `font ${L.fontPx} did not shrink`);
  assert(widthOf(L, L.rows[0]) <= L.boxW + 1e-6, `row ${widthOf(L, L.rows[0])} wider than box ${L.boxW}`);
});
check("rows stay on the photo even when the slider sits near an edge", () => {
  const W = PREVIEW_WIDTH, inside = (L) => L.rows.every((r) => r.left >= -1e-9 && r.left + r.width <= W + 1e-9);
  const L = coverLayout({ ...base, quote: longQuote, horizontalPosition: 2 }, W, 600, atPx);
  assert(inside(L), `rows ${JSON.stringify(L.rows.map((r) => [r.left, r.width]))}`);
  const R = coverLayout({ ...base, quote: longQuote, horizontalPosition: 99, textAlign: "right" }, W, 600, atPx);
  assert(inside(R) && R.x <= W + 1e-9, `right edge ${R.x}`);
  const J = coverLayout({ ...base, quote: longQuote, horizontalPosition: 10, textAlign: "justify", textWidth: 100 }, W, 600, atPx);
  assert(inside(J), "justified rows stay on the photo");
});
check("justify spreads each row to both box edges, except a paragraph's last row", () => {
  const W = PREVIEW_WIDTH, L = coverLayout({ ...base, quote: longQuote, textAlign: "justify", textWidth: 60 }, W, 600, atPx);
  assert(L.rows.length >= 2, `rows ${L.rows.length}`);
  const m = atPx(L.fontPx);
  for (const row of L.rows.slice(0, -1)) {
    const first = row.words[0], last = row.words[row.words.length - 1];
    assert(Math.abs(first.x - L.boxLeft) < 1e-6, `row starts at ${first.x}, box at ${L.boxLeft}`);
    if (row.words.length > 1) assert(Math.abs(last.x + m(last.text) - (L.boxLeft + L.boxW)) < 1e-6, "row should end at the box edge");
  }
  const lastRow = L.rows[L.rows.length - 1];
  assert(!lastRow.words || lastRow.words.every((w, i, a) => i === 0 || w.x > a[i - 1].x), "last row reads left to right");
  assert(L.align === "left" && Math.abs(lastRow.x - L.boxLeft) < 1e-6, "the last row sits on the left edge");
});
check("image contrast: normal leaves pixels alone, black and white is gray, more contrast pushes from the middle", () => {
  assert(JSON.stringify(contrastPixel(10, 120, 240, "normal")) === "[10,120,240]", "normal");
  const [r, g, b] = contrastPixel(200, 100, 50, "bw");
  assert(r === g && g === b && r > 50 && r < 200, `bw ${r},${g},${b}`);
  const hi = contrastPixel(200, 50, 128, "high");
  assert(hi[0] > 200 && hi[1] < 50 && Math.abs(hi[2] - 128) <= 2, `high ${hi}`);
  assert(contrastPixel(255, 0, 255, "high").every((v) => v >= 0 && v <= 255), "stays in range");
});
check("face mosaic boxes become pixels inside the photo; broken ones are dropped", () => {
  const rects = mosaicRects([{ x: 10, y: 20, w: 30, h: 40 }, { x: 90, y: 90, w: 30, h: 30 }, { x: 5, y: 5, w: 0, h: 10 }, null, { x: "a" }], 1000, 500);
  assert(rects.length === 2, `rects ${JSON.stringify(rects)}`);
  assert(rects[0].x === 100 && rects[0].y === 100 && rects[0].w === 300 && rects[0].h === 200, JSON.stringify(rects[0]));
  assert(rects[1].x + rects[1].w <= 1000 && rects[1].y + rects[1].h <= 500, "clamped to the photo");
});
check("extra text boxes always draw, the quote only when it's on, each with full defaults", () => {
  const item = { ...base, quote: "main", extraTexts: [{ quote: "extra one", textColor: "#FB0909" }, { quote: "" }] };
  const on = textBoxes(item, true), off = textBoxes(item, false);
  assert(on.length === 2 && on[0].quote === "main" && on[1].quote === "extra one", JSON.stringify(on.map((b) => b.quote)));
  assert(off.length === 1 && off[0].quote === "extra one", "quote off still draws her extra box");
  assert(on[1].textColor === "#FB0909" && on[1].fontSize === 58 && on[1].horizontalPosition === 50, "extra box gets defaults");
});
check("undo and redo walk back and forth, and a new change clears redo", () => {
  const h = createHistory(3);
  assert(!h.canUndo() && !h.canRedo(), "starts empty");
  h.push({ label: "a" }); h.push({ label: "b" });
  assert(h.undo().label === "b" && h.canRedo(), "undo returns the last change");
  assert(h.redo().label === "b" && !h.canRedo(), "redo puts it back");
  h.undo(); h.push({ label: "c" });
  assert(!h.canRedo() && h.undo().label === "c" && h.undo().label === "a" && h.undo() === null, "new change clears redo");
  const small = createHistory(2); ["x", "y", "z"].forEach((label) => small.push({ label }));
  assert(small.undo().label === "z" && small.undo().label === "y" && small.undo() === null, "keeps only the last 2");
});
check("extra boxes remember which of her boxes they are, even with an empty one before them", () => {
  const boxes = textBoxes({ ...base, quote: "q", extraTexts: [{ quote: "" }, { quote: "second" }] }, true);
  assert(boxes[1].extraIndex === 1 && boxes[0].main === true, JSON.stringify(boxes.map((b) => [b.main, b.extraIndex])));
});
check("story view crops a 9:16 frame from the photo where the pan sliders point", () => {
  const c = storyCrop(2000, 1000, 0, 50);
  assert(Math.abs(c.h - 1000) < 1e-9 && Math.abs(c.w - 562.5) < 1e-9 && c.x === 0 && c.y === 0, JSON.stringify(c));
  const r = storyCrop(2000, 1000, 100, 50);
  assert(Math.abs(r.x + r.w - 2000) < 1e-9, `right edge ${r.x + r.w}`);
  const tall = storyCrop(900, 2000, 50, 100);
  assert(Math.abs(tall.w - 900) < 1e-9 && Math.abs(tall.h - 1600) < 1e-9 && Math.abs(tall.y - 400) < 1e-9, JSON.stringify(tall));
});
check("titles drop the file ending; songs split into artist and title", () => {
  assert(displayTitle("IMG_0221.jpeg") === "IMG_0221" && displayTitle("cover.v2.png") === "cover.v2" && displayTitle("") === "Cover", displayTitle("IMG_0221.jpeg"));
  const s1 = parseSong("Frank Ocean - In My Room");
  assert(s1.artist === "Frank Ocean" && s1.title === "In My Room", JSON.stringify(s1));
  assert(parseSong("Just A Title").title === "Just A Title" && parseSong("Just A Title").artist === "", "no artist");
  assert(parseSong("").title === "" && parseSong(null).artist === "", "empty");
});
check("stars are half the 1 to 10 rating, and back", () => {
  assert(starsFor(null) === 0 && starsFor(8) === 4 && starsFor(7) === 4 && starsFor(1) === 1 && starsFor(10) === 5, "stars");
  assert(valueForStars(3) === 6 && valueForStars(0) === null && valueForStars(9) === 10, "value");
});
check("only the fields that changed go into an edit, with their old values for undo", () => {
  const d = changedFields({ a: 1, b: [1], c: "x" }, { a: 1, b: [2], c: "y" }, ["a", "b", "c"]);
  assert(JSON.stringify(d.after) === '{"b":[2],"c":"y"}' && JSON.stringify(d.before) === '{"b":[1],"c":"x"}', JSON.stringify(d));
  assert(changedFields({ a: 1 }, { a: 1 }, ["a"]) === null, "nothing changed, no edit");
});
check("Randomize layout stays inside the palette, the fonts and the photo", () => {
  const palette = [{ hex: "#FFFFFF" }, { hex: "#FB0909" }];
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const p = randomLayout(rand, palette, ["tiktok", "serif", "papyrus"]);
    assert(palette.some((c) => c.hex === p.textColor) && ["tiktok", "serif"].includes(p.textFont), JSON.stringify(p));
    assert(p.horizontalPosition >= 30 && p.horizontalPosition <= 70 && p.verticalPosition >= 20 && p.verticalPosition <= 80, JSON.stringify(p));
    assert([0, 2, 3, 4].includes(p.lineCount) && ["left", "center", "right"].includes(p.textAlign) && [500, 700].includes(p.fontWeight), JSON.stringify(p));
  }
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
