// The Beeline screen's text rules (1.16), the same as Arjang's Beeline page, with no React in it so the smoke test can
// check them. A message body becomes safe HTML: paragraphs, lists, **bold**, `code`, ``` blocks and links. Highlights:
// Arjang's name in an agent's message and ==words== are yellow; ==#7 words== carries ask 7's number and takes its color
// while ask 7 is open (askCss), and reads as plain words once it's closed. Marks inside code never change.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// No space just inside the marks, no = or letter right outside them.
const ASK_MARK = /(^|[^=\p{L}\p{N}])==#(\d{1,4})[ \t]+(\S(?:(?:(?!==).)*?\S)?)==(?![=\p{L}\p{N}])/gu;
const HL_MARK = /(^|[^=\p{L}\p{N}])==(?!#\d{1,4}[ \t])(\S(?:(?:(?!==).)*?\S)?)==(?![=\p{L}\p{N}])/gu;
// A link stops before "==", so a highlight can end right after one.
const URL_RE = /\bhttps?:\/\/(?:(?!==)[^\s<])*[^\s<.,;:!?)\]'"=]/g;

const nameRe = (name) => {
  const n = esc(String(name || "Arjang").trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // In escaped text: "Arjang", "Arjang's" (the ' is &#39; by now) and "Arjang (owner)".
  return new RegExp("(^|[^\\p{L}\\p{N}])(" + n + "(?:&#39;s|’s)?(?: \\(owner\\))?)(?![\\p{L}\\p{N}])", "giu");
};

function marks(h, o) {
  h = h.replace(ASK_MARK, (_, pre, n, t) => pre + '<mark class="blAsk" data-ask="' + Number(n) + '"><span class="blAskN">' + Number(n) + "</span>" + t + "</mark>");
  h = h.replace(HL_MARK, (_, pre, t) => pre + '<mark class="blHl">' + t + "</mark>");
  if (o && o.agent) {
    // Only outside the marks already made, so a highlight never sits inside another one.
    const re = nameRe(o.owner);
    h = h.split(/(<mark[^>]*>.*?<\/mark>)/).map((seg, i) => (i % 2 ? seg : seg.replace(re, (_, pre, nm) => pre + '<mark class="blHl">' + nm + "</mark>"))).join("");
  }
  return h;
}

export function inline(s, o) {
  return String(s).split(/(`[^`]+`)/).map((seg, i) => {
    if (i % 2) return "<code>" + esc(seg.slice(1, -1)) + "</code>";
    // Links wait behind placeholders, so neither a mark nor his name can land inside an address.
    const links = [];
    let h = esc(seg).replace(URL_RE, (u) => { links.push(u); return "\u0000" + (links.length - 1) + "\u0000"; });
    h = marks(h, o);
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return h.replace(/\u0000(\d+)\u0000/g, (_, n) => '<a href="' + links[n] + '" target="_blank" rel="noopener noreferrer">' + links[n] + "</a>");
  }).join("");
}

// o.agent: an agent wrote it, so his name is highlighted too. o.owner: his name (Arjang unless the room says otherwise).
export function fmt(text, o) {
  return String(text ?? "").split(/```/).map((part, i) => {
    if (i % 2 === 1) return "<pre><code>" + esc(part.replace(/^[a-z0-9-]*\n/i, "")) + "</code></pre>";
    return part.split(/\n{2,}/).filter((b) => b.trim() !== "").map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
        return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*[-*•]\s+/, ""), o) + "</li>").join("") + "</ul>";
      }
      return "<p>" + lines.map((l) => (/^#{1,6}\s+/.test(l) ? "<strong>" + inline(l.replace(/^#{1,6}\s+/, ""), o) + "</strong>" : inline(l, o))).join("<br>") + "</p>";
    }).join("");
  }).join("");
}

const HEX = /^#[0-9a-f]{6}$/i;

// One rule per open ask: its words take its color and show its number. Everything else marked with a number stays plain.
export function askCss(asks) {
  return (Array.isArray(asks) ? asks : []).filter((q) => Number(q.n) > 0 && HEX.test(q.color || "")).map((q) => {
    const s = '.blRoot mark.blAsk[data-ask="' + Number(q.n) + '"]';
    return s + "{--ask:" + q.color + ";background:var(--ask);color:#000;padding:0 3px}" + s + " .blAskN{display:inline-block}" + s + " a{color:#000}";
  }).join("\n");
}

// "[image]", "[2 videos]" and "[file]" stand in for a message with no words.
export const PLACEHOLDER = /^\[(\d+ )?(images?|videos?|files?)\]$/;

export function ago(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 45) return "just now";
  if (s < 90) return "1 min ago";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

export function span(sec) {
  const s = Math.max(1, Math.round(Number(sec) || 0));
  if (s < 90) return s + " s";
  if (s < 5400) return Math.round(s / 60) + " min";
  return Math.round(s / 3600) + " h";
}

export function sizeText(bytes) {
  const b = Number(bytes) || 0;
  return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
}

export function durText(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// Same as Beeline's agent key: the name, single-spaced, trimmed, lower case.
export const agentKey = (name) => String(name || "").replace(/\s+/g, " ").trim().toLowerCase();

// One light per chat in the room: listening, reading, working, in the room, away, or left.
export function sessionState(s) {
  if (s.left_ago != null) return "left";
  if (s.state === "working" && s.ago < 1800) return "working";
  if (s.state === "listening" && s.ago < 90) return "listening";
  if (s.state === "thinking" && s.ago < 600) return "thinking";
  if (s.ago < 180) return "here";
  return "away";
}

export function sessionText(s, k) {
  if (k === "left") return "Left " + ago(s.left_ago);
  if (k === "working") return "Working" + (s.note ? ": " + s.note : "");
  if (k === "listening") return "Listening";
  if (k === "thinking") return "Reading and replying";
  if (k === "here") return "In the room";
  return "Away, seen " + ago(s.ago);
}

// How a poke reached the agent, in one line, from Beeline's answer to the poke and the relay on Arjang's Mac.
export function pokeReach(r, name, again, relay) {
  const head = again ? "Poked " + name + " again." : "Poked " + name + ".";
  if (!r) return head;
  if (r.wake === "live" || (r.live && r.wake !== "queued")) return head + " It's in the room, so it sees it right away.";
  if (r.wake === "queued") {
    if (!relay || relay.ago == null) return head + " Its chat starts once the relay on your Mac is set up.";
    if (relay.problem === "signin") return head + " The relay on your Mac needs Claude signed in again before it can start the chat.";
    if (relay.ago > 180) return head + " Your Mac's relay was last seen " + ago(relay.ago) + ", so its chat starts when your Mac wakes up.";
    return head + " Starting its chat from your Mac.";
  }
  if (r.checkin_every) return head + " It sees it at its next check-in, about every " + span(r.checkin_every) + ".";
  if (r.checkin_ago != null) return head + " It sees it at its next check-in. Its last one was " + ago(r.checkin_ago) + ".";
  return head + " It can't be reached outside the room yet, so it sees it when it comes back.";
}

// Beeline's own words for what went wrong ("Not sent: ..." comes ready to show), or plain words for its codes.
const CODES = {
  bad_key: "this device was disconnected",
  no_agent: "it isn't in this room anymore",
  no_ask: "it's already closed",
  no_message: "that message is gone",
  no_room: "the room isn't there anymore",
};
export const why = (e) => CODES[String(e || "")] || String(e || "something went wrong").replace(/^Not sent: /, "");
