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
import { store } from "./store.js";
import { STORY_PLACEHOLDER, capEndings, storyCapture, voiceVersion } from "./dmRules.js";

const KINDS = ["dm", "comment"];
const SOURCES = ["live", "holdout", "paste"];
const VERDICTS = ["approved", "edited", "needs_work"];
const FILTERS = ["all", "pending", "reviewed", "dm", "comment", "ready", "published"];
const MODES = ["listening", "deterrence", "dm"];
const VARIANTS = ["fresh", "again", "sharper"];
const THREAD_KINDS = ["text", "share_post", "share_reel", "share_story", "reaction", "voice", "generic", "admin"];
const REPLY_TO = ["story", "note", "montage"];
const RULE_KEYS = ["voice", "listening", "deterrence", "dm", "offers"];

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

/** One thread message as kept, oldest first. A text with no text isn't a message; other kinds keep their place. */
function cleanThread(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== "object" || (m.from !== "them" && m.from !== "me")) continue;
    const kind = THREAD_KINDS.includes(m.kind) ? m.kind : "text";
    const t = typeof m.text === "string" && m.text.trim() !== "" ? m.text : null;
    if (kind === "text" && t === null) continue;
    out.push({
      from: m.from, kind, text: t,
      url: typeof m.url === "string" && m.url.trim() !== "" ? m.url : null,
      reply_to: REPLY_TO.includes(m.reply_to) ? m.reply_to : null,
      at: typeof m.at === "string" && m.at.trim() !== "" ? m.at : null,
    });
  }
  return out;
}

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
/** The version of the voice drafts are written under now (1.14.0, Rose #770). */
const currentVoice = () => voiceVersion(voiceSections());
/** An item as the page sees it. The sealed reply stays out until it's revealed. A draft written under another version of
 * her voice is stale; a story reply whose words weren't captured says so (1.14.0, Quill #725). */
function toItem(r, voice = currentVoice()) {
  return {
    id: r.id, kind: r.kind, sender: r.sender, incoming_text: r.incomingText, context_text: r.contextText ?? null,
    source: r.source, has_actual: Boolean(r.actualReply && r.actualReply.trim() !== ""),
    actual_reply: r.revealed ? (r.actualReply ?? null) : null,
    draft_text: r.draftText ?? null, draft_mode: r.draftMode ?? null, draft_wanted: Boolean(r.draftWanted),
    revision_text: r.revisionText ?? null, feedback: r.feedback ?? null, verdict: r.verdict, revealed: Boolean(r.revealed),
    publish_status: r.publishStatus, published_text: r.publishedText ?? null, publish_error: r.publishError ?? null,
    published_at: iso(r.publishedAt), has_target: Boolean(r.mediaId || r.commentId || r.threadId),
    thread_messages: cleanThread(r.threadMessages), created_at: iso(r.createdAt), reviewed_at: iso(r.reviewedAt),
    draft_voice_version: r.draftVoiceVersion ?? null, voice_stale: r.draftText != null && r.draftVoiceVersion !== voice,
    story_reply_not_captured: Boolean(r.storyReplyNotCaptured),
  };
}

/** Thread messages as sent by her Muse, checked: at most 50, each an object with short text, url and time. */
function threadFrom(list) {
  if (!Array.isArray(list) || list.length > 50) throw new DmError("thread_messages must be a list of at most 50.");
  return cleanThread(list.map((m, i) => {
    if (!m || typeof m !== "object") throw new DmError(`Thread message ${i + 1} must be an object.`);
    return { ...m, text: optText(m.text, `Thread message ${i + 1}'s text`, 2000), url: optText(m.url, `Thread message ${i + 1}'s url`, 500), at: optText(m.at, `Thread message ${i + 1}'s time`, 40) };
  }));
}

/** Her answer for an item: her saved revision, or with nothing typed, the draft word for word. "" when there's none. */
function answerFor(r, revision) {
  return revision.trim() || (r.draftText ?? "").trim();
}

// ---------- The draft prompt (the same text a space's model gets) ----------

