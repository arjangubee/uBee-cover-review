// The Chats simulator (1.14; Arjang #570 and #575, Quill #581 and #584, built from Rose's #580 scrub spec). The creator
// practices replies to her Instagram DMs and comments: an incoming message lands in the queue, her Muse drafts a reply
// in her voice, she edits it and gives a verdict, and her saved revision is the source of truth for retraining.
//
// One POST route per action under /api/dm/, with the same names, arguments and answers as a Muse space's dm_ actions,
// so a space bridges all of them with one rule (/api/dm/<name> to dm_<name>).
//
// This server has no model and sends nothing on its own:
// - Draft marks the item as waiting. Her Muse reads draftswanted (each with the exact system and prompt text a model
//   gets), writes the reply, and hands it back with savedraft. A space with a model drafts in generatedraft instead.
// - Send marks the approved text as publishing. Her Muse reads publishwanted, sends it through her own Instagram
//   connection, and reports back with confirmpublish. Nothing sends without her tap: no auto-send, no timer.
//
// Blind tests: for a "holdout" item her real reply is stored sealed. listitems never answers it before it's revealed,
// no draft prompt reads it, and revealactual refuses until her own revision is saved.
//
// Her data stays in this copy: the items live in data/db.json and her voice in data/settings.json. Nothing here ships
// with anyone's voice, offers, people or messages; her Muse fills them in (savevoicesource, createitem).
//
// 1.22.0 (room #1030): Chats follow the reply practice simulator (Arjang #20, its code in room file 83). Each chat
// carries the facts her Muse syncs from Instagram: where it sits there, who follows whom, Instagram's read mark, whether
// it needs a reply at all, when it last moved, and for a comment its post. It also keeps her own inbox split (General),
// her read mark here, the texts a send left behind, and edits to a line that already went out. Her Muse applies an
// edit the way it sends: it reads editswanted and reports back with confirmedit.
import { createHash, randomUUID } from "node:crypto";
import { currentSpace, runIn, store } from "./store.js";
import { arrivalsStatus, catchUpSoon } from "./arrivals.js";
import { STORY_PLACEHOLDER, capEndings, isNonMessageText, storyCapture, voiceVersion } from "./dmRules.js";

const KINDS = ["dm", "comment"];
const SOURCES = ["live", "holdout", "paste"];
const VERDICTS = ["approved", "edited", "needs_work"];
const FILTERS = ["all", "pending", "reviewed", "dm", "comment", "ready", "published"];
const MODES = ["listening", "deterrence", "dm"];
const VARIANTS = ["fresh", "again", "sharper"];
const THREAD_KINDS = ["text", "share_post", "share_reel", "share_story", "reaction", "voice", "video", "call", "call_missed", "generic", "admin"];
const REPLY_TO = ["story", "note", "montage"];
const RULE_KEYS = ["voice", "listening", "deterrence", "dm", "offers"];
const LABELS = ["Flag", "Booked", "Lead", "Ordered", "Paid", "Shipped"]; // a chat's label (1.18.0), saved with her account
const FOLDERS = ["primary", "general", "requests", "spam"]; // where a chat sits on Instagram (1.22.0)
const SECTIONS = ["main", "general"]; // her inbox here: General once she swipes a chat left (1.22.0)
const EDIT_STATES = ["none", "editing", "edit_failed"];
const LATEST_MS = 4102444800000; // 2100-01-01: the latest activity time taken, as in the simulator
// 1.23.0: a pull from Instagram that hasn't reported back in this long is stuck, and Refresh starts a new one.
const SYNC_STUCK_MS = Number(process.env.COVER_REVIEW_DM_SYNC_STUCK_MS) > 0 ? Number(process.env.COVER_REVIEW_DM_SYNC_STUCK_MS) : 10 * 60_000;

// 1.40.0 (Arjang #1445, #1452 and #1454): the inbox mirrors on arrival. Her Muse brings each DM or comment in with
// importitem at the moment it's made, one chat a call, with no pull and no timer. A pull stays what Refresh asks for.
const museSeen = new Map(); // when her Muse last read syncwanted, to the second, per account (saved at most hourly)

class DmError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const gone = () => new DmError("That practice item no longer exists.", 404);

// ---------- Checking what comes in ----------

function text(v, name, { max, min = 0, def = "" } = {}) {
  if (v === undefined || v === null) v = def;
  if (typeof v !== "string") throw new DmError(`${name} must be text.`);
  const t = v.trim();
  if (t.length < min) throw new DmError(min === 1 ? `${name} can't be empty.` : `${name} needs at least ${min} characters.`);
  if (max && t.length > max) throw new DmError(`${name} can be at most ${max} characters.`);
  return t;
}
const optText = (v, name, max) => (v === undefined || v === null ? undefined : text(v, name, { max }));
function oneOf(v, list, name, def) {
  if (v === undefined || v === null) {
    if (def !== undefined) return def;
    throw new DmError(`${name} is missing.`);
  }
  if (!list.includes(v)) throw new DmError(`${name} must be one of: ${list.join(", ")}.`);
  return v;
}
/** A true or false fact, or undefined when it isn't given. */
function fact(v, name) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new DmError(`${name} must be true or false.`);
  return v;
}
const optOneOf = (v, list, name) => (v === undefined || v === null ? undefined : oneOf(v, list, name));
/** Instagram's own last-activity time for a chat, in milliseconds (its last_activity_timestamp_ms), or undefined. */
function activityMs(v) {
  if (v === undefined || v === null) return undefined;
  if (!Number.isInteger(v) || v < 1 || v > LATEST_MS) throw new DmError("last_activity_timestamp_ms must be a time in milliseconds since 1970.");
  return v;
}
function itemId(v) {
  if (!Number.isInteger(v) || v < 1) throw new DmError("id must be a whole number above 0.");
  return v;
}
function sections(v, { min = 0 } = {}) {
  if (!Array.isArray(v)) throw new DmError("sections must be a list.");
  if (v.length < min) throw new DmError(`Keep at least ${min} section.`);
  if (v.length > 20) throw new DmError("Keep at most 20 sections.");
  return v.map((s, i) => {
    if (!s || typeof s !== "object") throw new DmError(`Section ${i + 1} needs a title and a body.`);
    return { title: text(s.title, `Section ${i + 1}'s title`, { min: 1, max: 120 }), body: text(s.body, `Section ${i + 1}'s body`, { min: 1, max: 6000 }) };
  });
}

// ---------- The data ----------

function rows() {
  const db = store.db;
  if (!Array.isArray(db.dmItems)) db.dmItems = [];
  if (!Number.isInteger(db.dmNextId) || db.dmNextId < 1) db.dmNextId = db.dmItems.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return db.dmItems;
}
function find(id) {
  const row = rows().find((r) => r.id === id);
  if (!row) throw gone();
  return row;
}
function voiceSource() {
  const v = store.settings.dmVoice && typeof store.settings.dmVoice === "object" ? store.settings.dmVoice : {};
  const rules = Object.fromEntries(RULE_KEYS.map((k) => [k, typeof v.rules?.[k] === "string" ? v.rules[k] : ""]));
  const starting = Array.isArray(v.startingProfile) ? v.startingProfile : [];
  return { rules, startingProfile: starting };
}
/** Her saved Voice tab, else the starting profile her Muse set, else nothing. */
function voiceSections() {
  const saved = store.settings.dmVoiceProfile;
  if (Array.isArray(saved) && saved.length) return saved;
  return voiceSource().startingProfile;
}

