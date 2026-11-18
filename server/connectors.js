import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, classifyFile } from "./services.js";
import { DUMP_DIR, LIBRARY_DIR, store } from "./store.js";

// Connector registry. The user's Muse reads this list (GET /api/connectors)
// and walks the creator through each setup. Review NEVER blocks on any connector.
export const CONNECTORS = [
  {
    id: "google_drive",
    name: "Google Drive",
    required: false,
    purpose: "Creates the uBee folder system and the DUMP folder, sorts DUMP on done, stores buckets and approved photos.",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    claudeSteps: [
      "Ask the creator to connect Google Drive in Muse Settings, Connectors.",
      "Call POST /api/drive/folders to create the folder plan (or record the dry-run plan).",
      "Tell the creator: throw everything into the folder named DUMP.",
      "When the creator says done, call POST /api/dump/sort.",
    ],
  },
  {
    id: "spotify",
    name: "Spotify",
    required: false,
    purpose: "Song suggestions from the creator's own library. Falls back to Instagram trending when not connected.",
    env: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"],
    claudeSteps: [
      "Ask the creator to connect Spotify in Muse Settings, Connectors.",
      "Send the creator to GET /api/connectors/spotify/auth-url, then store the refresh token in .env.",
      "Call POST /api/connectors/spotify/sync-library with the creator's saved tracks or playlist picks.",
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    required: false,
    purpose: "Trending songs by default, and voice profile learned from the creator's previous captions, only with explicit consent.",
    env: [],
    claudeSteps: [
      "Ask the creator to connect Instagram and Instagram Messages in Muse Settings, Connectors.",
      "Ask for caption consent in plain words. Only on yes, set captionConsent via POST /api/connectors/instagram/consent.",
      "Pull the creator's recent captions through the Instagram connector and POST them to /api/voice/samples.",
      "Refresh trending songs through the Instagram connector and POST them to /api/trending/refresh.",
    ],
  },
];

export const DRIVE_ROOT_NAME = "uBee Cover Review";
export const DRIVE_FOLDERS = ["DUMP", ...BUCKETS, "Approved", "Rejected"];

// uBee client workspace: a client does not get folders in
// their own Drive. Their Muse creates a working space inside the uBee
// shared Drive, in that creator's designated folder, organized for the
// creator to browse pleasantly: friendly names, a Start Here folder, and
// her picks separated from raw dumps.
export const CLIENT_FOLDERS = [
  "Start Here",
  "DUMP",
  "New To Review",
  "Images",
  "Videos",
  "Quotes",
  "Music",
  "Voice Profile",
  "Captions",
  "Approved - Her Picks",
  "Posted",
];

export function drivePlan() {
  const ws = store.settings.workspace || { mode: "own_drive", clientName: null };
  if (ws.mode === "ubee_shared") {
    const name = ws.clientName || "Creator";
    return {
      mode: "ubee_shared",
      location: "uBee shared Drive",
      root: `Creators / ${name} / Cover Review`,
      rootName: "Cover Review",
      parentPath: `uBee shared Drive / Creators / ${name}`,
      folders: CLIENT_FOLDERS,
      note: `This creator is a uBee client. Everything saves inside the uBee shared Drive in her designated folder, Creators / ${name}, never in her personal Drive. Keep it tidy and pleasant for her to browse: new work in New To Review, her approvals in Approved - Her Picks, finished posts in Posted.`,
      created: store.settings.connectors.google_drive.folders || {},
    };
  }
  return { mode: "own_drive", location: "creator's own Drive", root: DRIVE_ROOT_NAME, folders: DRIVE_FOLDERS, created: store.settings.connectors.google_drive.folders || {} };
}

// Creates Drive folders when Google credentials are present.
// Without credentials it records the exact plan so the creator's Muse can
// create the same folders through its own Google Drive connector instead.
export async function createDriveFolders() {
  const plan = drivePlan();
  if (plan.mode === "ubee_shared") {
    store.settings.connectors.google_drive.status = "plan_ready";
    store.saveSettings();
    return { mode: "plan", message: "uBee client workspace: the agency Muse creates these folders inside the uBee shared Drive through its Drive connector, then confirms the ids here. A client's own API credentials never write to the shared Drive.", plan };
  }
  const hasCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN);
  if (!hasCreds) {
    store.settings.connectors.google_drive.status = "plan_ready";
    store.saveSettings();
    return { mode: "plan", message: "No Google API credentials in .env. The creator's Muse should create these folders through its Google Drive connector, then POST the folder ids to /api/drive/folders/confirm.", plan: drivePlan() };
  }
  // With credentials, use the Drive REST API directly with the refresh token.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();
  async function createFolder(name, parentId) {
    const metadata = { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) };
    const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    if (!r.ok) throw new Error(`Drive folder create failed for ${name}: ${r.status}`);
    return (await r.json()).id;
  }
  const rootId = await createFolder(DRIVE_ROOT_NAME, null);
  const folders = {};
  for (const name of DRIVE_FOLDERS) folders[name] = await createFolder(name, rootId);
  store.settings.connectors.google_drive = { status: "connected", rootFolderId: rootId, folders };
  store.saveSettings();
  return { mode: "created", rootFolderId: rootId, folders };
}

// Sort the local DUMP folder into local library buckets.
// When Drive is connected, the creator's Muse mirrors this same
// classification in Drive using classify results returned here.
export function sortLocalDump() {
  const moved = [];
  if (!existsSync(DUMP_DIR)) return moved;
  for (const name of readdirSync(DUMP_DIR)) {
    if (name.startsWith(".")) continue;
    const bucket = classifyFile(name);
    const destDir = join(LIBRARY_DIR, bucket);
    mkdirSync(destDir, { recursive: true });
    renameSync(join(DUMP_DIR, name), join(destDir, name));
    const isPhoto = bucket === "Images";
    moved.push({ name, bucket, queuedForReview: isPhoto });
    if (isPhoto) store.addItem({ title: name, imageUrl: `/api/library/Images/${encodeURIComponent(name)}`, source: "dump" });
  }
  return moved;
}

export function spotifyAuthUrl() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) return null;
  const params = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI || "http://localhost:4173/api/connectors/spotify/callback",
    scope: "user-library-read playlist-read-private",
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}