function draftPrompt(r, mode, variant) {
  const openings = [...rows()].sort((a, b) => b.id - a.id).slice(0, 12)
    .map((x) => x.draftText).filter((t) => t && t.trim() !== "").slice(0, 3)
    .map((t) => t.trim().split(/\s+/).slice(0, 2).join(" "));
  const labels = { share_post: "shared a post", share_reel: "shared a reel", share_story: "shared a story", reaction: "reacted to a message",
    voice: "sent a voice message", generic: "sent a message", admin: "sent an admin message" };
  const history = cleanThread(r.threadMessages).slice(-10).map((m) => {
    const who = m.from === "me" ? "the creator" : "Them";
    return m.kind === "text" ? `${who}: ${m.text}` : `${who}: [${labels[m.kind]}]`;
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
    r.storyReplyNotCaptured
      ? "Their message: (They replied to your story, and the words of that reply weren't captured. Don't invent what they said.)"
      : `Their message: ${r.incomingText}`,
    openings.length ? `Do not start your reply the same way as these recent drafts: ${openings.join(" / ")}` : "",
    note,
  ].filter((l) => l !== "").join("\n");
  const notes = voiceSections();
  const voiceNotes = notes.length
    ? `\n\nthe creator's written voice notes, exactly as she keeps them in the Voice tab of her simulator. This is her voice source. Follow these notes; where they differ from the condensed rules above, her notes win:\n${notes.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")}`
    : "";
  const system = mode === "dm" ? `${rules.voice}\n${style}\n${rules.offers}${voiceNotes}` : `${rules.voice}\n${style}${voiceNotes}`;
  return { system, prompt };
}

// ---------- The actions ----------

const isReady = (r) => r.verdict !== "pending" && r.source !== "holdout" && (r.publishStatus === "unpublished" || r.publishStatus === "publish_failed");

const actions = {
  listitems(a) {
    const filter = oneOf(a.filter, FILTERS, "filter", "all");
    const all = [...rows()].sort((x, y) => x.id - y.id);
    const stats = {
      total: all.length,
      pending: all.filter((r) => r.verdict === "pending").length,
      reviewed: all.filter((r) => r.verdict !== "pending").length,
      approved: all.filter((r) => r.verdict === "approved").length,
      edited: all.filter((r) => r.verdict === "edited").length,
      needs_work: all.filter((r) => r.verdict === "needs_work").length,
      ready: all.filter(isReady).length,
      published: all.filter((r) => r.publishStatus === "published").length,
    };
    const keep = {
      all: () => true, pending: (r) => r.verdict === "pending", reviewed: (r) => r.verdict !== "pending",
      dm: (r) => r.kind === "dm", comment: (r) => r.kind === "comment", ready: isReady, published: (r) => r.publishStatus === "published",
    }[filter];
    const voice = currentVoice();
    return { items: all.filter(keep).map((r) => toItem(r, voice)), stats };
  },

  createitem(a) {
    const kind = oneOf(a.kind, KINDS, "kind");
    const source = oneOf(a.source, SOURCES, "source", "live");
    const row = {
      id: 0, kind, sender: text(a.sender, "sender", { max: 80 }), incomingText: text(a.incoming_text, "Their message", { min: 1, max: 4000 }),
      contextText: optText(a.context_text, "context", 4000) || null, source,
      actualReply: null, draftText: null, draftMode: null, draftWanted: null, revisionText: null, feedback: null,
      verdict: "pending", publishStatus: "unpublished", publishedText: null, publishError: null, publishedAt: null,
      mediaId: optText(a.media_id, "media_id", 120) || null, commentId: optText(a.comment_id, "comment_id", 120) || null,
      threadId: optText(a.thread_id, "thread_id", 120) || null, threadMessages: [], revealed: false,
      createdAt: Date.now(), reviewedAt: null,
    };
    const actual = optText(a.actual_reply, "actual_reply", 4000);
    if (source === "holdout" && actual) row.actualReply = actual;
    if (a.thread_messages !== undefined && a.thread_messages !== null) row.threadMessages = threadFrom(a.thread_messages);
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
    const mode = r.kind === "dm" ? "dm" : asked;
    r.draftWanted = { mode, variant, at: Date.now() };
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
    const pending = r.verdict === "pending" && r.publishStatus === "unpublished";
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
    if (r.source === "holdout") throw new DmError("This is a blind holdout: you already replied to it on Instagram, so there is nothing to publish.", 409);
    if (r.publishStatus === "published") throw new DmError("This one is already published.", 409);
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
    r.handedAt = Date.now();
    return { ok: true, status: "publishing", text: answer };
  },

  // Her Muse reports how the send went: ok marks it published with the text she approved, else it's ready to retry.
  confirmpublish(a) {
    const r = find(itemId(a.id));
    if (typeof a.ok !== "boolean") throw new DmError("ok must be true or false.");
    const detail = text(a.detail, "detail", { max: 1000 });
    if (a.ok) Object.assign(r, { publishStatus: "published", publishedText: r.revisionText ?? r.draftText ?? null, publishedAt: Date.now(), publishError: null });
    else Object.assign(r, { publishStatus: "publish_failed", publishError: detail || "Publishing did not go through." });
    r.handedAt = null;
    return { ok: true };
  },

  revealactual(a) {
    const r = find(itemId(a.id));
    if (!r.actualReply) throw new DmError("This item has no actual reply stored. It was not added as a blind holdout.", 409);
    if (!r.revisionText || r.verdict === "pending") throw new DmError("Save your revision first. The actual reply stays sealed until your own answer is locked in.", 409);
    r.revealed = true;
    return { actual_reply: r.actualReply };
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
    return { items: waiting.map((r) => ({ id: r.id, kind: r.kind, mode: r.draftWanted.mode, variant: r.draftWanted.variant, asked_at: iso(r.draftWanted.at), ...draftPrompt(r, r.draftWanted.mode, r.draftWanted.variant) })) };
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
    Object.assign(r, { draftText: draft, draftMode: mode, draftWanted: null, draftVoiceVersion: voiceVersion(sections) });
    return { draft_text: draft, draft_mode: mode };
  },
  /** A later import of a thread (Rose #770). Its messages replace the old ones. A story reply whose words weren't captured
   * before gets them now, if this import carries them; otherwise the message she's practicing on stays as it was. */
  updatethread(a) {
    const r = find(itemId(a.id));
    r.threadMessages = threadFrom(a.thread_messages);
    if (r.storyReplyNotCaptured || String(r.incomingText ?? "").trim().toLowerCase() === STORY_PLACEHOLDER) {
      const story = storyCapture(r.threadMessages, r.incomingText);
      r.incomingText = story.incomingText;
      r.storyReplyNotCaptured = story.notCaptured;
    }
    return { ok: true, item: toItem(r) };
  },
  /** Approved texts her Muse should send now, the order she tapped Send. */
  publishwanted() {
    const waiting = rows().filter((r) => r.publishStatus === "publishing").sort((x, y) => (x.handedAt || 0) - (y.handedAt || 0) || x.id - y.id);
    return {
      items: waiting.map((r) => ({
        id: r.id, kind: r.kind, sender: r.sender, incoming_text: r.incomingText, context_text: r.contextText ?? null, text: r.revisionText ?? "",
        media_id: r.mediaId ?? null, comment_id: r.commentId ?? null, thread_id: r.threadId ?? null, handed_at: iso(r.handedAt),
      })),
    };
  },
};

const READS = new Set(["listitems", "exporttraining", "getvoiceprofile", "getaccount", "getvoicesource", "draftswanted", "publishwanted"]);
const SETTINGS = new Set(["savevoiceprofile", "resetvoiceprofile", "savevoicesource"]);

export function registerDm(app) {
  app.post("/api/dm/:action", (req, res) => {
    const name = req.params.action;
    const run = Object.hasOwn(actions, name) ? actions[name] : null;
    if (!run) return res.status(404).json({ error: `There's no ${name} here.` });
    res.set("Cache-Control", "no-store");
    try {
      const out = run(req.body && typeof req.body === "object" ? req.body : {});
      if (SETTINGS.has(name)) store.saveSettings();
      else if (!READS.has(name)) store.saveDb();
      res.json(out);
    } catch (e) {
      if (!(e instanceof DmError)) console.error(`dm ${name}:`, e);
      res.status(e instanceof DmError ? e.status : 500).json({ error: e instanceof DmError ? e.message : "Something went wrong. Try again." });
    }
  });
}
