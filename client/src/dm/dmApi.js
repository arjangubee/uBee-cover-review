// The Chats screen's calls (1.14). Each dm_<name>(args) posts to /api/dm/<name> and answers what the server answers,
// so the screen reads the same in this app and in a Muse space, where the same names are the space's dm_ actions.
// Errors carry the server's plain-words reason.
import { post } from "../api.js";

const NAMES = ["listitems", "createitem", "generatedraft", "savereview", "publishitem", "confirmpublish", "revealactual", "deleteitem",
  "exporttraining", "getvoiceprofile", "savevoiceprofile", "resetvoiceprofile", "getaccount", "openthread", "setlabel", "importlabels",
  "editpublished", "markreadinbuild", "setchatsection", "savework", "requestsync", "getsync"];

export const api = Object.fromEntries(NAMES.map((n) => [`dm_${n}`, (args) => post(`/api/dm/${n}`, args)]));

// The limits the server checks, on the fields that send them, so a field stops where the server would refuse.
export const FIELDS = {
  dm_createitem: {
    sender: { name: "sender", maxLength: 80 },
    incoming_text: { name: "incoming_text", maxLength: 4000, required: true },
    context_text: { name: "context_text", maxLength: 4000 },
    media_id: { name: "media_id", maxLength: 120 },
    comment_id: { name: "comment_id", maxLength: 120 },
    thread_id: { name: "thread_id", maxLength: 120 },
    actual_reply: { name: "actual_reply", maxLength: 4000 },
  },
  dm_savereview: {
    revision_text: { name: "revision_text", maxLength: 4000 },
    feedback: { name: "feedback", maxLength: 2000 },
  },
  dm_editpublished: {
    text: { name: "text", maxLength: 2000, required: true },
  },
};

/** The line under Ready to Publish that says where a send goes. */
export const sendsAs = (handle) =>
  handle ? `Publishing sends it to Instagram as @${handle}, with no further review.` : "Publishing sends it to Instagram from your account, with no further review.";