// 1.22.0: a thread reads the way the simulator keeps it. A call has no text of its own on Instagram: its label is its
// only text, so a label makes the message a call, and a missed call has its own kind.
function callKindOf(words) {
  if (typeof words !== "string") return null;
  const t = words.trim();
  if (t === "" || t.length > 80) return null;
  if (/^missed (audio|video) call$/i.test(t)) return "call_missed";
  if (/^you missed an? (audio|video) call$/i.test(t)) return "call_missed";
  if (/^[a-z0-9._]+ missed an? (audio|video) call$/i.test(t)) return "call_missed";
  if (/^(audio|video) call( ended)?$/i.test(t)) return "call";
  if (/^you started an? (audio|video) call$/i.test(t)) return "call";
  if (/^[a-z0-9._]+ started an? (audio|video) call$/i.test(t)) return "call";
  if (/^(audio|video) call started$/i.test(t)) return "call";
  return null;
}
const EMOJI = /\p{Extended_Pictographic}(?:\u{FE0F})?(?:\u{200D}\p{Extended_Pictographic}(?:\u{FE0F})?)*/u;
/** A reaction keeps only its emoji, read from the reaction log's own text. "Liked a message" is the heart. */
function reactionEmoji(words) {
  if (!words) return null;
  const found = EMOJI.exec(words);
  if (found) return found[0];
  return /liked/i.test(words) ? "\u{2764}\u{FE0F}" : null;
}

/** A thread as kept, oldest first (1.22.0, the simulator's rules). A text with no words is some other message whose kind
 * got lost (a video, a share), so it's kept as generic and shows as its type, never as a blank bubble. A call label
 * makes it a call, and a reaction keeps only its emoji. A message with no time keeps its place. */
