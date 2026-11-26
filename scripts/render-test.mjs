// Client logic checked without a browser: the layout math that puts the quote on the posted cover where
// the review deck shows it, the words the Approved grid uses, and the new-version check for hosted copies.
// Run: node scripts/render-test.mjs
import { LANDSCAPE_MIN_WIDTH, autoLines, rewrapWidth, FONT_CSS, FONT_LABELS, HALF_PRESETS, PREVIEW_WIDTH, STYLE_DEFAULTS, autoLineCount, balanceLines, colorPatch, contrastPixel, coverLayout, drawCover, estimatedLineCount, insideSafeZone, lookOf, mosaicRects, normalizePlacement, presetOn, randomizeLayout, registerFonts, safeZoneFor, textBoxes, textHitBoxes, withLook } from "../client/src/renderCover.js";
import { createHistory } from "../client/src/undo.js";
import { globalHide, overlayOf, ownQuote, quoteShown } from "../client/src/quoteOverlay.js";
import { aspectLabel, RANDOM_LAYOUTS, ZOOM_REST, changedFields, displayTitle, parseSong, randomEditorialLayout, spotifyEmbedUrl, starsFor, storyCrop, valueForStars, zoomPan, zoomSettle, zoomTo } from "../client/src/reviewMath.js";
import { LOCKED, badgeFor, formatDay, selectable } from "../client/src/pollenView.js";
import { RELEASE_URL, newer, releaseBanner } from "../client/src/release.js";
import { canUse, clipAddress, coverSongEdit, hotList, librarySorted, moveText, onCover, partLabel, partsOf, replayPath, searchSongs, sourceFor, statusLine, symphonyIdOf, topGenres } from "../client/src/songs/songsData.js";
import { clipNow, clipSource } from "../client/src/songs/clipSource.js";
import { readFileSync } from "node:fs";
import { LOCK_BREAK, LOCK_START, lockAxis, startAxis } from "../client/src/safeLock.js";
import { SNAP_PX, guidesFor, snap } from "../client/src/snapGuides.js";
import { HOUSE, contrastOf, pickHouseColor, randomWheelColor, seeded as coverSeed } from "../client/src/houseColor.js";
import { composePasses, driveLinkFor, whyProblem } from "../client/src/reviewMath.js";
import { searchCovers } from "../client/src/searchCovers.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
async function checkAsync(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const tenPerChar = (s) => s.length * 10;
const previewSize = (size) => Math.max(14, size * 0.55);
const atPx = (px) => (s) => s.length * px * 0.5; // a monospace font, half as wide as it is tall
const base = { quote: "golden hour again", fontSize: 58, fontWeight: 500, textFont: "tiktok", textAlign: "center",
  textColor: "#FFFFFF", opacity: 100, horizontalPosition: 50, verticalPosition: 50 };

// 1.13.8 (Quill #687 and #689): Lines on Auto draws the original's SafeQuote rule, not a greedy wrap. The count is the
// characters / 20 (at least 1, never more than the words), or her typed line count when she typed more than one line.
// The words are then balanced across that many rows, so a typed break stays only where balancing lands on it.
check("Lines on Auto picks the original's count: characters / 20, at least 1, at most the words, or her typed lines (1.13.8)", () => {
  assert(estimatedLineCount("") === 0 && estimatedLineCount("   ") === 0, "no words, no rows");
  assert(estimatedLineCount("hi") === 1 && estimatedLineCount("a b c") === 1, "a short quote is one row");
  assert(estimatedLineCount("one two three four five six seven eight nine ten") === 2, "49 characters: 2 rows");
  assert(estimatedLineCount("a lot of people are surprised to find out I don't just make rugs") === 3, "64 characters: 3 rows");
  assert(estimatedLineCount("extraordinarily magnificent unbelievably") === 2, "40 characters, 3 words: 2 rows");
  assert(estimatedLineCount("incomprehensibilities antidisestablishmentarianism") === 2, "2 words cap it at 2");
  assert(estimatedLineCount("first line\nsecond") === 2 && estimatedLineCount("one\ntwo\nthree words here") === 3, "her typed lines pick the count");
  assert(estimatedLineCount("one line\n") === 1, "an empty typed line doesn't count");
});
check("lineCount 0 draws the estimate as balanced rows, and her typed breaks are balanced like any space (1.13.8)", () => {
  const q = "a lot of people are surprised to find out I don't just make rugs";
  const L = coverLayout({ ...base, quote: q }, PREVIEW_WIDTH, 600, atPx);
  assert(JSON.stringify(L.lines) === JSON.stringify(balanceLines(q, 3, tenPerChar)), `three balanced rows: ${JSON.stringify(L.lines)}`);
  const T = coverLayout({ ...base, quote: "first line here\nsecond" }, PREVIEW_WIDTH, 600, atPx);
  assert(JSON.stringify(T.lines) === JSON.stringify(["first line", "here second"]), `two rows, balanced across her break: ${JSON.stringify(T.lines)}`);
  const W = coverLayout({ ...base, quote: "supercalifragilisticexpialidocious", fontSize: 110 }, PREVIEW_WIDTH, 600, atPx);
  assert(W.lines.length === 1 && atPx(W.fontPx)(W.lines[0]) <= W.boxW + 1e-6, "a word wider than the box shrinks the text to fit, whole");
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
  const S = coverLayout({ ...base, quote: "a b c", horizontalPosition: 50, verticalPosition: 40 }, W, H, atPx);
  assert(Math.abs(S.x - W * 0.5) < 1e-9, `center x ${S.x}`);
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
check("justify spreads every row of two or more words to both box edges, the last row too (1.20.0, Big Edit item 11)", () => {
  // Three rows whose last one ("on my skin") is far narrower than the box when set with plain spaces.
  const W = PREVIEW_WIDTH, L = coverLayout({ ...base, quote: "soft light on the water and on my skin", lineCount: 3, textAlign: "justify", textWidth: 60 }, W, 600, atPx);
  assert(L.rows.length === 3, `rows ${L.rows.length}`);
  const m = atPx(L.fontPx);
  assert(m(L.rows[2].text) < L.boxW * 0.7, `the last row should be short when set plainly: ${m(L.rows[2].text)} of ${L.boxW}`);
  for (const row of L.rows) {
    const first = row.words[0], last = row.words[row.words.length - 1];
    assert(Math.abs(first.x - L.boxLeft) < 1e-6, `row starts at ${first.x}, box at ${L.boxLeft}`);
    assert(row.words.every((w, i, a) => i === 0 || w.x > a[i - 1].x), "each row reads left to right");
    if (row.words.length > 1) assert(Math.abs(last.x + m(last.text) - (L.boxLeft + L.boxW)) < 1e-6, `row "${row.text}" should end at the box edge`);
  }
  const lastRow = L.rows[L.rows.length - 1];
  assert(lastRow.words.length > 1, `the test quote's last row should have two or more words: "${lastRow.text}"`);
  assert(L.align === "left", "justify lays out from the left edge");
  // A last row of one word has nothing to spread: it starts at the left edge, like every row.
  const one = coverLayout({ ...base, quote: "golden hour again tonight", lineCount: 4, textAlign: "justify", textWidth: 60 }, W, 600, atPx);
  const tail = one.rows[one.rows.length - 1];
  assert(tail.words.length === 1 && Math.abs(tail.words[0].x - one.boxLeft) < 1e-6, `a one-word last row starts at the left edge: ${JSON.stringify(tail)}`);
});
// A stand-in for a canvas: fonts measure half as wide as they are tall, and every fillText is recorded
// in screen space through the translate and scale calls drawCover makes.
function fakeCtx() {
  const ctx = { font: "", fillStyle: "", globalAlpha: 1, textBaseline: "", textAlign: "", drawn: [], m: [1, 0, 0, 1, 0, 0], stack: [] };
  const pxOf = () => Number((/([\d.]+)px/.exec(ctx.font) || [0, 10])[1]);
  ctx.measureText = (t) => ({ width: String(t).length * pxOf() * 0.5 });
  ctx.save = () => ctx.stack.push([...ctx.m]);
  ctx.restore = () => { ctx.m = ctx.stack.pop() || [1, 0, 0, 1, 0, 0]; };
  ctx.clearRect = () => {};
  ctx.translate = (x, y) => { ctx.m = [ctx.m[0], 0, 0, ctx.m[3], ctx.m[4] + ctx.m[0] * x, ctx.m[5] + ctx.m[3] * y]; };
  ctx.scale = (sx, sy) => { ctx.m = [ctx.m[0] * sx, 0, 0, ctx.m[3] * sy, ctx.m[4], ctx.m[5]]; };
  ctx.fillText = (text, x, y) => ctx.drawn.push({ text, x: ctx.m[0] * x + ctx.m[4], y: ctx.m[3] * y + ctx.m[5], sx: ctx.m[0], sy: ctx.m[3] });
  return ctx;
}
const stretchItem = (extra) => ({ id: 1, showQuote: true, quote: "golden hour again", fontSize: 58, fontWeight: 500, textFont: "tiktok",
  textAlign: "center", textColor: "#FFFFFF", opacity: 100, horizontalPosition: 50, verticalPosition: 50, ...extra });
const hit = (item, w = 1000, h = 1250) => textHitBoxes(item, w, h, fakeCtx(), true)[0];

check("text stretch defaults to the neutral 30 and 30 for every cover", () => {
  assert(STYLE_DEFAULTS.widthScale === 30 && STYLE_DEFAULTS.heightScale === 30, JSON.stringify(STYLE_DEFAULTS));
});
check("at 30 and 30 the text draws exactly as it did before stretch existed", () => {
  const a = coverLayout(base, 1000, 1250, atPx), b = coverLayout({ ...base, widthScale: 30, heightScale: 30 }, 1000, 1250, atPx);
  assert(JSON.stringify(a.rows) === JSON.stringify(b.rows) && a.top === b.top, "rows moved at the neutral stretch");
  const plain = fakeCtx(); drawCover(plain, stretchItem({}), null, 1000, 1250, { quoteOn: true });
  assert(plain.drawn.length && plain.drawn.every((d) => d.sx === 1 && d.sy === 1), JSON.stringify(plain.drawn));
});
check("Text width 45 makes the letters one and a half times wider than tall, around the same center", () => {
  const n = hit(stretchItem({ quote: "golden" })), w = hit(stretchItem({ quote: "golden", widthScale: 45 }));
  const L = coverLayout({ ...base, quote: "golden", widthScale: 45 }, 1000, 1250, atPx);
  assert(Math.abs(L.kx / L.ky - 1.5) < 1e-9, `stretch ratio ${L.kx / L.ky}`);
  assert(Math.abs((w.left + w.right) / 2 - (n.left + n.right) / 2) < 1e-6, "the stretched block moved off its center");
  assert(Math.abs((w.right - w.left) - 1.5 * L.fit * (n.right - n.left)) < 1e-6, `width ${w.right - w.left} vs ${n.right - n.left}`);
});
check("stretch stays inside the original's 10 to 50 range", () => {
  const big = coverLayout({ ...base, widthScale: 80, heightScale: 2 }, 1000, 1250, atPx);
  assert(Math.abs(big.sx - 50 / 30) < 1e-9 && Math.abs(big.sy - 10 / 30) < 1e-9, `scale ${big.sx}, ${big.sy}`);
});
check("Text height 15 draws the block half as tall around the same anchor", () => {
  const n = hit(stretchItem({})), t = hit(stretchItem({ heightScale: 15 }));
  assert(Math.abs((t.bottom - t.top) - (n.bottom - n.top) / 2) < 1e-6, `height ${t.bottom - t.top} vs ${n.bottom - n.top}`);
  assert(Math.abs((t.top + t.bottom) / 2 - (n.top + n.bottom) / 2) < 1e-6, "the squashed block moved off its anchor");
});
check("the drawn text and the tap box agree when the text is stretched", () => {
  const item = stretchItem({ widthScale: 50, heightScale: 20 }), ctx = fakeCtx();
  drawCover(ctx, item, null, 1000, 1250, { quoteOn: true });
  const box = hit(item), L = coverLayout(item, 1000, 1250, atPx);
  const d = ctx.drawn[0];
  assert(Math.abs(d.sx / d.sy - 50 / 20) < 1e-9, `letters should be 2.5 times wider than tall: ${d.sx}, ${d.sy}`);
  assert(d.y > box.top && d.y < box.bottom, `row at ${d.y} outside the tap box ${box.top}..${box.bottom}`);
  assert(L.fit < 1, "a column stretched to 50 is wider than the photo, so the whole block shrinks to fit, like the original");
});
// ---------- v1.5.3: the original's fit (SafeQuote fitInsideSafeZone): shrink to fit, clamp the center, then stretch ----------
const inset = (w) => (2 * w) / PREVIEW_WIDTH; // the original's 2 px, at the preview width
check("a stretched block is fitted inside the photo less 2 px, and never slides off", () => {
  const b = hit(stretchItem({ quote: "golden hour", horizontalPosition: 92, widthScale: 50 }));
  assert(b.left >= inset(1000) - 1e-6 && b.right <= 1000 - inset(1000) + 1e-6, `spills: ${b.left}..${b.right}`);
});
check("the 84% column's center stops half a column plus 2 px from either side, at 30 and 30 too", () => {
  const W = 1000, L = coverLayout({ ...base, quote: "a b c", horizontalPosition: 10 }, W, 1250, atPx);
  assert(Math.abs(L.anchorX - (inset(W) + W * 0.42)) < 1e-9 && Math.abs(L.boxLeft - inset(W)) < 1e-9, `center ${L.anchorX}, box ${L.boxLeft}`);
  const R = coverLayout({ ...base, quote: "a b c", horizontalPosition: 95 }, W, 1250, atPx);
  assert(Math.abs(R.anchorX - (W - inset(W) - W * 0.42)) < 1e-9, `center ${R.anchorX}`);
  const M = coverLayout({ ...base, quote: "a b c", horizontalPosition: 55 }, W, 1250, atPx);
  assert(Math.abs(M.anchorX - W * 0.55) < 1e-9, "a center inside the range stays where she put it");
});
check("a block near the top or bottom pulls in to sit 2 px inside the photo, at 30 and 30 too", () => {
  const W = 1000, H = 1250;
  const B = hit(stretchItem({ quote: "golden hour again and again", verticalPosition: 99 }), W, H);
  assert(Math.abs(B.bottom - (H - inset(W))) < 1e-6, `bottom ${B.bottom}`);
  const T = hit(stretchItem({ quote: "golden hour again and again", verticalPosition: 1, heightScale: 50 }), W, H);
  assert(Math.abs(T.top - inset(W)) < 1e-6, `top ${T.top}`);
});
check("a block taller than the photo shrinks until it fits, at 30 and 30 too", () => {
  const W = 1000, H = 1250, quote = "one two three four five six seven eight nine ten eleven twelve";
  const L = coverLayout({ ...base, quote, lineCount: 12, fontSize: 200, textHeight: 200 }, W, H, atPx);
  const b = hit(stretchItem({ quote, lineCount: 12, fontSize: 200, textHeight: 200 }), W, H);
  assert(L.fit < 1 && b.bottom - b.top <= H - 2 * inset(W) + 1e-6, `fit ${L.fit}, height ${b.bottom - b.top}`);
  assert(b.top >= inset(W) - 1e-6 && b.bottom <= H - inset(W) + 1e-6, `rows leave the photo: ${b.top}..${b.bottom}`);
});
check("Lines on Auto reports the rows it draws, never more than the words, none for an empty quote", () => {
  const box = { ...base, quote: "the light knows my name and it waits for me" };
  assert(autoLineCount(box, atPx) === coverLayout({ ...box, lineCount: 0 }, PREVIEW_WIDTH, PREVIEW_WIDTH * 1.25, atPx).rows.length, "estimate differs from the drawn rows");
  assert(autoLineCount({ ...base, quote: "hi" }, atPx) === 1 && autoLineCount({ ...base, quote: "  " }, atPx) === 0, "edge cases");
});
check("Lines has no cap at 4: six lines make six rows when there are six words", () => {
  const L = coverLayout({ ...base, quote: "one two three four five six seven", lineCount: 6 }, 1000, 1250, atPx);
  assert(L.rows.length === 6, `rows ${L.rows.length}`);
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
check("peek shows the step undo or redo would take next, without taking it (1.13.5)", () => {
  const h = createHistory(5);
  assert(h.peek("undo") === null && h.peek("redo") === null, "an empty history has nothing to show");
  h.push({ label: "a" }); h.push({ label: "b" });
  assert(h.peek("undo")?.label === "b" && h.peek("redo") === null, "the next undo is the last change");
  assert(h.peek("undo")?.label === "b" && h.canUndo(), "peeking doesn't take it");
  h.undo();
  assert(h.peek("undo")?.label === "a" && h.peek("redo")?.label === "b", "after an undo, both sides show");
  h.redo();
  assert(h.peek("redo") === null && h.peek("undo")?.label === "b", "after a redo, nothing to redo");
});
check("holding the cover or the magnifier selects nothing and opens no menu, and no rule takes selection from the whole page (1.13.6)", () => {
  // Arjang #559 item 4, Quill #676: a long press on the cover must not select it blue or open the iPhone's callout menu.
  // The rule stays on the cover and the magnifier, so the editor's fields keep normal selection.
  const css = readFileSync(new URL("../client/src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    sels: sel.split(",").map((x) => x.trim().replace(/\s+/g, " ")),
    decls: Object.fromEntries(body.split(";").map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]).filter(([k]) => k)),
  }));
  const still = (sel) => rules.some((r) => r.sels.includes(sel) && r.decls["user-select"] === "none"
    && r.decls["-webkit-user-select"] === "none" && r.decls["-webkit-touch-callout"] === "none");
  for (const sel of [".stage", ".stage *", ".zoomView", ".zoomView *"]) assert(still(sel), `${sel} should select nothing and open no menu when held`);
  const whole = /^(\*|html|body|:root|\.app|input|textarea|select|\[contenteditable[^\]]*\])$/;
  const wide = rules.filter((r) => r.decls["user-select"] === "none" || r.decls["-webkit-user-select"] === "none").flatMap((r) => r.sels).filter((x) => whole.test(x));
  assert(!wide.length, `no selection rule over the whole page or its fields: ${wide.join(", ")}`);
});
check("a dragged block catches on a safe edge only when its edge crosses it, holds until 8px past, and a drag starting within 1.5px starts caught (1.13.8)", () => {
  // One axis: the safe edges at 50 and 450, a block 80 wide (half 40). Client px, as in the original.
  assert(LOCK_BREAK === 8 && LOCK_START === 1.5, "the original's distances");
  let st = startAxis(200, 40, 50, 450);
  assert(st.lock === null, "a block in the middle starts free");
  let r = lockAxis(st, 92, 40, 50, 450);
  assert(r.center === 92 && r.state.lock === null, "near a guide pulls nothing: its edge is 2px inside and stays where she puts it");
  r = lockAxis(r.state, 87, 40, 50, 450);
  assert(r.center === 90 && r.state.lock === "lo", `crossing catches: the block's edge sits on the guide (${r.center}, ${r.state.lock})`);
  r = lockAxis(r.state, 83, 40, 50, 450);
  assert(r.center === 90 && r.state.lock === "lo", "held while 7px past");
  r = lockAxis(r.state, 81, 40, 50, 450);
  assert(r.center === 81 && r.state.lock === null, "9px past lets go");
  r = lockAxis(r.state, 85, 40, 50, 450);
  assert(r.center === 85 && r.state.lock === null, "after letting go, being near pulls nothing back");
  r = lockAxis(r.state, 95, 40, 50, 450);
  assert(r.center === 90 && r.state.lock === "lo", "crossing back in catches again");
  r = lockAxis(r.state, 120, 40, 50, 450);
  assert(r.center === 120 && r.state.lock === null, "pulling well inside lets go");
  r = lockAxis({ lock: null, prevLo: 70, prevHi: 330 }, 60, 40, 50, 450);
  assert(r.center === 60 && r.state.lock === null, "a jump past the guide by more than 8px in one move doesn't catch");
  let h = lockAxis(startAxis(405, 40, 50, 450), 412, 40, 50, 450);
  assert(h.center === 410 && h.state.lock === "hi", `the far edge catches the same way (${h.center})`);
  st = startAxis(91, 40, 50, 450);
  assert(st.lock === "lo", "a drag that starts with an edge 1px from a guide starts caught");
  r = lockAxis(st, 95, 40, 50, 450);
  assert(r.center === 90 && r.state.lock === "lo", "and holds it there");
  assert(startAxis(92, 40, 50, 450).lock === null, "2px away starts free");
});
check("on the deck a box she hasn't dragged stays inside the safe rectangle: the column clamped by its half extents, scaled down, never up (1.13.8)", () => {
  const W = PREVIEW_WIDTH, H = W * 1.25, z = safeZoneFor(W, H), e = 1e-6;
  const q = "a lot of people are surprised to find out I don't just make rugs";
  const box = { ...base, quote: q, horizontalPosition: 3, verticalPosition: 99 };
  const frame = coverLayout(box, W, H, atPx), held = coverLayout(box, W, H, atPx, { safe: true });
  assert(frame.bounds.bottom > z.bottom, "the frame alone lets the block past the safe rectangle");
  assert(held.bounds.left >= z.left - e && held.bounds.right <= z.right + e && held.bounds.bottom <= z.bottom + e, `held inside: ${JSON.stringify(held.bounds)}`);
  assert(Math.abs(held.anchorX - (z.left + held.halfW)) < e && Math.abs(held.anchorY - (z.bottom - held.halfH)) < e, "the center is clamped by the half extents, the edge right on the safe edge");
  assert(Math.abs(held.halfW - (W * 0.84) / 2) < e, "the half width is the column's");
  const big = coverLayout({ ...base, quote: q, fontSize: 110, lineCount: 8, textHeight: 200 }, W, H, atPx, { safe: true });
  assert(big.fit < 1 && big.bounds.top >= z.top - e && big.bounds.bottom <= z.bottom + e, `too tall scales down: fit ${big.fit}`);
  const mid = coverLayout(base, W, H, atPx, { safe: true }), plain = coverLayout(base, W, H, atPx);
  assert(JSON.stringify(mid.bounds) === JSON.stringify(plain.bounds) && mid.fit === 1 && plain.fit === 1, "a block already inside doesn't move or grow");
});
check("hit boxes follow the same hold, a box she dragged this session goes to the frame, and the story view never holds (1.13.8)", () => {
  const W = 1000, H = 1250, z = safeZoneFor(W, H);
  const item = { ...base, quote: "golden hour again", horizontalPosition: 50, verticalPosition: 99,
    extraTexts: [{ ...base, quote: "second box", horizontalPosition: 50, verticalPosition: 1 }] };
  const [mainHeld, extraHeld] = textHitBoxes(item, W, H, fakeCtx(), true, { safe: true });
  assert(mainHeld.index === -1 && mainHeld.bottom <= z.bottom + 1e-6 && extraHeld.index === 0 && extraHeld.top >= z.top - 1e-6, "both held inside");
  const [mainFree, extraStill] = textHitBoxes(item, W, H, fakeCtx(), true, { safe: true, free: new Set([-1]) });
  assert(mainFree.bottom > z.bottom + 1 && extraStill.top >= z.top - 1e-6, "only the dragged box is let go");
  const [plain] = textHitBoxes(item, W, H, fakeCtx(), true);
  assert(plain.bottom > z.bottom, "without the deck's hold (the story view) the frame is the only edge");
});
check("the placement pass leaves a ready box alone, and otherwise moves only center, align, size and lines into the safe rectangle (1.13.8)", () => {
  const W = PREVIEW_WIDTH, aspect = 0.8, H = W / aspect, z = safeZoneFor(W, H), e = 1e-6;
  const q = "a lot of people are surprised to find out I don't just make rugs";
  const box = { ...base, quote: q, textColor: "#FB0909", textFont: "serif", opacity: 70 };
  assert(normalizePlacement(box, aspect, atPx, { needsChange: false }) === null, "ready: nothing changes");
  assert(normalizePlacement(box, aspect, atPx, null) === null, "no answer on a ready box: nothing changes");
  const low = { ...box, verticalPosition: 99 };
  const fixed = normalizePlacement(low, aspect, atPx, { needsChange: false });
  assert(fixed && Object.keys(fixed).sort().join() === "fontSize,horizontalPosition,lineCount,textAlign,verticalPosition", `outside the safe rectangle isn't ready: ${JSON.stringify(fixed)}`);
  const L = coverLayout({ ...low, ...fixed }, W, H, atPx);
  assert(L.bounds.bottom <= z.bottom + 0.6 && L.fit === 1, `saved inside the safe rectangle: ${JSON.stringify(L.bounds)}`);
  const moved = normalizePlacement(box, aspect, atPx, { needsChange: true, horizontalPosition: 30, verticalPosition: 20, textAlign: "left", fontSize: 40, lineCount: 4 });
  assert(moved.textAlign === "left" && moved.lineCount === 4 && moved.fontSize === 40 && moved.verticalPosition === 20, JSON.stringify(moved));
  assert(Math.abs(moved.horizontalPosition - 47) < 0.11, `the column's center is held by its half width: ${moved.horizontalPosition}`);
  const wild = normalizePlacement(box, aspect, atPx, { needsChange: true, lineCount: 30, fontSize: 500, textAlign: "diagonal" });
  assert(wild.lineCount === 8 && wild.fontSize <= 110 && wild.textAlign === "center", `held to 1 to 8 lines, size 110, a known alignment: ${JSON.stringify(wild)}`);
  const few = normalizePlacement({ ...box, quote: "slow down" }, aspect, atPx, { needsChange: true, lineCount: 5 });
  assert(few.lineCount === 2, `never more lines than words: ${few.lineCount}`);
  const one = normalizePlacement(box, aspect, atPx, { needsChange: true, lineCount: 1 });
  assert(one.lineCount === 1, "an explicit 1 wins exactly");
  const est = normalizePlacement(box, aspect, atPx, { needsChange: true });
  assert(est.lineCount === 3 && est.fontSize === 58, `with no count the estimate is written, and the size stays: ${JSON.stringify(est)}`);
  const tiny = normalizePlacement(box, aspect, atPx, { needsChange: true, fontSize: 2 });
  assert(tiny.fontSize === 8, "size never under 8");
  const tall = { ...box, textHeight: 200 };
  const huge = normalizePlacement(tall, aspect, atPx, { needsChange: true, fontSize: 110, lineCount: 8, verticalPosition: 50 });
  const HL = coverLayout({ ...tall, ...huge }, W, H, atPx, { safe: true });
  assert(huge.fontSize < 110 && HL.fit === 1, `a block taller than the safe rectangle is scaled down, never up: ${huge.fontSize} fit ${HL.fit}`);
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
// ---------- v1.6: the original's Spotify player ----------
check("a song's Spotify link becomes the original's embed, and nothing else gets a player", () => {
  const id = "4uLU6hMCjMI75M1A2tKUQC", want = `https://open.spotify.com/embed/track/${id}`;
  for (const link of [`https://open.spotify.com/track/${id}`, `https://open.spotify.com/track/${id}?si=abc123`, `https://open.spotify.com/intl-de/track/${id}`,
    `spotify:track:${id}`, ` https://open.spotify.com/track/${id} `]) assert(spotifyEmbedUrl(link) === want, `${link} -> ${spotifyEmbedUrl(link)}`);
  assert(spotifyEmbedUrl(`https://open.spotify.com/episode/${id}`) === `https://open.spotify.com/embed/episode/${id}`, "episodes play too");
  for (const bad of ["", null, undefined, "Artist - Title", `https://evil.example/track/${id}`, `https://open.spotify.com/album/${id}`,
    `https://open.spotify.com/track/${id}"onload="x`, "https://open.spotify.com/track/short", `javascript:alert(1)//open.spotify.com/track/${id}`])
    assert(spotifyEmbedUrl(bad) === null, `${bad} should get no player`);
});
// ---------- v1.7: the magnifier, on the original's zoom state (scale 1 to 4, a zoom center in %) ----------
check("a pinch zooms between 1 and 4, centered where it started", () => {
  const z = zoomTo(ZOOM_REST, 5, { x: 30, y: 140 });
  assert(z.scale === 4 && z.x === 30 && z.y === 100, JSON.stringify(z));
  const more = zoomTo({ scale: 2, x: 30, y: 60 }, 3, { x: 80, y: 80 });
  assert(more.scale === 3 && more.x === 30 && more.y === 60, `an already zoomed photo keeps its center: ${JSON.stringify(more)}`);
  assert(zoomTo(ZOOM_REST, 0.5, { x: 10, y: 10 }).scale === 1, "never below 1");
});
check("letting go under 1.08 snaps back to 1 and the middle, like the original", () => {
  assert(JSON.stringify(zoomSettle(zoomTo(ZOOM_REST, 1.05, { x: 20, y: 20 }))) === JSON.stringify(ZOOM_REST), "tiny pinch");
  assert(JSON.stringify(zoomSettle(zoomTo({ scale: 2, x: 40, y: 40 }, 0.9, null))) === JSON.stringify(ZOOM_REST), "pinched back past 1");
  const kept = zoomSettle(zoomTo(ZOOM_REST, 1.5, { x: 20, y: 70 }));
  assert(kept.scale === 1.5 && kept.x === 20 && kept.y === 70 && !("raw" in kept), JSON.stringify(kept));
});
check("dragging a zoomed photo slides it under the finger and stops at its edges", () => {
  const z = zoomPan({ scale: 2, x: 50, y: 50 }, 40, -20, 400, 500);
  assert(Math.abs(z.x - 40) < 1e-9 && Math.abs(z.y - 54) < 1e-9, JSON.stringify(z));
  assert(zoomPan({ scale: 3, x: 5, y: 95 }, 400, -400, 400, 500).x === 0 && zoomPan({ scale: 3, x: 5, y: 95 }, 400, -400, 400, 500).y === 100, "stops at the edges");
  assert(JSON.stringify(zoomPan(ZOOM_REST, 50, 50, 400, 500)) === JSON.stringify(ZOOM_REST), "an unzoomed photo doesn't pan");
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
// ---------- v1.8: Randomize like the original's createRandomizedEditorialDraft, kept inside the safe zone ----------
const LAYOUT_KEYS = ["fontSize", "horizontalPosition", "lineCount", "textAlign", "verticalPosition"];
const seeded = (n) => { let seed = n; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); };
check("the original's six layouts, picked at even odds, with its ranges", () => {
  assert(RANDOM_LAYOUTS.length === 6, `layouts ${RANDOM_LAYOUTS.length}`);
  const words = "one two three four five six seven eight nine ten";
  const first = randomEditorialLayout(() => 0, words), last = randomEditorialLayout(() => 0.999999, words);
  assert(JSON.stringify(first) === JSON.stringify({ textAlign: "center", fontSize: 38, lineCount: 2, horizontalPosition: 46, verticalPosition: 32 }), JSON.stringify(first));
  assert(JSON.stringify(last) === JSON.stringify({ textAlign: "center", fontSize: 56, lineCount: 1, horizontalPosition: 54, verticalPosition: 62 }), `monoline ${JSON.stringify(last)}`);
  const justified = randomEditorialLayout(() => 0, words, RANDOM_LAYOUTS[3]);
  assert(justified.textAlign === "justify" && justified.horizontalPosition === 49, JSON.stringify(justified));
});
check("Lines from Randomize never asks for more rows than the words allow", () => {
  assert(randomEditorialLayout(() => 0.5, "only two", RANDOM_LAYOUTS[1]).lineCount === 2, "a left pillar of two words gets two rows");
  assert(randomEditorialLayout(() => 0.99, "three short words", RANDOM_LAYOUTS[3]).lineCount === 1, "justify needs two words a row");
  assert(randomEditorialLayout(() => 0.5, "", RANDOM_LAYOUTS[0]).lineCount === 0, "no words, Auto");
});
check("the safe zone is the original's for each shape of cover", () => {
  const near = (z, e) => ["left", "top", "right", "bottom"].every((k) => Math.abs(z[k] - e[k]) < 1e-6);
  assert(near(safeZoneFor(1080, 1350), { left: 54, top: 81, right: 1026, bottom: 1269 }), JSON.stringify(safeZoneFor(1080, 1350)));
  assert(near(safeZoneFor(1080, 1440), { left: 64.8, top: 86.4, right: 1015.2, bottom: 1353.6 }), "3:4 keeps 6% all round");
  assert(near(safeZoneFor(1000, 1000), { left: 60, top: 60, right: 940, bottom: 940 }), "square keeps 6% all round");
  assert(near(safeZoneFor(1080, 1920), { left: 54, top: 300, right: 1026, bottom: 1500 }), JSON.stringify(safeZoneFor(1080, 1920)));
});
check("a landscape cover's safe zone is the whole photo, and every other shape keeps its inset (1.24.0, Arjang #1087)", () => {
  // Quill #1090: landscape only, no inset, so the text keeps to the photo itself. 9:16, 3:4, 4:5 and square are unchanged.
  const near = (z, e) => ["left", "top", "right", "bottom"].every((k) => Math.abs(z[k] - e[k]) < 1e-6);
  const show = (w, h) => JSON.stringify(safeZoneFor(w, h));
  for (const [w, h] of [[1440, 1080], [1620, 1080], [1920, 1080], [1100, 1000], [4000, 1000]]) {
    assert(near(safeZoneFor(w, h), { left: 0, top: 0, right: w, bottom: h }), `${w}x${h} ${show(w, h)}`);
  }
  assert(near(safeZoneFor(1080, 1350), { left: 54, top: 81, right: 1026, bottom: 1269 }), `4:5 keeps its inset ${show(1080, 1350)}`);
  assert(near(safeZoneFor(1000, 1000), { left: 60, top: 60, right: 940, bottom: 940 }), "square keeps 6% all round");
});
check("snap guides: a dragged box's center catches the center line within 6px and lets go past it (1.24.0, Arjang #1083)", () => {
  const g = guidesFor(600, 600), out = {};
  assert(g.x[0].at === 300 && g.x[1].at === 200 && g.x[2].at === 400 && g.y[0].center && !g.y[1].center, JSON.stringify(g));
  const r = snap({ x: 304, y: 100 }, { halfW: 50, halfH: 20 }, g, SNAP_PX, out);
  assert(r === out && r.x === 300 && r.xGuide.id === "xc" && r.y === 100 && r.yGuide === null, `caught: ${JSON.stringify(r)}`);
  const free = snap({ x: 307, y: 100 }, { halfW: 50, halfH: 20 }, g, SNAP_PX, {});
  assert(free.x === 307 && free.xGuide === null, `7px away is free, so it never feels stuck: ${JSON.stringify(free)}`);
});
check("snap guides: edges catch thirds, center lines win over thirds, and X and Y snap on their own", () => {
  const g = guidesFor(600, 600);
  const edge = snap({ x: 233, y: 100 }, { halfW: 30, halfH: 20 }, g, SNAP_PX, {});
  assert(edge.x === 230 && edge.xGuide.id === "x1", `the left edge sits on the first third: ${JSON.stringify(edge)}`);
  const both = snap({ x: 254, y: 100 }, { halfW: 51, halfH: 20 }, g, SNAP_PX, {});
  assert(both.x === 249 && both.xGuide.id === "xc", `a third 3px off loses to the center 5px off: ${JSON.stringify(both)}`);
  const xy = snap({ x: 304, y: 203 }, { halfW: 50, halfH: 20 }, g, SNAP_PX, {});
  assert(xy.x === 300 && xy.xGuide.id === "xc" && xy.y === 200 && xy.yGuide.id === "y1", `each axis on its own: ${JSON.stringify(xy)}`);
});
check("Why it matches is the 4th check: no reason or a few words is incomplete, and a pass needs all four (1.25.0, Arjang #1100)", () => {
  assert(whyProblem(null) && whyProblem({ text: "  " }) && whyProblem({ text: "It matches the vibe perfectly." }), "empty, or a few words, is incomplete");
  assert(whyProblem({ text: "Her open hands in the window light carry the quote's letting go, and the song's slow build lands it." }) === null, "a real reason passes");
  assert(composePasses({ QUOTE_IN_STOCK: true, SONG_IN_POOL: true, STEPS_VERIFIED: true, WHY_WRITTEN: true }), "all four pass");
  assert(!composePasses({ STEPS_VERIFIED: true, WHY_WRITTEN: false }) && !composePasses({ STEPS_VERIFIED: true }) && !composePasses(null), "missing one is incomplete");
});
check("search finds a cover by a word in its photo's description and the rest, word forms included, or by its number (1.33.0, Arjang Nov 26)", () => {
  const items = [
    { id: 3, status: "queue", title: "b7img003", description: "A woman under purple wisteria at sunset", quote: "q", song: "" },
    { id: 46, status: "approved", title: "b7img046", description: "She is biking down a quiet street", quote: "", song: "" },
    { id: 277, status: "rejected", title: "b7img277", description: "Laundry drying on a line", why: { text: "The bike leans on the wall", tags: ["sunsets"] } },
    { id: 12, status: "queue", title: "photo", description: "A kitchen", caption: "Morning coffee" },
  ];
  const ids = (q) => searchCovers(items, q).map((i) => i.id).join(",");
  assert(ids("wisteria") === "3", `a word in the description: ${ids("wisteria")}`);
  assert(ids("bike") === "46,277" || ids("bike") === "277,46", `bike finds biking and bike: ${ids("bike")}`);
  assert(ids("biking") === "46,277" || ids("biking") === "277,46", `biking finds bike too: ${ids("biking")}`);
  assert(ids("sunset").split(",").sort().join(",") === "277,3", `sunset finds sunsets: ${ids("sunset")}`);
  assert(ids("LAUNDRY") === "277" && ids("morning coffee") === "12" && ids("purple sunset") === "3", "any case, and every word must match");
  assert(ids("003") === "3" && ids("46") === "46" && ids("277") === "277", `a number finds that cover, zeros or not: ${ids("003")}`);
  assert(ids("") === "" && ids("   ") === "" && ids("zebra") === "", "nothing to search, nothing found");
});
check("the Drive row links to that exact file in a new tab, and a photo with no Drive id has no link (1.24.0, Arjang #1106)", () => {
  assert(driveLinkFor({ source: "drive", driveId: "1AbC_d-9" }) === "https://drive.google.com/file/d/1AbC_d-9/view", driveLinkFor({ source: "drive", driveId: "1AbC_d-9" }));
  assert(driveLinkFor({ source: "drive" }) === null && driveLinkFor({ source: "upload", driveId: "x" }) === null, "no id, no link");
});
check("Randomize never touches color, font or weight, and every layout lands inside the safe zone", () => {
  const rand = seeded(11);
  const quotes = ["golden hour again", "what a privilege it is to have another day to try again", "a lot of people are surprised to find out what I really do for work every day"];
  for (let i = 0; i < 240; i++) {
    const box = { ...base, quote: quotes[i % 3], textColor: "#FB0909", textFont: "serif", fontWeight: 700, widthScale: [30, 42, 18][i % 3] };
    const aspect = [4 / 5, 3 / 4, 1][i % 3];
    const p = randomizeLayout(box, aspect, atPx, rand);
    assert(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(LAYOUT_KEYS), `Randomize changed more than the layout: ${Object.keys(p)}`);
    assert(insideSafeZone({ ...box, ...p }, PREVIEW_WIDTH, PREVIEW_WIDTH / aspect, atPx), `outside the safe zone: ${JSON.stringify(p)} ${aspect}`);
  }
});
check("when nothing fits, Randomize keeps the centered hero and only shrinks the size", () => {
  const box = { ...base, quote: "one two three four five six seven eight nine ten eleven twelve thirteen", textHeight: 200, heightScale: 50 };
  const p = randomizeLayout(box, 4 / 5, atPx, seeded(3), { tries: 0 });
  assert(p.textAlign === "center" && p.horizontalPosition >= 46 && p.horizontalPosition <= 54 && p.verticalPosition >= 32 && p.verticalPosition <= 70, JSON.stringify(p));
  assert(p.fontSize <= 82 && insideSafeZone({ ...box, ...p }, PREVIEW_WIDTH, PREVIEW_WIDTH * 1.25, atPx), JSON.stringify(p));
});
check("the default text font reads TikTok Sans", () => {
  assert(FONT_LABELS.tiktok === "TikTok Sans", FONT_LABELS.tiktok);
});
check("the two 50% presets set the color and the opacity together, apart from the 11 colors", () => {
  // Arjang #263, Quill #269: compound presets beside the palette, not new palette colors.
  assert(HALF_PRESETS.length === 2, JSON.stringify(HALF_PRESETS));
  const [black, white] = HALF_PRESETS;
  assert(black.name === "Black 50%" && JSON.stringify(black.patch) === JSON.stringify({ textColor: "#000000", opacity: 50 }), JSON.stringify(black));
  assert(white.name === "White 50%" && JSON.stringify(white.patch) === JSON.stringify({ textColor: "#FFFFFF", opacity: 50 }), JSON.stringify(white));
  assert(presetOn({ ...base, textColor: "#000000", opacity: 50 }, black) && !presetOn({ ...base, textColor: "#000000", opacity: 100 }, black), "on only at both values");
  assert(!presetOn({ ...base, textColor: "#FFFFFF", opacity: 50 }, black) && presetOn({ ...base, textColor: "#ffffff", opacity: 50 }, white), "matches the color, any case");
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

// ---------- 1.12: the Songs screen's data side ----------
const SONG = { id: "sym-a--song-one", artist: "Sym Artist A", title: "Song One", genre: "Pop", popularity: 50, addedAt: "2026-11-18T10:00:00Z",
  depth: { score: 6, max: 8 }, hook: { start: 44.4, end: 59.4, label: "0:44 to 0:59", parts: [{ start: 44.4, end: 59.4 }, { start: 90, end: 105 }, { start: 130, end: 145 }] },
  clips: [true, true, false], previewStart: { apple: 30, deezer: 41.5, spotify: 70 }, previewUrl: { apple: "https://audio-ssl.itunes.apple.com/a.m4a", spotify: null },
  links: { spotify: "https://open.spotify.com/track/abc" } };
check("songs: a song's parts are its popular parts with the hook first, or the hook alone, or none", () => {
  assert(partsOf(SONG).length === 3 && partsOf(SONG)[0].start === 44.4, JSON.stringify(partsOf(SONG)));
  assert(JSON.stringify(partsOf({ hook: { start: 12, end: 27 } })) === JSON.stringify([{ start: 12, end: 27 }]), "the hook alone");
  assert(partsOf({ hook: null }).length === 0 && partsOf(null).length === 0, "no hook, no parts");
});
check("songs: a moment plays from its part's clip, then an app preview that covers it, else nothing", () => {
  const hook = sourceFor(SONG, 44.4, 59.4);
  assert(hook.url === "/api/symphony/clips/sym-a--song-one" && hook.at === 0 && hook.songStart === 44.4, JSON.stringify(hook));
  const two = sourceFor(SONG, 95, 105);
  assert(two.url === "/api/symphony/clips/sym-a--song-one?part=1" && two.at === 5 && two.songStart === 90, JSON.stringify(two));
  const apple = sourceFor(SONG, 30, 59);
  assert(apple.url === SONG.previewUrl.apple && apple.at === 0 && apple.songStart === 30, `Apple's preview from its start: ${JSON.stringify(apple)}`);
  assert(sourceFor(SONG, 130, 145) === null, "a part with no clip and no preview plays nothing");
  assert(sourceFor(SONG, 70, 99) === null, "Spotify's start with no preview link plays nothing");
  assert(sourceFor({ ...SONG, previewUrl: {} }, 50, 70) === null, "a range that runs past its part isn't that part's clip");
  assert(clipAddress("sym-b--two") === "/api/symphony/clips/sym-b--two" && clipAddress("sym-b--two", 2) === "/api/symphony/clips/sym-b--two?part=2", "clip addresses");
});
check("quotes show by default, a post's own tap decides for that post, and global hide hides every quote (1.13.9)", () => {
  // Arjang via Rose #693 and #694, Quill #695 and #696. Global hide is the 1.13.3 setting set to false; true no longer
  // forces every quote on, so a post turned off stays off whatever it says.
  const unmarkedOff = { showQuote: false }, unmarkedOn = { showQuote: true }, markedOff = { showQuote: false, showQuoteSet: true }, markedOn = { showQuote: true, showQuoteSet: true };
  for (const [overlay, cover, want] of [
    [null, unmarkedOff, true], [null, unmarkedOn, true], [null, markedOff, false], [null, markedOn, true],
    [false, unmarkedOff, false], [false, unmarkedOn, false], [false, markedOn, false],
    [true, markedOff, false], [true, unmarkedOff, true], [undefined, markedOff, false], ["false", unmarkedOff, true],
  ]) assert(quoteShown(cover, overlay) === want, `${JSON.stringify(overlay)} on ${JSON.stringify(cover)}: ${want}`);
  assert(ownQuote(unmarkedOff) === true && ownQuote(markedOff) === false && ownQuote(markedOn) === true && ownQuote(null) === true, "a post's own choice: on unless she turned it off");
  assert(globalHide(false) === true && [null, undefined, true, "false", 0].every((v) => globalHide(v) === false), "only false hides");
  assert(overlayOf(true) === true && overlayOf(false) === false && overlayOf(null) === null && overlayOf("false") === null && overlayOf(0) === null, "only true and false count as set");
});
check("songs: a clip knows its song and part, and a cover's Symphony song is read from its songFile (1.13.2)", () => {
  assert(JSON.stringify(sourceFor(SONG, 44.4, 59.4).clip) === JSON.stringify({ id: "sym-a--song-one", part: 0 }), "the hook's clip");
  assert(JSON.stringify(sourceFor(SONG, 95, 105).clip) === JSON.stringify({ id: "sym-a--song-one", part: 1 }), "part 2's clip");
  assert(!("clip" in sourceFor(SONG, 30, 59)), "an app preview isn't a Symphony clip");
  assert(symphonyIdOf("symphony:sym-a--song-one") === "sym-a--song-one", "a Symphony songFile");
  for (const f of ["hooks/x.m4a", "symphony:", "symphony:Bad Id!", "symphony:../x", "xsymphony:sym-a", null, undefined, ""]) assert(symphonyIdOf(f) === null, `not a Symphony song: ${f}`);
});
await checkAsync("songs: a clip's address is kept for the visit, and one that expires is asked for again before it does (1.13.2)", async () => {
  const realFetch = globalThis.fetch, realNow = Date.now;
  let now = 1_800_000_000_000;
  const asked = [];
  const n = (id) => asked.filter((a) => a.id === id).length;
  const answers = {
    keeps: () => ({ found: true, url: "/api/symphony/clips/keeps" }),
    soon: () => ({ found: true, url: `https://cdn.example/soon?v=${n("soon")}`, expiresAt: now + 60_000 }),
    later: () => ({ found: true, url: `https://cdn.example/later?v=${n("later")}`, expiresAt: now + 60 * 60_000 }),
    isoSoon: () => ({ found: true, url: `https://cdn.example/iso-soon?v=${n("isoSoon")}`, expiresAt: new Date(now + 60_000).toISOString() }),
    isoLater: () => ({ found: true, url: `https://cdn.example/iso-later?v=${n("isoLater")}`, expiresAt: new Date(now + 60 * 60_000).toISOString() }),
    junk: () => ({ found: true, url: "https://cdn.example/junk", expiresAt: "soon" }),
  };
  globalThis.fetch = async (path) => {
    const q = new URL(path, "http://test").searchParams;
    asked.push({ id: q.get("id"), part: q.get("part") });
    const answer = answers[q.get("id")];
    return answer ? { ok: true, status: 200, json: async () => answer() }
      : { ok: false, status: 404, statusText: "Not Found", json: async () => ({ found: false, url: "", error: "clip not found" }) };
  };
  Date.now = () => now;
  try {
    const [a, b] = await Promise.all([clipSource("keeps"), clipSource("keeps")]);
    assert(a === "/api/symphony/clips/keeps" && b === a && n("keeps") === 1, `two taps share one question: ${a} ${b} ${n("keeps")}`);
    now += 5 * 3600_000;
    assert(clipNow("keeps") === a && (await clipSource("keeps")) === a && n("keeps") === 1, "an address with no expiresAt is kept for the visit");
    assert((await clipSource("keeps", 1)) === a && n("keeps") === 2 && asked.at(-1).part === "1" && asked[0].part === "0", "each part is asked for on its own");

    assert((await clipSource("soon")) === "https://cdn.example/soon?v=1", "the first address");
    assert(clipNow("soon") === null, "an address within two minutes of expiring isn't used");
    assert((await clipSource("soon")) === "https://cdn.example/soon?v=2" && n("soon") === 2, "so it's asked for again");

    assert((await clipSource("later")) === "https://cdn.example/later?v=1", "the first address");
    now += 57 * 60_000;
    assert(clipNow("later") === "https://cdn.example/later?v=1" && n("later") === 1, "kept while it has more than two minutes left");
    now += 2 * 60_000;
    assert(clipNow("later") === null, "not used once it's about to expire");
    assert((await clipSource("later")) === "https://cdn.example/later?v=2" && n("later") === 2, "an expiring address is asked for again");
    assert(clipNow("later") === "https://cdn.example/later?v=2", "and the fresh one is kept");

    assert((await clipSource("isoSoon")) === "https://cdn.example/iso-soon?v=1" && clipNow("isoSoon") === null, "an ISO date 60 s out isn't used");
    assert((await clipSource("isoSoon")) === "https://cdn.example/iso-soon?v=2" && n("isoSoon") === 2, "so it's asked for again, like the number");
    assert((await clipSource("isoLater")) === "https://cdn.example/iso-later?v=1" && clipNow("isoLater") === "https://cdn.example/iso-later?v=1", "an ISO date an hour out is kept");
    now += 59 * 60_000;
    assert(clipNow("isoLater") === null && (await clipSource("isoLater")) === "https://cdn.example/iso-later?v=2", "and asked for again near its time");
    assert((await clipSource("junk")) === "https://cdn.example/junk" && clipNow("junk") === "https://cdn.example/junk" && n("junk") === 1, "an expiresAt that's neither counts as none: kept for the visit");

    assert((await clipSource("gone")) === null && clipNow("gone") === null, "a clip the server doesn't have plays nothing");
    assert((await clipSource("gone")) === null && n("gone") === 2, "and nothing is kept for it");
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
});
check("songs: the player names the hook, another part, or just the times", () => {
  assert(partLabel(SONG, 44.4, 59.4).label === "Hook 0:44 to 0:59", partLabel(SONG, 44.4, 59.4).label);
  const two = partLabel(SONG, 90, 105);
  assert(two.idx === 1 && two.label === "Part 2 · 1:30 to 1:45", JSON.stringify(two));
  assert(partLabel(SONG, 10, 25).label === "0:10 to 0:25" && partLabel(SONG, 10, 25).idx === 0, JSON.stringify(partLabel(SONG, 10, 25)));
});
check("songs: the Library sorts measured songs first, by data, popularity or newest added", () => {
  const list = [
    { id: "a", hook: null, popularity: 99, depth: null, addedAt: "2026-11-20" },
    { id: "b", hook: { start: 1, end: 2 }, popularity: 10, depth: { score: 7 }, addedAt: "2026-11-01" },
    { id: "c", hook: { start: 1, end: 2 }, popularity: 80, depth: { score: 3 }, addedAt: "2026-11-10" },
  ];
  assert(librarySorted(list, "data").map((s) => s.id).join() === "b,c,a", librarySorted(list, "data").map((s) => s.id).join());
  assert(librarySorted(list, "popular").map((s) => s.id).join() === "c,b,a", librarySorted(list, "popular").map((s) => s.id).join());
  assert(librarySorted(list, "recent").map((s) => s.id).join() === "a,c,b", librarySorted(list, "recent").map((s) => s.id).join());
  assert(list.map((s) => s.id).join() === "a,b,c", "sorting leaves the list as it was");
});
check("songs: genre chips count measured songs only, and search matches artist or title in any case", () => {
  const list = [{ genre: "Pop", hook: {} }, { genre: "Pop", hook: {} }, { genre: "Rap", hook: {} }, { genre: "Rock", hook: null }, { genre: null, hook: {} }];
  assert(topGenres(list).join() === "Pop,Rap" && topGenres(list, 1).join() === "Pop", topGenres(list).join());
  const songs = [{ artist: "Sabrina Carpenter", title: "Espresso" }, { artist: "Hoobastank", title: "The Reason" }];
  assert(searchSongs(songs, "  espRESSO ").length === 1 && searchSongs(songs, "hoobastank the").length === 1, "matches");
  assert(searchSongs(songs, "").length === 0 && searchSongs(songs, "zzz").length === 0 && searchSongs(songs, "e", 1).length === 1, "empty, none, limit");
});
check("songs: New hot lists its songs in order with their badges, and skips ids it doesn't have", () => {
  const rows = hotList({ songs: [{ id: "x", title: "X" }, { id: "y", title: "Y" }], hot: { rows: [{ id: "y", badges: [{ text: "New on Shazam" }] }, { id: "gone" }, { id: "x" }] } });
  assert(rows.map((r) => r.id).join() === "y,x" && rows[0].badges[0].text === "New on Shazam" && rows[1].badges.length === 0, JSON.stringify(rows));
  assert(hotList(null).length === 0, "no data, no rows");
});
check("songs: a row's line says its hook, or why it has none", () => {
  assert(statusLine(SONG) === "Hook 0:44", statusLine(SONG));
  assert(statusLine({ hook: null, error: "x" }) === "Not found" && statusLine({ hook: null, analyzed: true }) === "No hook found" && statusLine({ hook: null }) === "Measuring soon", "the other lines");
});
check("songs: Use on this cover sends the song whole, clip and hook included, and knows a cover that has it", () => {
  assert(canUse(SONG) && !canUse({ ...SONG, clips: [false] }) && !canUse({ ...SONG, hook: null }), "a hook and its clip");
  const edit = coverSongEdit(SONG);
  assert(JSON.stringify(edit) === JSON.stringify({ song: "Sym Artist A - Song One", songFile: "symphony:sym-a--song-one", songHook: { start: 44.4, end: 59.4 },
    songPreviewUrl: "/api/symphony/clips/sym-a--song-one", songSpotifyUrl: "https://open.spotify.com/track/abc", songSource: "downloaded" }), JSON.stringify(edit));
  assert(coverSongEdit({ ...SONG, links: { spotify: "https://example.com/x" } }).songSpotifyUrl === "", "only a Spotify track link goes along");
  assert(onCover({ songFile: "symphony:sym-a--song-one" }, SONG) && !onCover({ songFile: "hooks/x.m4a" }, SONG) && !onCover(null, SONG), "on this cover");
});
check("songs: the replay graph draws across the song inside its box, and chart moves read in words", () => {
  const d = replayPath([0, 99, 200, -3]);
  assert(d.startsWith("M0,10 L0.5,10.00 L1.5,1.00 L2.5,1.00 L3.5,10.00") && d.endsWith("L4,10Z"), d);
  assert(replayPath(null) === null && replayPath([]) === null, "no graph");
  assert(moveText("NEW") === "New today" && moveText("+3") === "Up 3 since yesterday" && moveText("-2") === "Down 2 since yesterday" && moveText("=") === "Same as yesterday" && moveText(null) === "Same as yesterday", "moves");
});

// 1.20.0 (Big Edit items 1, 2, 4 and 8): the queue's look, her default color, her own fonts, and colors after a 50% preset.
check("v1.26 there's no queue look: each cover draws with its own font and color (Arjang #1092, Quill #1140)", () => {
  const item = { id: 1, status: "queue", textColor: "#FFFFFF", textFont: "tiktok", extraTexts: [] };
  assert(JSON.stringify(lookOf({ lock: { textFont: "serif", textColor: "#FB0909" }, brandColors: [{ hex: "#123456", default: true }] })) === JSON.stringify({ textFont: null, textColor: null }), "no lock, no default color over every cover");
  assert(withLook(item, lookOf(null)) === item, "the cover as it is");
});
check("v1.26 each cover's own color: the house palette against the photo, contrast first, mostly yellow, cream or white", () => {
  const dark = { r: 30, g: 30, b: 40 }, light = { r: 235, g: 235, b: 225 };
  const picks = Array.from({ length: 40 }, (_, i) => pickHouseColor(dark, coverSeed(i + 1)));
  assert(picks.every((hex) => HOUSE.includes(hex) && contrastOf(hex, dark) >= 3), `readable house colors on a dark photo: ${picks.join(" ")}`);
  const warm = picks.filter((hex) => ["#FBFA38", "#FAFFB4", "#FFFFFF"].includes(hex)).length;
  assert(warm >= 20 && warm <= 36, `about 70% yellow, cream or white: ${warm}/40`);
  assert(new Set(picks).size >= 3, "not one color for every cover");
  assert(pickHouseColor(dark, coverSeed(7)) === pickHouseColor(dark, coverSeed(7)), "a cover keeps its pick");
  assert(contrastOf(pickHouseColor(light, coverSeed(3)), light) >= 3, "a light photo gets a dark enough color");
  for (let i = 0; i < 20; i++) {
    const hex = randomWheelColor(i % 2 ? dark : light);
    assert(/^#[0-9A-F]{6}$/.test(hex) && contrastOf(hex, i % 2 ? dark : light) >= 3, `a random wheel color that reads: ${hex}`);
  }
  assert(new Set(Array.from({ length: 12 }, () => randomWheelColor(dark))).size > 6, "random is truly random, not the palette");
});
check("v1.20 her own fonts are drawn by their own family and listed by their own name", () => {
  registerFonts([{ id: "custom-test-round", label: "Test Round", faces: [{ weight: 400, url: "/api/fonts/test-round-400.otf" }, { weight: 700, url: "/api/fonts/test-round-700.otf" }] }]);
  assert(FONT_LABELS["custom-test-round"] === "Test Round", `label: ${FONT_LABELS["custom-test-round"]}`);
  assert(FONT_CSS["custom-test-round"].startsWith("\"uBee custom-test-round\""), `family: ${FONT_CSS["custom-test-round"]}`);
  assert(FONT_CSS.tiktok.includes("TikTok Sans") && FONT_LABELS.serif === "Serif", "the six stay as they are");
});
check("v1.20 a carousel photo draws only its own text; the cover draws the quote and the boxes on the cover (item 3)", () => {
  const item = { quote: "the quote", showQuote: true, extraTexts: [{ quote: "cover box" }, { quote: "photo two", slide: 0 }, { quote: "photo three", slide: 1 }, { quote: "  ", slide: 0 }] };
  assert(textBoxes(item, true).map((b) => b.quote).join("|") === "the quote|cover box", `the cover: ${textBoxes(item, true).map((b) => b.quote)}`);
  assert(textBoxes(item, true, 0).map((b) => b.quote).join("|") === "photo two", "photo two: its own box, never the quote, an empty box draws nothing");
  assert(textBoxes(item, true, 0)[0].extraIndex === 1, "a box keeps its place in her boxes, for tapping and editing");
  assert(textBoxes(item, true, 1).map((b) => b.quote).join("|") === "photo three" && textBoxes(item, true, 2).length === 0, "photo three, and a photo with none");
});
check("v1.20 a color picked after either 50% preset is at 100% again; a hand-set opacity stays (item 8)", () => {
  assert(JSON.stringify(colorPatch({ textColor: "#FFFFFF", opacity: 50 }, "#FB0909")) === JSON.stringify({ textColor: "#FB0909", opacity: 100 }), "after White 50%");
  assert(JSON.stringify(colorPatch({ textColor: "#000000", opacity: 50 }, "#FFFFFF")) === JSON.stringify({ textColor: "#FFFFFF", opacity: 100 }), "after Black 50%");
  assert(JSON.stringify(colorPatch({ textColor: "#FB0909", opacity: 70 }, "#FFFFFF")) === JSON.stringify({ textColor: "#FFFFFF" }), "a hand-set opacity stays");
  assert(JSON.stringify(colorPatch({ textColor: "#FB0909", opacity: 50 }, "#FFFFFF")) === JSON.stringify({ textColor: "#FFFFFF" }), "50% on another color isn't a preset");
});

check("v1.27 a landscape drag off center re-wraps the text narrower instead of stopping, and stays on the photo (Quill #1145)", () => {
  const W = 1600, H = 900, m = (px) => (t) => t.length * px * 0.5;
  const quote = "the sea keeps every secret you whisper to it at night";
  assert(rewrapWidth(W / 2, 0.42 * W, 84, 0, W) === null, "centered, the 84% column keeps its width");
  assert(rewrapWidth(0.25 * W, 0.42 * W, 84, 0, W) === 50 && rewrapWidth(0.05 * W, 0.42 * W, 84, 0, W) === LANDSCAPE_MIN_WIDTH, "narrower toward an edge, 38% at the least");
  assert(rewrapWidth(0.75 * W, 0.42 * W, 84, 0, W) === 50, "the same to the right");
  const wide = coverLayout({ quote, horizontalPosition: 25 }, W, H, m);
  assert(Math.abs(wide.anchorX / W - 0.5) < 0.1, `the 84% column can't go far off center: ${wide.anchorX / W}`);
  for (const [h, w] of [[25, 50], [75, 50], [20, 38], [80, 38]]) {
    const L = coverLayout({ quote, horizontalPosition: h, textWidth: w }, W, H, m);
    assert(Math.abs(L.anchorX / W - h / 100) < 0.02, `center reaches ${h}% at ${w}%: ${(100 * L.anchorX) / W}`);
    assert(L.bounds.left >= 0 && L.bounds.right <= W, `fully on the photo at ${h}%: ${L.bounds.left} to ${L.bounds.right}`);
  }
  const n = autoLines({ quote, textWidth: 84 }, W, H), narrow = autoLines({ quote, textWidth: 42 }, W, H);
  assert(n === estimatedLineCount(quote) && narrow === Math.min(quote.split(" ").length, Math.ceil(n * 2)), `re-wraps to more rows: ${n} to ${narrow}`);
  assert(autoLines({ quote, textWidth: 42 }, 900, 1600) === narrow && autoLines({ quote, textWidth: 42 }, 1000, 1000) === narrow,
    "portrait and square re-wrap the same way since 1.29.0 (Quill #1212)");
  assert(autoLines({ quote, textWidth: 84 }, 900, 1600) === n, "the 84% column on portrait is as before");
});
check("v1.29 a vertical drag reaches 25% and 75% by re-wrapping, the photo frame the only wall (Quill #1212)", () => {
  const m = (px) => (t) => t.length * px * 0.5;
  const quote = "the sea keeps every secret you whisper to it at night";
  for (const [W, H] of [[900, 1600], [1080, 1350], [1080, 1440]]) {
    for (const h of [25, 75]) {
      const w = rewrapWidth((h / 100) * W, 0.42 * W, 84, 0, W);
      assert(w != null && w >= LANDSCAPE_MIN_WIDTH && w <= 84, `narrower at ${h}% on ${W}x${H}: ${w}`);
      const L = coverLayout({ quote, horizontalPosition: h, textWidth: w }, W, H, m);
      assert(Math.abs(L.anchorX / W - h / 100) < 0.02, `center reaches ${h}% on ${W}x${H}: ${(100 * L.anchorX) / W}`);
      assert(L.bounds.left >= 0 && L.bounds.right <= W, `on the photo at ${h}% on ${W}x${H}`);
    }
  }
});
check("v1.29 each photo's ratio reads by the original's thresholds, landscape by the nearest standard (Quill #1212)", () => {
  const cases = [[1080, 1920, "9:16"], [1080, 1440, "3:4"], [1080, 1350, "4:5"], [1000, 1000, "1:1"], [1440, 1080, "4:3"], [1500, 1000, "3:2"], [1920, 1080, "16:9"], [2520, 1080, "21:9"], [0, 10, ""]];
  for (const [w, h, want] of cases) assert(aspectLabel(w, h) === want, `${w}x${h}: ${aspectLabel(w, h)} not ${want}`);
});

console.log(failed ? "RENDER TEST FAILED" : "RENDER TEST OK");
process.exitCode = failed ? 1 : 0;