function cleanThread(list) {
  if (!Array.isArray(list)) return [];
  const filled = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== "object" || (m.from !== "them" && m.from !== "me")) continue;
    const words = filled(m.text);
    const named = THREAD_KINDS.includes(m.kind) ? m.kind : "text";
    const base = named === "text" && words === null ? "generic" : named;
    const call = callKindOf(words);
    const kind = call && ["text", "generic", "call", "call_missed"].includes(base) ? call : base;
    out.push({
      from: m.from, kind, text: kind === "reaction" ? reactionEmoji(words) : words,
      url: filled(m.url), media_url: filled(m.media_url), caption: filled(m.caption),
      reply_to: REPLY_TO.includes(m.reply_to) ? m.reply_to : null, at: filled(m.at),
    });
  }
  const ms = (m) => (m.at ? Date.parse(m.at) : NaN);
  return out.sort((a, b) => (Number.isNaN(ms(a)) || Number.isNaN(ms(b)) ? 0 : ms(a) - ms(b)));
}
/** The newest message time in a thread, in milliseconds, or null when no message carries one. */
function newestMs(thread) {
  let best = null;
  for (const m of thread) {
    const t = m.at ? Date.parse(m.at) : NaN;
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best;
}
/** When a chat last moved: the time kept with it (Instagram's own, or her last send), else its newest message. */
const lastActivityMs = (r) => (typeof r.lastActivityAt === "number" ? r.lastActivityAt : newestMs(cleanThread(r.threadMessages)));
/** The lines of a reply that went out, one Instagram message each. */
const sentLines = (r) => String(r.publishedText ?? "").split("\n").filter((l) => l.trim() !== "");

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
/** The version of the voice drafts are written under now (1.14.0, Rose #770). */
const currentVoice = () => voiceVersion(voiceSections());
/** An item as the page sees it. The sealed reply stays out until it's revealed. A draft written under another version of
 * her voice is stale; a story reply whose words weren't captured says so (1.14.0, Quill #725). */
/** The end of a thread the inbox list reads (1.40.0): from their or her latest message that isn't a reaction to the
 *  end, so the preview line, the Read chip and Needs Reply all read as they do with the whole thread. */
function threadTail(thread) {
  let start = thread.length - 1;
  while (start > 0 && thread[start].kind === "reaction") start -= 1;
  const tail = thread.slice(Math.max(0, start));
  return tail.length > 6 ? [tail[0], ...tail.slice(-5)] : tail;
}

function toItem(r, voice = currentVoice(), { light = false } = {}) {
  const editStatus = EDIT_STATES.includes(r.editStatus) ? r.editStatus : "none";
  const thread = cleanThread(r.threadMessages);
  return {
    // 1.40.0: the inbox list gets each thread's end only (light), with how many messages the whole thread has.
    ...(light ? { light: true, thread_count: thread.length } : {}),
    id: r.id, kind: r.kind, sender: r.sender, incoming_text: isNonMessageText(r.incomingText) ? "" : r.incomingText, context_text: r.contextText ?? null,
    source: r.source, has_actual: Boolean(r.actualReply && r.actualReply.trim() !== ""),
    actual_reply: r.revealed ? (r.actualReply ?? null) : null,
    draft_text: r.draftText ?? null, draft_mode: r.draftMode ?? null, draft_wanted: Boolean(r.draftWanted),
    revision_text: r.revisionText ?? null, feedback: r.feedback ?? null, verdict: r.verdict, revealed: Boolean(r.revealed),
    publish_status: r.publishStatus, published_text: r.publishedText ?? null, publish_error: r.publishError ?? null,
    published_at: iso(r.publishedAt), has_target: Boolean(r.mediaId || r.commentId || r.threadId),
    thread_messages: light ? threadTail(thread) : thread, created_at: iso(r.createdAt), reviewed_at: iso(r.reviewedAt),
    draft_voice_version: r.draftVoiceVersion ?? null, voice_stale: r.draftText != null && r.draftVoiceVersion !== voice,
    story_reply_not_captured: Boolean(r.storyReplyNotCaptured), label: LABELS.includes(r.label) ? r.label : null,
    // 1.22.0: a fact her Muse hasn't synced reads as the simulator's default.
    folder: FOLDERS.includes(r.folder) ? r.folder : null, following: r.following === true,
    follows_her: typeof r.followsHer === "boolean" ? r.followsHer : null, ig_read: r.igRead === true, needs_reply: r.needsReply !== false,
    section: r.section === "general" ? "general" : "main", build_read_at: iso(r.buildReadAt),
    edit_status: editStatus, edit_error: r.editError ?? null, edited_at: iso(r.editedAt),
    edited_line_index: Number.isInteger(r.editedLineIndex) ? r.editedLineIndex : null,
    pending_edit_line: editStatus !== "none" && Number.isInteger(r.editLineIndex) ? r.editLineIndex : null,
    leftover_text: r.leftoverText ?? null, media_id: r.mediaId ?? null, media_preview_url: r.mediaPreviewUrl ?? null,
    media_permalink: r.mediaPermalink ?? null, last_activity_at: iso(lastActivityMs(r)), dismissed: Boolean(r.dismissedAt),
    work_lines: Array.isArray(r.workLines) ? r.workLines.map((l) => ({ text: l.text, approved: l.approved })) : null,
  };
}

/** The facts her Muse syncs with a chat (1.22.0), checked. Only the ones given are in the answer. */
function factsFrom(a) {
  const out = {};
  const folder = optOneOf(a.folder, FOLDERS, "folder");
  if (folder !== undefined) out.folder = folder;
  for (const [key, field] of [["following", "following"], ["follows_her", "followsHer"], ["ig_read", "igRead"], ["needs_reply", "needsReply"]]) {
    const v = fact(a[key], key);
    if (v !== undefined) out[field] = v;
  }
  const activity = activityMs(a.last_activity_timestamp_ms);
  if (activity !== undefined) out.lastActivityAt = activity;
  const preview = optText(a.media_preview_url, "media_preview_url", 2000);
  if (preview !== undefined) out.mediaPreviewUrl = preview || null;
  const permalink = optText(a.media_permalink, "media_permalink", 2000);
  if (permalink !== undefined) out.mediaPermalink = permalink || null;
  return out;
}

/** Thread messages as sent by her Muse, checked: at most 50, each an object with short text, links and time. */
function threadFrom(list) {
  if (!Array.isArray(list) || list.length > 50) throw new DmError("thread_messages must be a list of at most 50.");
  return cleanThread(list.map((m, i) => {
    if (!m || typeof m !== "object") throw new DmError(`Thread message ${i + 1} must be an object.`);
    const n = `Thread message ${i + 1}'s`;
    return { ...m, text: optText(m.text, `${n} text`, 2000), url: optText(m.url, `${n} url`, 2000), media_url: optText(m.media_url, `${n} media_url`, 2000),
      caption: optText(m.caption, `${n} caption`, 2000), at: optText(m.at, `${n} time`, 40) };
  }));
}

/** Her answer for an item: her saved revision, or with nothing typed, the draft word for word. "" when there's none. */
function answerFor(r, revision) {
  return revision.trim() || (r.draftText ?? "").trim();
}

// ---------- The draft prompt (the same text a space's model gets) ----------

/** What the next draft answers: her stored incoming message, or, once her reply went out and they wrote after it, their
 *  newest texts (1.23.0: a live inbox keeps going after her reply). */
function answeringText(r) {
  if (r.publishStatus !== "published" && r.publishStatus !== "publishing") return r.incomingText;
  const thread = cleanThread(r.threadMessages).filter((m) => m.kind !== "reaction");
  const last = thread.at(-1);
  const sentAt = typeof r.publishedAt === "number" ? r.publishedAt : null;
  if (!last || last.from !== "them" || (sentAt !== null && (!last.at || Date.parse(last.at) <= sentAt))) return r.incomingText;
  const words = [];
  for (let i = thread.length - 1; i >= 0 && thread[i].from === "them"; i -= 1) {
    if (thread[i].kind === "text" && thread[i].text) words.unshift(thread[i].text);
  }
  return words.length ? words.join("\n") : r.incomingText;
}

function draftPrompt(r, mode, variant, direction = null) {
  const openings = [...rows()].sort((a, b) => b.id - a.id).slice(0, 12)
    .map((x) => x.draftText).filter((t) => t && t.trim() !== "").slice(0, 3)
    .map((t) => t.trim().split(/\s+/).slice(0, 2).join(" "));
  const labels = { share_post: "shared a post", share_reel: "shared a reel", share_story: "shared a story", reaction: "reacted to a message",
    voice: "sent a voice message", video: "sent a video", call: "had a call", call_missed: "missed a call", generic: "sent a message",
    admin: "sent an admin message" };
  // 1.40.0 (Arjang #1445): a draft reads the last 25 messages, not 10, and may call back to something from earlier.
  const history = cleanThread(r.threadMessages).slice(-25).map((m) => {
    const who = m.from === "me" ? "the creator" : "Them";
    if (m.kind === "text") return `${who}: ${m.text}`;
    const extra = [m.caption ? `caption: "${m.caption}"` : "", m.text ? `"${m.text}"` : "", m.reply_to ? `in reply to a ${m.reply_to}` : ""].filter(Boolean).join(", ");
    return extra ? `${who}: [${labels[m.kind]}, ${extra}]` : `${who}: [${labels[m.kind]}]`;
  }).join("\n");
  const { rules } = voiceSource();
  const style = mode === "dm" ? rules.dm : mode === "deterrence" ? `${rules.listening}\n${rules.deterrence}` : rules.listening;
  let note = "";
  if (variant === "again") note = mode === "deterrence"
    ? "She asked for a NEW deterrence reply with a different move than last time."
    : "She asked for a fresh alternative: draft a new reply, different in shape from any previous one.";
  if (variant === "sharper") note = "She asked for it SHARPER: keep it light and kind, but make it hit harder.";
  const prompt = [
    `Draft the creator's reply to this incoming ${r.kind === "dm" ? "Instagram DM" : "Instagram comment"}.`,
    r.sender ? `From: @${r.sender.replace(/^@/, "")}` : "",
    r.contextText ? `Context (post caption or thread so far): ${r.contextText}` : "",
    history ? `Thread so far, oldest first:\n${history}` : "",
    history && r.kind === "dm" ? "Read the whole thread before you write. Where it fits naturally, call back to a detail from earlier in it (a name, a plan, something they shared, a joke between you). Never force one, and never invent one that isn't there." : "",
    r.storyReplyNotCaptured
      ? "Their message: (They replied to your story, and the words of that reply weren't captured. Don't invent what they said.)"
      : `Their message: ${answeringText(r)}`,
    openings.length ? `Do not start your reply the same way as these recent drafts: ${openings.join(" / ")}` : "",
    note,
    direction ? `Her direction for this draft, follow it: ${direction}` : "",
  ].filter((l) => l !== "").join("\n");
  const notes = voiceSections();
  const voiceNotes = notes.length
    ? `\n\nthe creator's written voice notes, exactly as she keeps them in the Voice tab of her simulator. This is her voice source. Follow these notes; where they differ from the condensed rules above, her notes win:\n${notes.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")}`
    : "";
  const system = mode === "dm" ? `${rules.voice}\n${style}\n${rules.offers}${voiceNotes}` : `${rules.voice}\n${style}${voiceNotes}`;
  return { system, prompt };
}

/** A sync from her Muse onto a chat that's here (updatethread, and importitem since 1.23.0): the facts, the thread and
 *  the activity time. Her draft, edits, review and sends are never touched. A thread that isn't sent stays as it was. */
function syncInto(r, a) {
  const facts = factsFrom(a);
  const thread = a.thread_messages !== undefined ? threadFrom(a.thread_messages) : undefined;
  if (thread) {
    // Their new message after the last one here needs her reply, even on a chat brought in for its history (Quill #1051).
    const before = newestMs(cleanThread(r.threadMessages));
    const last = thread.filter((m) => m.kind !== "reaction").at(-1);
    // A chat she dismissed comes back to the inbox when they write again after it (1.30.0, room #1193 item 4).
    if (r.dismissedAt && last && last.from === "them" && last.at && Date.parse(last.at) > r.dismissedAt) delete r.dismissedAt;
    if (facts.needsReply === undefined && last && last.from === "them" && last.at && (before === null || Date.parse(last.at) > before)) {
      r.needsReply = true;
    }
    r.threadMessages = thread;
    if (r.storyReplyNotCaptured || String(r.incomingText ?? "").trim().toLowerCase() === STORY_PLACEHOLDER) {
      const story = storyCapture(r.threadMessages, r.incomingText);
      r.incomingText = story.incomingText;
      r.storyReplyNotCaptured = story.notCaptured;
    }
    const newest = newestMs(thread);
    if (facts.lastActivityAt === undefined && newest !== null) r.lastActivityAt = newest;
  }
  // Instagram moving a chat into or out of General moves it here too. While its folder stays the same, her own move holds.
  const folderMoved = facts.folder !== undefined && facts.folder !== (r.folder ?? null);
  Object.assign(r, facts);
  if (folderMoved && facts.folder === "general") Object.assign(r, { section: "general", generalAt: null });
  else if (folderMoved && r.section === "general") Object.assign(r, { section: "main", generalAt: null });
  // A chat she moved to General comes back once their newest message is newer than her move (the simulator's rule).
  const last = cleanThread(r.threadMessages).at(-1);
  if (r.section === "general" && r.generalAt && last && last.from === "them" && last.at && Date.parse(last.at) > r.generalAt) {
    Object.assign(r, { section: "main", generalAt: null });
  }
}

// 1.23.0: where the pull from Instagram stands, kept with her data.
function syncState() {
  if (!store.db.dmSync || typeof store.db.dmSync !== "object") store.db.dmSync = {};
  return store.db.dmSync;
}
/** A copy has a pull once her Muse has read syncwanted, or a pull has reported. Until then Refresh only re-reads. */
const syncWired = (s) => Boolean(s.museSeenAt || s.lastSyncedAt || s.lastErrorAt);
function syncStatus() {
  const s = syncState();
  const asking = typeof s.askedAt === "number";
  const failed = !asking && Boolean(s.lastError) && (s.lastErrorAt ?? 0) > (s.lastSyncedAt ?? 0);
  const state = asking ? (Date.now() - s.askedAt > SYNC_STUCK_MS ? "stuck" : "syncing") : failed ? "failed" : syncWired(s) ? "idle" : "off";
  return {
    state, asked_at: iso(s.askedAt), last_synced_at: iso(s.lastSyncedAt), last_result: s.lastResult ?? null,
    note: s.note ?? null, last_error: failed ? s.lastError : null, failed_result: failed ? (s.failedResult ?? null) : null,
    // 1.40.0: when her Muse last checked for a pull, so the page can say why an old sync is old.
    muse_seen_at: iso(museSeen.get(currentSpace()) ?? s.museSeenAt),
    arrivals: arrivalsStatus(), // 1.40.0: DMs and comments from the Bee Hive's Instagram webhook
  };
}

// ---------- The actions ----------

/** Waiting for her answer: not reviewed yet, on a chat that needs a reply at all (1.22.0, the simulator's count). */
const isPending = (r) => r.verdict === "pending" && r.needsReply !== false;
const isReady = (r) => r.verdict !== "pending" && r.source !== "holdout" && (r.publishStatus === "unpublished" || r.publishStatus === "publish_failed");

// 1.40.0 (Arjang #1445: Chats got slow with thousands of chats). The page used to get every chat with its whole thread
// on every refresh. Now it can ask for the light list, and after the first load only for what changed since the cursor
// it holds. This server works out what changed by comparing each chat, as the page would see it, with what it last
// answered. That's kept in memory only: after a restart the cursor is new, and the page loads the list whole once.
const lightStates = new Map();
function lightState() {
  const key = currentSpace();
  if (!lightStates.has(key)) lightStates.set(key, { epoch: randomUUID().slice(0, 8), rev: 0, rows: new Map(), gone: [], goneFloor: 0 });
  return lightStates.get(key);
}
const GONE_KEPT = 2000;
function lightList(all, voice, sinceRaw) {
  const st = lightState();
  const seen = new Set();
  const items = [];
  for (const r of all) {
    const item = toItem(r, voice, { light: true });
    const sig = createHash("md5").update(JSON.stringify(item)).digest("base64");
    const was = st.rows.get(r.id);
    if (!was || was.sig !== sig) st.rows.set(r.id, { sig, rev: ++st.rev });
    seen.add(r.id);
    items.push(item);
  }
  for (const id of [...st.rows.keys()]) {
    if (seen.has(id)) continue;
    st.rows.delete(id);
    st.gone.push({ id, rev: ++st.rev });
  }
  if (st.gone.length > GONE_KEPT) { const cut = st.gone.splice(0, st.gone.length - GONE_KEPT); st.goneFloor = cut.at(-1).rev; }
  const m = /^([a-f0-9]{8}):(\d{1,15})$/.exec(typeof sinceRaw === "string" ? sinceRaw : "");
  const since = m && m[1] === st.epoch && Number(m[2]) <= st.rev && Number(m[2]) >= st.goneFloor ? Number(m[2]) : null;
  const cursor = `${st.epoch}:${st.rev}`;
  if (since === null) return { items, removed: [], cursor, full: true };
  return { items: items.filter((i) => st.rows.get(i.id).rev > since), removed: st.gone.filter((g) => g.rev > since).map((g) => g.id), cursor, full: false };
}

/**
 * DMs and comments the Bee Hive's Instagram webhook took in, brought into her Chats (1.40.0, Arjang #1452). A comment
 * comes in whole through importitem, found again by its comment id, so a repeat changes nothing. A DM is added to the one
 * chat with that sender's username, once (its message id is kept). A DM with no such chat, or with no username on file,
 * waits for a full sync, so a webhook DM never makes a second copy of a chat. Answers what happened.
 */
export function applyArrivals(events) {
  const counts = { comments_new: 0, comments_seen: 0, dms_added: 0, dms_waiting: 0, errors: 0 };
  const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  for (const ev of Array.isArray(events) ? events : []) {
    try {
      if (ev?.kind === "comment") {
        const at = Date.parse(ev.at ?? "");
        const r = actions.importitem({
          kind: "comment", source: "live", comment_id: String(ev.event_id ?? "").slice(0, 120),
          sender: clip(ev.from?.username, 80) || `ig_${String(ev.from?.id ?? "unknown").slice(0, 60)}`,
          incoming_text: clip(ev.text, 4000) || "Commented without words",
          media_id: clip(ev.media?.id, 120), media_permalink: clip(ev.media?.permalink, 2000), media_preview_url: clip(ev.media?.preview_url, 2000),
          context_text: clip(ev.media?.caption, 4000), ...(Number.isFinite(at) ? { last_activity_timestamp_ms: at } : {}),
        });
        if (r.created) counts.comments_new += 1; else counts.comments_seen += 1;
        continue;
      }
      if (ev?.kind !== "dm") continue;
      const who = String(ev.from?.username ?? "").trim().replace(/^@/, "").toLowerCase();
      const fits = who ? rows().filter((r) => r.kind === "dm" && String(r.sender ?? "").trim().replace(/^@/, "").toLowerCase() === who) : [];
      if (fits.length !== 1) { counts.dms_waiting += 1; continue; }
      const r = fits[0];
      const id = String(ev.event_id ?? "");
      if (Array.isArray(r.arrivalIds) && r.arrivalIds.includes(id)) continue;
      const msg = { from: "them", kind: "text", text: clip(ev.text, 2000) ?? null, at: clip(ev.at, 40) ?? new Date().toISOString(),
        ...(ev.story_reply ? { reply_to: "story" } : {}) };
      syncInto(r, { thread_messages: [...cleanThread(r.threadMessages), msg].slice(-50) });
      r.arrivalIds = [...(Array.isArray(r.arrivalIds) ? r.arrivalIds : []), id].slice(-200);
      counts.dms_added += 1;
    } catch {
      counts.errors += 1;
    }
  }
  return counts;
}

const actions = {
  listitems(a) {
    const filter = oneOf(a.filter, FILTERS, "filter", "all");
    const all = [...rows()].sort((x, y) => x.id - y.id);
    const stats = {
      total: all.length,
      pending: all.filter(isPending).length,
      reviewed: all.filter((r) => r.verdict !== "pending").length,
      approved: all.filter((r) => r.verdict === "approved").length,
      edited: all.filter((r) => r.verdict === "edited").length,
      needs_work: all.filter((r) => r.verdict === "needs_work").length,
      ready: all.filter(isReady).length,
      published: all.filter((r) => r.publishStatus === "published").length,
    };
    const keep = {
      all: () => true, pending: isPending, reviewed: (r) => r.verdict !== "pending",
      dm: (r) => r.kind === "dm", comment: (r) => r.kind === "comment", ready: isReady, published: (r) => r.publishStatus === "published",
    }[filter];
    const voice = currentVoice();
    // light: true with every chat (filter "all") answers the light list, and with since, only what changed (1.40.0).
    if (a.light === true && filter === "all") return { ...lightList(all, voice, a.since), stats };
    return { items: all.filter(keep).map((r) => toItem(r, voice, { light: a.light === true })), stats };
  },
  /** One chat's whole thread (1.40.0): the light list carries only its end, so an open chat reads the rest here. */
  getthread(a) {
    const r = find(itemId(a.id));
    return { id: r.id, thread_messages: cleanThread(r.threadMessages) };
  },

  createitem(a) {
    const kind = oneOf(a.kind, KINDS, "kind");
    const source = oneOf(a.source, SOURCES, "source", "live");
    const thread = a.thread_messages !== undefined && a.thread_messages !== null ? threadFrom(a.thread_messages) : [];
    // A chat with history can come in with no message from them (1.22.0, the grab-all sync): she wrote last, or they
    // only reacted. A reaction or an import's note is never kept as their message.
    const incoming = text(a.incoming_text, "Their message", { min: thread.length ? 0 : 1, max: 4000 });
    const row = {
      id: 0, kind, sender: text(a.sender, "sender", { max: 80 }), incomingText: isNonMessageText(incoming) ? "" : incoming,
      contextText: optText(a.context_text, "context", 4000) || null, source,
      actualReply: null, draftText: null, draftMode: null, draftWanted: null, revisionText: null, feedback: null,
      verdict: "pending", publishStatus: "unpublished", publishedText: null, publishError: null, publishedAt: null,
      mediaId: optText(a.media_id, "media_id", 120) || null, commentId: optText(a.comment_id, "comment_id", 120) || null,
      threadId: optText(a.thread_id, "thread_id", 120) || null, threadMessages: thread, revealed: false,
      createdAt: Date.now(), reviewedAt: null,
      // 1.22.0: the facts her Muse syncs. One it doesn't send reads as the simulator's default.
      folder: null, following: false, followsHer: null, igRead: false, needsReply: true, lastActivityAt: newestMs(thread),
      mediaPreviewUrl: null, mediaPermalink: null, section: "main", generalAt: null, buildReadAt: null,
      editStatus: "none", editText: null, editLineIndex: null, editError: null, editedAt: null, editedLineIndex: null,
      leftoverText: null, publishAppend: false, workLines: null,
      ...factsFrom(a),
    };
    // A chat Instagram keeps in General starts in her General. It has no move time, so it stays there when they write
    // again, the way Instagram keeps it.
    if (row.folder === "general") row.section = "general";
    const actual = optText(a.actual_reply, "actual_reply", 4000);
    if (source === "holdout" && actual) row.actualReply = actual;
    // A story reply keeps its own words; with none captured, it's flagged and nothing is invented (Rose #770).
    const story = storyCapture(row.threadMessages, row.incomingText);
    row.incomingText = story.incomingText;
    row.storyReplyNotCaptured = story.notCaptured;
    rows();
    row.id = store.db.dmNextId++;
    store.db.dmItems.push(row);
    return { id: row.id };
  },

  // No model here: the item waits for her Muse's draft. A space with a model drafts right away instead.
  generatedraft(a) {
    const r = find(itemId(a.id));
    const asked = oneOf(a.mode, MODES, "mode", "listening");
    const variant = oneOf(a.variant, VARIANTS, "variant", "fresh");
    // 1.22.0 (Big Edit #23): Refresh can carry her direction for the new draft. An empty box asks for a fresh one.
    const direction = text(a.direction, "direction", { max: 300 }) || null;
    const mode = r.kind === "dm" ? "dm" : asked;
    r.draftWanted = { mode, variant, at: Date.now(), direction };
    return { draft_text: r.draftText ?? "", draft_mode: mode, wanted: true };
  },

  // Opening a thread (Rose #770): a pending draft written under an older voice is drafted again once, with her voice as
  // it is now. Here that asks her Muse for a fresh draft; the old one shows until the new one lands. A space with a model
  // drafts right away and answers regenerated: true. Approved, edited and published drafts never change on their own:
  // they come back marked voice_stale. The inbox list never drafts anything.
  openthread(a) {
    const r = find(itemId(a.id));
    const voice = currentVoice();
    const stale = r.draftText != null && r.draftVoiceVersion !== voice;
    const pending = r.verdict === "pending" && r.publishStatus === "unpublished" && r.needsReply !== false;
    if (pending && stale && !r.draftWanted) r.draftWanted = { mode: r.kind === "dm" ? "dm" : "listening", variant: "fresh", at: Date.now() };
    return { item: toItem(r, voice), regenerated: false, wanted: Boolean(r.draftWanted) };
  },

  savereview(a) {
    const r = find(itemId(a.id));
    const revision = text(a.revision_text, "Your revision", { max: 4000 });
    const feedback = text(a.feedback, "Feedback", { max: 2000 });
    const asked = oneOf(a.verdict, VERDICTS, "verdict");
    const answer = answerFor(r, revision);
    if (!answer) throw new DmError(r.draftText
      ? "Write your reply in the revision field first. That field is the source of truth."
      : "There is no draft to approve yet. Draft a reply first, or write your own in the revision field.", 409);
    r.revisionText = answer;
    r.feedback = feedback || null;
    r.verdict = asked === "approved" || (r.draftText && answer === r.draftText.trim()) ? "approved" : asked;
    r.reviewedAt = Date.now();
    return { ok: true };
  },

  // Her Send tap: saves the review like savereview, then hands the exact text to her Muse to send.
  publishitem(a) {
    const r = find(itemId(a.id));
    const revision = text(a.revision_text, "Your revision", { max: 4000 });
    const feedback = text(a.feedback, "Feedback", { max: 2000 });
    const asked = oneOf(a.verdict, VERDICTS, "verdict", "approved");
    // 1.22.0: the texts she isn't sending this time stay with the chat as drafts.
    const remaining = a.remaining_text === undefined || a.remaining_text === null ? undefined : text(a.remaining_text, "remaining_text", { max: 4000 });
    if (r.source === "holdout") throw new DmError("This is a blind holdout: you already replied to it on Instagram, so there is nothing to publish.", 409);
    // 1.22.0 (the simulator's later send): a reply that went out can send more, such as the texts an earlier send left.
    const later = r.publishStatus === "published";
    if (later && r.editStatus === "editing") throw new DmError("An edit is on its way for this one. Let it land before sending more.", 409);
    if (r.publishStatus === "publishing") throw new DmError("A publish is already on its way for this one. Give it a moment, then check its status here.", 409);
    const answer = answerFor(r, revision);
    if (!answer) throw new DmError(r.draftText
      ? "Write your reply in the revision field first, or approve the draft as-is to publish it."
      : "There is nothing to publish yet. Draft a reply first, or write your own in the revision field.", 409);
    r.revisionText = answer;
    r.feedback = feedback || r.feedback;
    r.verdict = asked === "approved" || (r.draftText && answer === r.draftText.trim()) ? "approved" : asked === "needs_work" ? "edited" : asked;
    r.reviewedAt = Date.now();
    r.publishStatus = "publishing";
    r.publishError = null;
    r.publishAppend = later;
    if (remaining !== undefined) r.leftoverText = remaining || null;
    r.workLines = null; // the send splits her lines into what went and what's left
    r.handedAt = Date.now();
    return { ok: true, status: "publishing", text: answer };
  },

  // Her Muse reports how the send went: ok marks it published with the text she approved, else it's ready to retry.
  confirmpublish(a) {
    const r = find(itemId(a.id));
    if (typeof a.ok !== "boolean") throw new DmError("ok must be true or false.");
    const detail = text(a.detail, "detail", { max: 1000 });
    if (a.ok) {
      // 1.22.0: a later send joins what already went out, in order, and her sent reply moves the chat in the inbox.
      const answer = r.revisionText ?? r.draftText ?? null;
      const sent = r.publishAppend && r.publishedText && answer ? `${r.publishedText}\n${answer}` : answer;
      const now = Date.now();
      Object.assign(r, { publishStatus: "published", publishedText: sent, revisionText: sent, publishedAt: now, lastActivityAt: now, publishError: null });
    } else {
      // A failed later send leaves the earlier one sent: only a failed first send is publish_failed.
      Object.assign(r, { publishStatus: r.publishAppend ? "published" : "publish_failed", publishError: detail || "Publishing did not go through." });
    }
    r.publishAppend = false;
    r.handedAt = null;
    return { ok: true };
  },

  // 1.22.0 (Big Edit #24, the simulator's Edit on a sent text): she changes one line that already went out. The line
  // shows as sent until her Muse reports the edit landed on Instagram; only that report changes the sent text.
  editpublished(a) {
    const r = find(itemId(a.id));
    const index = a.line_index;
    if (!Number.isInteger(index) || index < 0 || index > 50) throw new DmError("line_index must be a whole number from 0 to 50.");
    const next = text(a.text, "text", { min: 1, max: 2000 });
    if (r.source === "holdout") throw new DmError("This is a blind holdout: it was never sent from here, so there is nothing here to edit on Instagram.", 409);
    if (r.publishStatus !== "published" || !r.publishedText) throw new DmError("Only a reply that has gone out can be edited.", 409);
    if (r.editStatus === "editing") throw new DmError("An edit is already on its way for this one. Give it a moment, then check its status here.", 409);
    const old = sentLines(r)[index];
    if (old === undefined) throw new DmError("That sent text is no longer there to edit.", 409);
    if (next === old) throw new DmError("That is the same text, so there is nothing to change.");
    Object.assign(r, { editStatus: "editing", editText: next, editLineIndex: index, editError: null });
    return { ok: true, status: "editing" };
  },

  // Her Muse reports how the edit went: ok swaps the line into what went out, else the sent text stays as it is.
  confirmedit(a) {
    const r = find(itemId(a.id));
    if (typeof a.ok !== "boolean") throw new DmError("ok must be true or false.");
    const detail = text(a.detail, "detail", { max: 1000 });
    if (r.editStatus !== "editing" || r.editText == null || !Number.isInteger(r.editLineIndex) || !r.publishedText) throw new DmError("There is no edit in flight for this one.", 409);
    if (a.ok) {
      const lines = sentLines(r);
      if (lines[r.editLineIndex] === undefined) throw new DmError("That sent text is no longer there to edit.", 409);
      lines[r.editLineIndex] = r.editText;
      const sent = lines.join("\n");
      Object.assign(r, { publishedText: sent, revisionText: sent, editedAt: Date.now(), editedLineIndex: r.editLineIndex, editStatus: "none", editText: null, editLineIndex: null, editError: null });
    } else {
      Object.assign(r, { editStatus: "edit_failed", editError: detail || "The edit did not go through." });
    }
    return { ok: true };
  },

  revealactual(a) {
    const r = find(itemId(a.id));
    if (!r.actualReply) throw new DmError("This item has no actual reply stored. It was not added as a blind holdout.", 409);
    if (!r.revisionText || r.verdict === "pending") throw new DmError("Save your revision first. The actual reply stays sealed until your own answer is locked in.", 409);
    r.revealed = true;
    return { actual_reply: r.actualReply };
  },

  // 1.22.0 (the simulator's swipe left): a chat moves between her inbox and General. A chat in General comes back on its
  // own when a newer message from them syncs in.
  setchatsection(a) {
    const r = find(itemId(a.id));
    const section = oneOf(a.section, SECTIONS, "section");
    Object.assign(r, { section, generalAt: section === "general" ? Date.now() : null });
    return { ok: true };
  },
  // 1.22.0 (Big Edit #24): the lines she's working on in a chat are kept with it, so an edit stays when she leaves and
  // comes back. A new draft from her Muse or a send replaces them. null clears them; an empty list means she removed all.
  savework(a) {
    const r = find(itemId(a.id));
    if (a.lines === null) {
      r.workLines = null;
      return { ok: true };
    }
    if (!Array.isArray(a.lines) || a.lines.length > 50) throw new DmError("lines must be a list of at most 50.");
    r.workLines = a.lines.map((l, i) => {
      if (!l || typeof l !== "object") throw new DmError(`Line ${i + 1} must be an object.`);
      const t = text(l.text, `Line ${i + 1}'s text`, { min: 1, max: 2000 });
      if (typeof l.approved !== "boolean") throw new DmError(`Line ${i + 1}'s approved must be true or false.`);
      return { text: t, approved: l.approved };
    });
    return { ok: true };
  },
  // 1.22.0: she opened the chat here. This is the app's own read mark, never Instagram's (ig_read comes with the sync).
  markreadinbuild(a) {
    const r = find(itemId(a.id));
    if (!r.buildReadAt) r.buildReadAt = Date.now();
    return { ok: true };
  },

  // A chat's label (1.18.0, Arjang in room #840): saved with her account, so every device shows it. null or "" clears it.
  setlabel(a) {
    const r = find(itemId(a.id));
    if (!Object.hasOwn(a, "label")) throw new DmError("label is missing.");
    r.label = a.label === null || a.label === "" ? null : oneOf(a.label, LABELS, "label");
    return { ok: true, label: r.label };
  },
  // A device's labels from before 1.18.0, kept in its browser, sent up once: { labels: { <chat id>: <label> } }. Each one
  // lands only on a chat that has no label yet, so a saved label stays. A chat that's gone or a label that isn't one of the
  // six is skipped.
  importlabels(a) {
    const given = a.labels;
    if (!given || typeof given !== "object" || Array.isArray(given)) throw new DmError("labels must be chat ids with their labels.");
    const entries = Object.entries(given);
    if (entries.length > 5000) throw new DmError("Send at most 5000 labels at once.");
    let imported = 0;
    for (const [key, label] of entries) {
      const id = Number(key);
      if (!Number.isInteger(id) || id < 1 || !LABELS.includes(label)) continue;
      const r = rows().find((x) => x.id === id);
      if (!r || LABELS.includes(r.label)) continue;
      r.label = label;
      imported += 1;
    }
    return { ok: true, imported };
  },

  deleteitem(a) {
    const id = itemId(a.id);
    store.db.dmItems = rows().filter((r) => r.id !== id);
    return { ok: true };
  },

  exporttraining() {
    const reviewed = [...rows()].sort((x, y) => x.id - y.id).filter((r) => r.verdict !== "pending");
    return {
      count: reviewed.length, exported_at: new Date().toISOString(),
      items: reviewed.map((r) => ({
        id: r.id, kind: r.kind, source: r.source, sender: r.sender, incoming_text: r.incomingText, context_text: r.contextText ?? null,
        draft_text: r.draftText ?? null, draft_mode: r.draftMode ?? null, revision_text: r.revisionText ?? null, feedback: r.feedback ?? null,
        verdict: r.verdict, publish_status: r.publishStatus, published_text: r.publishedText ?? null, published_at: iso(r.publishedAt),
        actual_reply: r.revealed ? (r.actualReply ?? null) : null, // only an opened holdout, so an export never unseals a test
      })),
    };
  },

  getvoiceprofile() {
    const saved = store.settings.dmVoiceProfile;
    return { sections: voiceSections(), is_custom: Array.isArray(saved) && saved.length > 0 };
  },
  savevoiceprofile(a) {
    store.settings.dmVoiceProfile = sections(a.sections, { min: 1 });
    return { ok: true };
  },
  resetvoiceprofile() {
    store.settings.dmVoiceProfile = null;
    return { ok: true, sections: voiceSource().startingProfile };
  },

  // ---------- For her Muse ----------

  /** The account her Muse sends from, from the Instagram connector. null until it's set. */
  getaccount() {
    const h = store.settings.connectors?.instagram?.handle;
    return { handle: typeof h === "string" && h.trim() ? h.trim().replace(/^@/, "") : null };
  },
  /** Her voice for drafting: the condensed rules and the Voice tab's starting sections. Empty until her Muse sets them. */
  getvoicesource() {
    const { rules, startingProfile } = voiceSource();
    return { rules, starting_profile: startingProfile };
  },
  savevoicesource(a) {
    const cur = voiceSource();
    const rules = { ...cur.rules };
    if (a.rules !== undefined) {
      if (!a.rules || typeof a.rules !== "object") throw new DmError("rules must be an object.");
      for (const k of RULE_KEYS) if (a.rules[k] !== undefined) rules[k] = text(a.rules[k], `rules.${k}`, { max: 20000 });
    }
    const startingProfile = a.starting_profile !== undefined ? sections(a.starting_profile) : cur.startingProfile;
    store.settings.dmVoice = { rules, startingProfile };
    return { ok: true };
  },
  /** Items waiting for a draft, oldest ask first, each with the text a model would get. Never a sealed reply. */
  draftswanted() {
    const waiting = rows().filter((r) => r.draftWanted).sort((x, y) => x.draftWanted.at - y.draftWanted.at || x.id - y.id);
    return { items: waiting.map((r) => {
      const { mode, variant, at, direction = null } = r.draftWanted;
      return { id: r.id, kind: r.kind, mode, variant, direction, asked_at: iso(at), ...draftPrompt(r, mode, variant, direction) };
    }) };
  },
  /** Her Muse's draft for an item. It replaces any earlier draft, and the item stops waiting. */
  // 1.14.0 (Rose #770): the draft's endings are held to the !! rule in her voice, and it's stamped with that voice's version.
  savedraft(a) {
    const r = find(itemId(a.id));
    const raw = text(a.draft_text, "draft_text", { min: 1, max: 4000 });
    const sections = voiceSections();
    const capped = capEndings(raw, sections).trim();
    const draft = capped || raw;
    const mode = r.kind === "dm" ? "dm" : oneOf(a.mode, MODES, "mode", r.draftWanted?.mode || "listening");
    Object.assign(r, { draftText: draft, draftMode: mode, draftWanted: null, draftVoiceVersion: voiceVersion(sections), workLines: null });
    return { draft_text: draft, draft_mode: mode };
  },
  /** A later import of a thread (Rose #770). Its messages replace the old ones. A story reply whose words weren't captured
   * before gets them now, if this import carries them; otherwise the message she's practicing on stays as it was. */
  // 1.22.0: a sync can bring the facts alone (a thread it doesn't send stays as it was), and Instagram's own activity
  // time wins over the newest message's.
  updatethread(a) {
    const r = find(itemId(a.id));
    syncInto(r, a);
    return { ok: true, item: toItem(r) };
  },

  // 1.23.0 (Arjang in room #1048: Refresh is a live sync, and it has to be reliable). A pull from Instagram brings each
  // chat and comment in through here. A DM is found again by its thread id and a comment by its comment id, so a pull
  // never makes a copy, however often it runs. A new one comes in the way createitem brings it. One that's here gets the
  // facts, the thread, the handle and the post. Its draft, her kept edits, her review, a send and an edit are hers and
  // never change; while she hasn't touched it, it also takes their latest words.
  importitem(a) {
    const kind = oneOf(a.kind, KINDS, "kind");
    const source = oneOf(a.source, ["live"], "source", "live");
    const key = kind === "dm" ? text(a.thread_id, "thread_id", { min: 1, max: 120 }) : text(a.comment_id, "comment_id", { min: 1, max: 120 });
    let found = rows().find((r) => r.kind === kind && (kind === "dm" ? r.threadId : r.commentId) === key);
    // A DM brought in before thread ids were kept is matched once by its handle (only when exactly one fits), then keeps the id.
    const handle = (v) => String(v ?? "").trim().replace(/^@/, "").toLowerCase();
    if (!found && kind === "dm" && handle(a.sender)) {
      const fits = rows().filter((r) => r.kind === "dm" && !r.threadId && handle(r.sender) === handle(a.sender));
      if (fits.length === 1) [found] = fits;
      if (found) found.threadId = key;
    }
    // 1.40.0 (Quill #1461): a comment's answer names what its post still lacks here, so whoever imports it can send it.
    // Tapping the comment opens its post for reference, and with none of these on file there's no post to show.
    const lacks = (r) => (r.kind !== "comment" ? {} : (() => {
      const missing = [["media_id", r.mediaId], ["media_preview_url", r.mediaPreviewUrl], ["media_permalink", r.mediaPermalink]].filter(([, v]) => !v).map(([k]) => k);
      return missing.length ? { missing } : {};
    })());
    if (!found) {
      const id = actions.createitem({ ...a, kind, source }).id;
      return { id, created: true, ...lacks(find(id)) };
    }
    const sender = optText(a.sender, "sender", 80);
    const context = optText(a.context_text, "context", 4000);
    const mediaId = optText(a.media_id, "media_id", 120);
    const incoming = optText(a.incoming_text, "Their message", 4000);
    syncInto(found, a);
    if (sender) found.sender = sender;
    if (context !== undefined) found.contextText = context || null;
    if (mediaId) found.mediaId = mediaId;
    const untouched = found.draftText == null && !found.draftWanted && found.verdict === "pending" && found.publishStatus === "unpublished"
      && !Array.isArray(found.workLines) && found.source === "live";
    if (incoming && untouched && !isNonMessageText(incoming)) {
      const story = storyCapture(cleanThread(found.threadMessages), incoming);
      found.incomingText = story.incomingText;
      found.storyReplyNotCaptured = story.notCaptured;
    }
    return { id: found.id, created: false, ...lacks(found) };
  },

  // 1.23.0: Refresh asks for a pull from Instagram, one at a time. A tap while one runs asks nothing new; a pull that
  // hasn't reported back in time is stuck, and the next tap starts a new one.
  requestsync() {
    const s = syncState();
    if (!syncWired(s)) return syncStatus();
    if (!(typeof s.askedAt === "number" && Date.now() - s.askedAt <= SYNC_STUCK_MS)) s.askedAt = Date.now();
    return syncStatus();
  },
  /** Where the pull stands, for the page. */
  getsync() {
    return syncStatus();
  },
  /** For her Muse: whether a pull is asked, and since when to look (the start of the last good pull, so nothing that
   *  arrived during it is missed; an import that meets a chat again changes nothing it shouldn't). */
  syncwanted() {
    const s = syncState();
    // Reading this is how a copy learns its Muse can pull. It's kept, at most once an hour, so a restart keeps it.
    const now = Date.now();
    museSeen.set(currentSpace(), now);
    if (!s.museSeenAt || now - s.museSeenAt > 3_600_000) {
      s.museSeenAt = now;
      store.saveDb();
    }
    return { wanted: typeof s.askedAt === "number", asked_at: iso(s.askedAt), since: iso(s.cursor) };
  },
  /** Her Muse's report: ok with what changed (and a note, such as threads it couldn't read), or why it didn't finish. */
  confirmsync(a) {
    const s = syncState();
    if (typeof a.ok !== "boolean") throw new DmError("ok must be true or false.");
    const detail = text(a.detail, "detail", { max: 1000 });
    const count = (v, name) => {
      if (v === undefined || v === null) return 0;
      if (!Number.isInteger(v) || v < 0) throw new DmError(`${name} must be a whole number, 0 or more.`);
      return v;
    };
    const result = { imported: count(a.imported, "imported"), updated: count(a.updated, "updated"), skipped: count(a.skipped, "skipped") };
    if (typeof s.askedAt !== "number") throw new DmError("There's no pull in flight to report on.", 409);
    if (a.asked_at !== undefined && a.asked_at !== null && a.asked_at !== iso(s.askedAt)) {
      throw new DmError("That pull was replaced by a newer one. What it imported is in; report the newer one when it's done.", 409);
    }
    const now = Date.now();
    if (a.ok) Object.assign(s, { cursor: s.askedAt, lastSyncedAt: now, lastResult: result, note: detail || null });
    else Object.assign(s, { lastError: detail || "The pull from Instagram didn't go through.", lastErrorAt: now, failedResult: result });
    s.askedAt = null;
    return { ok: true };
  },

  /** Edits her Muse should apply now (1.22.0): each with the sent line as it is on Instagram and the line she wants. */
  editswanted() {
    const waiting = rows().filter((r) => r.editStatus === "editing" && r.editText != null && Number.isInteger(r.editLineIndex)).sort((x, y) => x.id - y.id);
    return {
      items: waiting.map((r) => ({
        id: r.id, kind: r.kind, sender: r.sender, incoming_text: r.incomingText, context_text: r.contextText ?? null,
        line_index: r.editLineIndex, old_text: sentLines(r)[r.editLineIndex] ?? null, new_text: r.editText,
        media_id: r.mediaId ?? null, comment_id: r.commentId ?? null, thread_id: r.threadId ?? null,
      })),
    };
  },
  // 1.30.0 (room #1193 item 4): Dismiss hides a chat's preview from the inbox for now. Nothing is deleted, and a new
  // message from them brings it back (syncInto). { id, on: false } brings it back by hand.
  dismissitem(a) {
    const r = find(itemId(a.id));
    if (a.on === false) delete r.dismissedAt;
    else r.dismissedAt = Date.now();
    return { ok: true, item: toItem(r) };
  },
  // 1.30.0 (room #1193 item 2): the links she pastes into replies, like her private channel, one tap to copy. Kept in her
  // settings, never in the code. Up to 5, each a label and an https link.
  getreplylinks() {
    return { links: replyLinks() };
  },
  savereplylinks(a) {
    const list = Array.isArray(a.links) ? a.links : null;
    if (!list || list.length > 5) throw new DmError("Send links as a list of up to 5 { label, url }.");
    const links = list.map((l) => {
      const label = text(l?.label, "label", { min: 1, max: 40 });
      const url = text(l?.url, "url", { min: 9, max: 300 });
      if (!/^https:\/\/[^\s]+$/.test(url)) throw new DmError("Each link has to start with https:// and have no spaces.");
      return { label, url };
    });
    store.settings.dmReplyLinks = links;
    return { links };
  },
  /** Approved texts her Muse should send now, the order she tapped Send. Since 1.30.0 (room #1193 item 6) each comes with
   *  its parts and the pause to hold before each one, longer after a longer part, so a multi-text send reads typed. */
  publishwanted() {
    const waiting = rows().filter((r) => r.publishStatus === "publishing").sort((x, y) => (x.handedAt || 0) - (y.handedAt || 0) || x.id - y.id);
    return {
      items: waiting.map((r) => ({
        id: r.id, kind: r.kind, sender: r.sender, incoming_text: r.incomingText, context_text: r.contextText ?? null, text: r.revisionText ?? "",
        media_id: r.mediaId ?? null, comment_id: r.commentId ?? null, thread_id: r.threadId ?? null, handed_at: iso(r.handedAt),
        parts: sendParts(r.revisionText ?? ""),
      })),
    };
  },
};

/** Her reply links from settings, only well-formed ones. */
function replyLinks() {
  const list = Array.isArray(store.settings.dmReplyLinks) ? store.settings.dmReplyLinks : [];
  return list.filter((l) => l && typeof l.label === "string" && typeof l.url === "string" && /^https:\/\//.test(l.url)).slice(0, 5);
}
/** The pause before a part of a multi-text send (1.30.0): a few seconds, longer after a longer part just sent. */
export function pauseAfter(part) {
  return Math.min(8000, Math.max(1500, 1000 + 40 * String(part ?? "").length));
}
/** A send's parts, one per line, each with the pause to hold before sending it: none before the first. */
export function sendParts(textToSend) {
  const lines = String(textToSend ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((t, i) => ({ text: t, delay_ms: i === 0 ? 0 : pauseAfter(lines[i - 1]) }));
}

const READS = new Set(["listitems", "getthread", "getreplylinks", "exporttraining", "getvoiceprofile", "getaccount", "getvoicesource", "draftswanted", "publishwanted", "editswanted",
  "getsync", "syncwanted"]);
const SETTINGS = new Set(["savevoiceprofile", "resetvoiceprofile", "savevoicesource", "savereplylinks"]);

// 1.40.0 (Arjang #1452): an open Chats tab hears of a change the moment it's saved, with no timer. Its read of the light
// list can carry wait: the server holds the answer until something in her Chats changes (a DM her Muse brought in, a
// draft, a send) or the wait runs out, then answers what changed. Every action that writes wakes the reads held for
// that account. The answer says waited: true, so a page talking to a server that can't hold a read knows to refresh
// on its own clock instead.
const WAIT_MAX_MS = 25_000;
const waiting = new Map(); // account space -> the held reads' wake-ups
export function wakeReads(space) {
  const set = waiting.get(space);
  if (!set) return;
  waiting.delete(space);
  for (const wake of set) wake();
}
function heldRead(space, ms, res) {
  return new Promise((resolve) => {
    let set = waiting.get(space);
    if (!set) { set = new Set(); waiting.set(space, set); }
    const done = () => { clearTimeout(timer); set.delete(wake); res.off("close", done); resolve(); };
    const wake = done;
    const timer = setTimeout(done, ms);
    set.add(wake);
    res.on("close", done); // she left Chats or closed the page, so the connection closed: let it go
  });
}

export function registerDm(app) {
  app.post("/api/dm/:action", async (req, res) => {
    const name = req.params.action;
    const run = Object.hasOwn(actions, name) ? actions[name] : null;
    if (!run) return res.status(404).json({ error: `There's no ${name} here.` });
    res.set("Cache-Control", "no-store");
    try {
      const args = req.body && typeof req.body === "object" ? req.body : {};
      if (name === "listitems" && args.light === true) catchUpSoon(); // her open Chats asks the Bee Hive for arrivals (1.40.0)
      let out = run(args);
      // A held read: nothing changed since her cursor, so wait for a change, then answer again from the new state.
      const ms = Number(args.wait);
      if (name === "listitems" && args.light === true && Number.isFinite(ms) && ms > 0) {
        const space = currentSpace();
        if (out.full === false && !out.items.length && !out.removed.length) {
          await heldRead(space, Math.min(ms, WAIT_MAX_MS), res);
          if (res.writableEnded || res.destroyed) return;
          out = runIn(space, () => run(args));
        }
        out = { ...out, waited: true };
      }
      if (SETTINGS.has(name)) store.saveSettings();
      else if (!READS.has(name)) { store.saveDb(); wakeReads(currentSpace()); }
      res.json(out);
    } catch (e) {
      if (!(e instanceof DmError)) console.error(`dm ${name}:`, e);
      res.status(e instanceof DmError ? e.status : 500).json({ error: e instanceof DmError ? e.message : "Something went wrong. Try again." });
    }
  });
}
