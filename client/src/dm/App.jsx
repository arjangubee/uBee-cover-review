import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./SafeAreaTopScrim.jsx";
import { api, FIELDS, sendsAs } from "./dmApi.js";
import { currentSession } from "../session.js";

// The Chats screen (1.14): a practice inbox in Instagram's style, ported from
// the Reply Practice Simulator. Its calls are in dmApi.js: /api/dm/<name>
// here, and the space's dm_ actions in a Muse space. With no model on the
// server, a draft can be waiting for Muse (item.draft_wanted), and Send hands
// the approved text to Muse to send.

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function handleOf(item) {
  return item.sender.replace(/^@/, "");
}

function kindLabel(kind) {
  return kind === "dm" ? "DM" : "Comment";
}

function sourceLabel(source) {
  if (source === "live") return "Live queue";
  if (source === "holdout") return "Blind holdout";
  return "Pasted";
}

function verdictLabel(verdict) {
  if (verdict === "approved") return "Approved as-is";
  if (verdict === "edited") return "Edited";
  if (verdict === "needs_work") return "Needs work";
  return "Waiting";
}

/** "OCT 27 AT 1:29 PM" : the IG date separator format. */
function igDateSeparator(iso) {
  const d = new Date(iso);
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = d.getDate();
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
  return `${month} ${day} AT ${time}`;
}

function sameLocalDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function shortTime(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// People: profile data is loaded per space; no profiles are bundled here.
// ---------------------------------------------------------------------------

const PROFILES = {};

function profileOf(handle) {
  return PROFILES[handle.toLowerCase()] ?? {};
}

// ---------------------------------------------------------------------------
// Small IG-style building blocks
// ---------------------------------------------------------------------------

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)",
  "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",
  "linear-gradient(135deg,#405de6,#5851db,#833ab4,#c13584)",
  "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
  "linear-gradient(135deg,#11998e,#38ef7d)",
  "linear-gradient(135deg,#8e2de2,#4a00e0)",
];

// No profile photos are bundled in the public copy; avatars always use the monogram fallback.

// One unique color per person, hashed from the handle so the same person
// always gets the same color in the inbox, the chat and the profile view.
// It backs the photo while it loads, replaces it if it ever fails, and
// forms the ring when a ring is shown.
const AVATAR_COLORS = [
  "#ef476f",
  "#f78c6b",
  "#e9c46a",
  "#8ac926",
  "#43aa8b",
  "#2ec4b6",
  "#118ab2",
  "#4361ee",
  "#7209b7",
  "#b5179e",
  "#ff5d8f",
  "#6a994e",
];

function colorForHandle(handle) {
  const h = handle.replace(/^@/, "").toLowerCase();
  let hash = 0;
  for (let i = 0; i < h.length; i++) hash = (hash * 31 + h.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0] ?? "";
}

function Avatar({ handle, size = 44, ring = false }) {
  const h = (handle || "?").replace(/^@/, "");
  const color = colorForHandle(h);
  const initials = h
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
  const circle = (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.max(11, Math.round(size * 0.36)),
      }}
    >
      {initials || "?"}
    </span>
  );
  if (!ring) return circle;
  return (
    <span
      className="inline-flex shrink-0 rounded-full"
      style={{ boxShadow: `0 0 0 2px var(--bg), 0 0 0 4.5px ${color}` }}
    >
      {circle}
    </span>
  );
}

function VerifiedBadge({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label="Verified"
      role="img"
      className="inline-block shrink-0"
    >
      <path
        fill="#0095f6"
        d="M12 1.7l2.5 2 3.3-.3 1.1 3.1 3 1.4-1.2 3.1 1.2 3.1-3 1.4-1.1 3.1-3.3-.3-2.5 2-2.5-2-3.3.3-1.1-3.1-3-1.4L3.3 12 2.1 8.9l3-1.4 1.1-3.1 3.3.3z"
      />
      <path fill="#fff" d="M10.9 15.9l-3-3 1.4-1.4 1.6 1.6 4-4L16.3 10.5z" />
    </svg>
  );
}

function PathIcon({ size = 24, className, children, filled }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

const IconBack = (p) => (
  <PathIcon {...p}>
    <path d="M15 5l-7 7 7 7" fill="none" />
  </PathIcon>
);
const IconTag = (p) => (
  <PathIcon {...p}>
    <path
      d="M3.5 3.5H12L20.5 12a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L3.5 12z"
      fill="none"
    />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </PathIcon>
);
const IconCamera = (p) => (
  <PathIcon {...p} filled>
    <path d="M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2zm9-1.4l-1.7-.4-1.2-2A2 2 0 0 0 16.3 3H7.7a2 2 0 0 0-1.8 1.4l-1.2 2L3 6.8A2 2 0 0 0 2 8.7v9.5A2.8 2.8 0 0 0 4.8 21h14.4A2.8 2.8 0 0 0 22 18.2V8.7a2 2 0 0 0-1-1.9zM12 17.5A5.5 5.5 0 1 1 12 6.5a5.5 5.5 0 0 1 0 11z" />
  </PathIcon>
);
const IconMic = (p) => (
  <PathIcon {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" />
  </PathIcon>
);
const IconImage = (p) => (
  <PathIcon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M4 18l5.5-5 3.5 3.5L17 12l3 3.5" fill="none" />
  </PathIcon>
);
const IconSticker = (p) => (
  <PathIcon {...p}>
    <path d="M12 3a9 9 0 1 0 9 9h-5a4 4 0 0 1-4-4V3z" fill="none" />
    <path d="M8.5 10h.01M15 10h.01M8.8 14.2a4.5 4.5 0 0 0 5.4 1" fill="none" />
  </PathIcon>
);
const IconPlusCircle = (p) => (
  <PathIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" fill="none" />
  </PathIcon>
);
const IconSend = (p) => (
  <PathIcon {...p} filled>
    <path d="M21.9 2.1L2.7 10.6c-.9.4-.9 1.7.1 2l6.4 2.1 2.1 6.4c.3 1 1.6 1 2 .1l8.6-19.1zM11 13.5l-1.3 4.9-1.5-4.6 9.3-7.4z" />
  </PathIcon>
);
const IconSearch = (p) => (
  <PathIcon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.8-3.8" fill="none" />
  </PathIcon>
);
const IconPerson = (p) => (
  <PathIcon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" />
  </PathIcon>
);
const IconBell = (p) => (
  <PathIcon {...p}>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 3h-15z" fill="none" />
    <path d="M10 21a2.2 2.2 0 0 0 4 0" fill="none" />
  </PathIcon>
);
const IconBellOff = (p) => (
  <PathIcon {...p}>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 3h-15zM4 4l16 16" fill="none" />
  </PathIcon>
);
const IconDots = (p) => (
  <PathIcon {...p} filled>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </PathIcon>
);
const IconChevronRight = (p) => (
  <PathIcon {...p}>
    <path d="M9 5l7 7-7 7" fill="none" />
  </PathIcon>
);
const IconLock = (p) => (
  <PathIcon {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" />
  </PathIcon>
);
const IconPlay = (p) => (
  <PathIcon {...p} filled>
    <path d="M8 5.5v13l11-6.5z" />
  </PathIcon>
);
const IconFlag = (p) => (
  <PathIcon {...p}>
    <path d="M5 21V4m0 1h12l-2.5 3.5L17 12H5" fill="none" />
  </PathIcon>
);
const IconCalendar = (p) => (
  <PathIcon {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" />
  </PathIcon>
);
const IconCart = (p) => (
  <PathIcon {...p}>
    <path d="M3 4h2.5l2.2 11h10.8l2-8H7" fill="none" />
    <circle cx="10" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
  </PathIcon>
);
const IconDollar = (p) => (
  <PathIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path
      d="M12 6.5v11M15 9c-.6-1-1.7-1.4-3-1.4-1.7 0-3 1-3 2.3 0 3 6 1.7 6 4.5 0 1.3-1.3 2.3-3 2.3-1.3 0-2.4-.5-3-1.5"
      fill="none"
    />
  </PathIcon>
);
const IconTruck = (p) => (
  <PathIcon {...p}>
    <path d="M2.5 6h11v10h-11zM13.5 10h4l3.5 3.5V16h-7.5" fill="none" />
    <circle cx="6.5" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </PathIcon>
);
const IconReplyArrow = (p) => (
  <PathIcon {...p}>
    <path d="M9 7L4 12l5 5M4 12h9a7 7 0 0 1 7 7v1" fill="none" />
  </PathIcon>
);
const IconTrash = (p) => (
  <PathIcon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6" fill="none" />
  </PathIcon>
);
const IconReport = (p) => (
  <PathIcon {...p}>
    <path d="M12 3.5l9 16.5H3z" fill="none" />
    <path d="M12 10v4.5M12 17.2h.01" fill="none" />
  </PathIcon>
);
const IconPin = (p) => (
  <PathIcon {...p}>
    <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" fill="none" />
  </PathIcon>
);
const IconTranslate = (p) => (
  <PathIcon {...p}>
    <path
      d="M4 6h9M8.5 4v2c0 3.5-2 6.5-4 8M6 9.5c1 2.5 3.2 5 6 6.5M13 20l4.5-9L22 20M14.8 17h5.4"
      fill="none"
    />
  </PathIcon>
);
const IconClockDots = (p) => (
  <PathIcon {...p}>
    <circle cx="12" cy="12" r="8.5" strokeDasharray="2.5 3.4" />
    <path d="M12 8v4.5l3 2" fill="none" />
  </PathIcon>
);
const IconGroupPlus = (p) => (
  <PathIcon {...p}>
    <circle cx="9" cy="9" r="3.5" />
    <path d="M3 19.5a6 6 0 0 1 12 0M18.5 5.5v5M16 8h5" fill="none" />
  </PathIcon>
);
const IconHelpBubble = (p) => (
  <PathIcon {...p}>
    <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" fill="none" />
    <path d="M12 8v5M12 16.5h.01" fill="none" />
  </PathIcon>
);
const IconNickname = (p) => (
  <PathIcon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M4.5 19a5.5 5.5 0 0 1 11 0M16 16.5h5M18.5 14v5" fill="none" />
  </PathIcon>
);
const IconGrid = (p) => (
  <PathIcon {...p}>
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" />
  </PathIcon>
);
const IconReels = (p) => (
  <PathIcon {...p}>
    <rect x="3.5" y="4" width="17" height="17" rx="4" />
    <path
      d="M3.5 9.5h17M8.5 4l3 5.5M14 4l3 5.5M10.5 13.5l4.5 2.7-4.5 2.7z"
      fill="none"
    />
  </PathIcon>
);
const IconLink = (p) => (
  <PathIcon {...p}>
    <path
      d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.7-1.7"
      fill="none"
    />
  </PathIcon>
);
const IconCheck = (p) => (
  <PathIcon {...p}>
    <path d="M4.5 12.5l5 5 10-11" fill="none" />
  </PathIcon>
);
const IconSparkle = (p) => (
  <PathIcon {...p} filled>
    <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" />
  </PathIcon>
);
const IconEdit = (p) => (
  <PathIcon {...p}>
    <path
      d="M4.5 19.5L5.6 15 16.9 3.7a2.05 2.05 0 0 1 2.9 0l.5.5a2.05 2.05 0 0 1 0 2.9L9 18.4z"
      fill="none"
    />
    <path d="M14.5 6l3.5 3.5" fill="none" />
  </PathIcon>
);
const IconCopy = (p) => (
  <PathIcon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path
      d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"
      fill="none"
    />
  </PathIcon>
);
const IconSliders = (p) => (
  <PathIcon {...p}>
    <path d="M4 8h9M17 8h3M4 16h3M11 16h9" fill="none" />
    <circle cx="15" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </PathIcon>
);
const IconChevronDown = (p) => (
  <PathIcon {...p}>
    <path d="M5 9l7 7 7-7" fill="none" />
  </PathIcon>
);
const IconX = (p) => (
  <PathIcon {...p}>
    <path d="M5 5l14 14M19 5L5 19" fill="none" />
  </PathIcon>
);

function Badge({ children, tone }) {
  const styles = {
    accent: { background: "var(--accent-soft)", color: "var(--accent)" },
    sage: { background: "var(--sage-soft)", color: "var(--sage)" },
    gold: { background: "var(--gold-soft)", color: "var(--gold)" },
    dim: { background: "var(--surface-alt)", color: "var(--dim)" },
  };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

export function App() {
  const [tab, setTab] = useState("practice");
  const [selectedId, setSelectedId] = useState(null);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ["items", "all"],
    queryFn: () => api.dm_listitems({ filter: "all" }),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Every 30 seconds, and every 5 while a draft or a send is waiting on Muse.
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (i) => i.draft_wanted || i.publish_status === "publishing",
      )
        ? 5_000
        : 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!justRefreshed) return;
    const id = window.setTimeout(() => setJustRefreshed(false), 2500);
    return () => window.clearTimeout(id);
  }, [justRefreshed]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["items"] });
    const result = await itemsQuery.refetch();
    setNowTick(Date.now());
    if (!result.isError) {
      setJustRefreshed(true);
    }
  };

  const updatedLabel = (() => {
    if (itemsQuery.isFetching && !itemsQuery.isPending) return "Refreshing…";
    if (justRefreshed) return "Refreshed ✓ · you're up to date";
    if (!itemsQuery.dataUpdatedAt) return "Not loaded yet";
    const secs = Math.max(
      0,
      Math.floor((nowTick - itemsQuery.dataUpdatedAt) / 1000),
    );
    const timeStr = new Date(itemsQuery.dataUpdatedAt).toLocaleTimeString(
      undefined,
      { hour: "numeric", minute: "2-digit" },
    );
    if (secs < 10) return `Updated just now · ${timeStr}`;
    if (secs < 60) return `Updated ${secs}s ago · ${timeStr}`;
    const mins = Math.floor(secs / 60);
    return `Updated ${mins}m ago · ${timeStr}`;
  })();

  const items = itemsQuery.data?.items ?? [];
  const stats = itemsQuery.data?.stats;

  const tabs = [
    { id: "practice", label: "Chats" },
    { id: "ready", label: "Ready to Publish" },
    { id: "add", label: "Add" },
    { id: "training", label: "Training" },
    { id: "voice", label: "Voice" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-2xl px-0 pb-10 sm:px-4">
        <nav
          aria-label="Sections"
          className="flex flex-wrap gap-2 px-4 pt-4 pb-1 sm:px-0"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold"
              style={
                tab === t.id
                  ? { background: "#f5f5f5", color: "#000" }
                  : {
                      background: "var(--surface)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {t.label}
              {t.id === "practice" && stats && stats.pending > 0
                ? ` · ${stats.pending}`
                : ""}
              {t.id === "ready" && stats && stats.ready > 0
                ? ` · ${stats.ready}`
                : ""}
            </button>
          ))}
        </nav>

        <div
          className="mx-4 mt-2 flex items-center gap-3 rounded-[var(--radius)] px-3.5 py-2.5 sm:mx-0"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={handleRefresh}
            disabled={itemsQuery.isFetching}
            aria-label="Refresh queue"
            className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            <span
              aria-hidden="true"
              className={
                itemsQuery.isFetching
                  ? "inline-block animate-spin"
                  : "inline-block"
              }
            >
              ↻
            </span>
            {itemsQuery.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <span
            aria-live="polite"
            className="min-w-0 truncate text-sm"
            style={{
              color: justRefreshed ? "var(--sage)" : "var(--dim)",
              fontWeight: justRefreshed ? 600 : 400,
            }}
          >
            {updatedLabel}
          </span>
          {stats ? (
            <span className="ml-auto hidden shrink-0 text-xs text-[var(--dim)] sm:block">
              {stats.total} in queue
            </span>
          ) : null}
        </div>

        {itemsQuery.isPending && tab !== "add" && tab !== "voice" ? (
          <p className="py-16 text-center text-sm text-[var(--dim)]">
            Loading your queue…
          </p>
        ) : itemsQuery.error && tab !== "add" && tab !== "voice" ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[var(--dim)]">
              The queue could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => itemsQuery.refetch()}
              className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {tab === "practice" && (
              <PracticeView
                items={items}
                stats={stats}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onGoAdd={() => setTab("add")}
                onGoTraining={() => setTab("training")}
                onRefresh={handleRefresh}
                isRefreshing={itemsQuery.isFetching}
              />
            )}
            {tab === "ready" && (
              <ReadyView
                items={items}
                onOpen={(id) => {
                  setSelectedId(id);
                  setTab("practice");
                }}
                onRefresh={handleRefresh}
                isRefreshing={itemsQuery.isFetching}
              />
            )}
            {tab === "add" && (
              <AddView
                onCreated={(id) => {
                  setSelectedId(id);
                  setTab("practice");
                }}
              />
            )}
            {tab === "training" && <TrainingView items={items} stats={stats} />}
            {tab === "voice" && <VoiceView />}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice: IG-style inbox of chats (DMs open the chat view; comments open
// the review card below the list, as before)
// ---------------------------------------------------------------------------

function PracticeView({
  items,
  stats,
  selectedId,
  onSelect,
  onGoAdd,
  onGoTraining,
  onRefresh,
  isRefreshing,
}) {
  const [kindFilter, setKindFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (kindFilter !== "all" && i.kind !== kindFilter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          handleOf(i).toLowerCase().includes(q) ||
          i.incoming_text.toLowerCase().includes(q)
        );
      }),
    [items, kindFilter, search],
  );

  const selected =
    filtered.find((i) => i.id === selectedId) ??
    filtered.find((i) => i.verdict === "pending") ??
    filtered[0];

  const nextPending = selected
    ? (filtered.find((i) => i.verdict === "pending" && i.id !== selected.id) ??
      null)
    : null;

  if (items.length === 0) {
    return (
      <section className="px-4 py-10 sm:px-0">
        <h1 className="text-3xl font-bold leading-tight">Chats</h1>
        <p className="mt-3 text-base leading-relaxed text-[var(--dim)]">
          This is where Muse drafts replies to real DMs and comments for you to
          review, one by one. Nothing reaches Instagram until you tap Publish on
          an answer you approved. Your revision of each draft is saved as the
          source of truth for retraining.
        </p>
        <p className="mt-3 text-base leading-relaxed text-[var(--dim)]">
          Add a message that is still waiting for a reply and Muse will draft an
          answer in your voice. For a true blind test, add a thread you already
          answered as a blind holdout: what you really said stays sealed until
          your revision is saved.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGoAdd}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Add your first message
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh queue"
            className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            {isRefreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </section>
    );
  }

  if (chatOpen && selected && selected.kind === "dm") {
    return (
      <ChatView
        key={selected.id}
        item={selected}
        onBack={() => setChatOpen(false)}
        onNext={
          nextPending ? () => onSelect(nextPending.id) : () => onSelect(null)
        }
        hasNext={nextPending != null}
        onGoTraining={onGoTraining}
      />
    );
  }

  const reviewedPct =
    stats && stats.total > 0
      ? Math.round((stats.reviewed / stats.total) * 100)
      : 0;

  return (
    <section className="pt-3">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
        <h1 className="text-2xl font-bold leading-tight">Chats</h1>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh queue"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          <span
            aria-hidden="true"
            className={
              isRefreshing ? "inline-block animate-spin" : "inline-block"
            }
          >
            ↻
          </span>
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {stats && (
        <p className="mt-1 px-4 text-sm text-[var(--dim)] sm:px-0">
          {stats.pending} waiting · {stats.reviewed} reviewed · {stats.ready}{" "}
          ready to publish · {stats.published} published
        </p>
      )}
      {stats && (
        <div
          className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full sm:mx-0"
          style={{ background: "var(--surface-alt)" }}
          role="progressbar"
          aria-valuenow={reviewedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of queue reviewed"
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${reviewedPct}%`, background: "var(--sage)" }}
          />
        </div>
      )}

      <div className="px-4 sm:px-0">
        <label className="mt-4 flex items-center gap-2.5 rounded-full bg-[var(--surface-alt)] px-4 py-2.5">
          <IconSearch size={18} className="shrink-0 text-[var(--dim)]" />
          <span className="sr-only">Search chats</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search chats"
            className="w-full bg-transparent text-base outline-none placeholder:text-[var(--dim)]"
          />
        </label>
      </div>

      <div
        className="mt-3 flex gap-2 px-4 sm:px-0"
        role="group"
        aria-label="Filter queue"
      >
        {[
          { id: "all", label: "All" },
          { id: "dm", label: "DMs" },
          { id: "comment", label: "Comments" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={kindFilter === f.id}
            onClick={() => setKindFilter(f.id)}
            className="rounded-full px-3.5 py-1.5 text-sm font-medium"
            style={
              kindFilter === f.id
                ? { background: "#f5f5f5", color: "#000" }
                : {
                    background: "var(--surface)",
                    color: "var(--dim)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="mt-2">
        {filtered.map((item) => {
          const handle = handleOf(item);
          const profile = profileOf(handle);
          const isSelected =
            selected?.id === item.id && item.kind === "comment";
          const unread = item.verdict === "pending";
          const statusText =
            item.publish_status === "published"
              ? "Published ✓"
              : item.publish_status === "publishing"
                ? "Publishing…"
                : item.publish_status === "publish_failed"
                  ? "Publish failed"
                  : item.verdict === "pending"
                    ? item.draft_text
                      ? "Draft ready"
                      : item.draft_wanted
                        ? "Muse is drafting"
                        : "Waiting"
                    : verdictLabel(item.verdict);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  if (item.kind === "dm") setChatOpen(true);
                }}
                aria-current={isSelected ? "true" : undefined}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--surface)]"
                style={
                  isSelected ? { background: "var(--surface)" } : undefined
                }
              >
                <Avatar handle={handle} size={52} ring={unread} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="truncate text-base"
                      style={{ fontWeight: unread ? 700 : 500 }}
                    >
                      {handle || "Unknown"}
                    </span>
                    {profile.verified && <VerifiedBadge size={13} />}
                    <span className="ml-auto shrink-0 text-xs text-[var(--dim)]">
                      · {shortTime(item.created_at)}
                    </span>
                  </span>
                  <span
                    className="mt-0.5 block truncate text-sm"
                    style={{
                      color: unread ? "var(--text)" : "var(--dim)",
                      fontWeight: unread ? 600 : 400,
                    }}
                  >
                    {item.incoming_text}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-[var(--dim)]">
                    <span>
                      {item.kind === "dm" ? "DM" : "Comment"} · {statusText}
                    </span>
                    <SimLabel itemId={item.id} />
                  </span>
                </span>
                {unread && (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-[var(--dim)]">
          Nothing matches that search.
        </p>
      )}

      {selected && selected.kind === "comment" ? (
        <div className="px-4 sm:px-0">
          <ItemCard
            key={selected.id}
            item={selected}
            onNext={
              nextPending
                ? () => onSelect(nextPending.id)
                : () => onSelect(null)
            }
            hasNext={nextPending != null}
            onGoTraining={onGoTraining}
          />
        </div>
      ) : selected && selected.kind === "dm" ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--dim)] sm:px-0">
          Tap the chat above to open it like an Instagram DM.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chat labels (Flag / Booked / Lead / Ordered / Paid / Shipped), kept in
// this browser only, like the rest of the simulator's chrome.
// ---------------------------------------------------------------------------

const LABEL_KEY = "reply-sim-labels";
// Labels are kept on this device, by chat number. Since 1.15.0 each account's chats are numbered on their own, so another
// account's labels go under its handle; the owner's stay where they always were.
const labelKey = () => { const s = currentSession(); return s.owner || !s.handle ? LABEL_KEY : `${LABEL_KEY}:${s.handle}`; };

function readLabels() {
  try {
    const raw = window.localStorage.getItem(labelKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function SimLabel({ itemId }) {
  const [label, setLabel] = useState(null);
  useEffect(() => {
    setLabel(readLabels()[String(itemId)] ?? null);
  }, [itemId]);
  if (!label) return null;
  return (
    <span
      className="rounded-full px-2 py-px text-[11px] font-semibold"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ThreadMessageRow: one earlier message of the thread, rendered as what it
// actually is: a text bubble on the correct side, a shared post/reel/story
// card, a small centered reaction label, a voice note row, or a dashed
// placeholder for one of Instagram's generic/admin messages whose text is
// not on file. Non-text messages are never dropped and never shown as an
// empty bubble, so the visible count matches the real thread.
// ---------------------------------------------------------------------------

function ThreadMessageRow({ m, handle, fxBackground, reaction, pressProps }) {
  const mine = m.from === "me";

  if (m.kind === "reaction") {
    return (
      <p className="mx-auto mb-2 w-fit max-w-[85%] rounded-full bg-[var(--surface)] px-3 py-1 text-center text-xs text-[var(--dim)]">
        {mine ? "You" : `@${handle}`} reacted to a message
      </p>
    );
  }

  if (
    m.kind === "share_post" ||
    m.kind === "share_reel" ||
    m.kind === "share_story"
  ) {
    const label =
      m.kind === "share_post"
        ? "Post"
        : m.kind === "share_reel"
          ? "Reel"
          : "Story";
    const card = (
      <div
        className="w-44 rounded-[22px] bg-[var(--surface)] p-2.5"
        style={{ border: "1px solid var(--border)" }}
      >
        <div className="flex h-20 items-center justify-center rounded-2xl bg-[var(--surface-alt)] text-[var(--dim)]">
          {m.kind === "share_post" ? (
            <IconImage size={26} />
          ) : m.kind === "share_reel" ? (
            <IconReels size={26} />
          ) : (
            <IconPlay size={26} />
          )}
        </div>
        <p className="px-1 pt-2 text-[13px] leading-tight font-semibold">
          {label}
        </p>
        <p className="px-1 pb-0.5 text-xs leading-tight text-[var(--dim)]">
          {mine ? "You shared this" : "Shared with you"}
        </p>
      </div>
    );
    return (
      <div className={`mb-1 flex ${mine ? "justify-end" : "items-end gap-2"}`}>
        {!mine && <Avatar handle={handle} size={28} />}
        {m.url ? (
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${mine ? "You" : `@${handle}`} shared a ${label.toLowerCase()}. Open on Instagram`}
            className="block"
          >
            {card}
          </a>
        ) : (
          <div
            role="img"
            aria-label={`${mine ? "You" : `@${handle}`} shared a ${label.toLowerCase()}`}
          >
            {card}
          </div>
        )}
      </div>
    );
  }

  if (m.kind === "voice") {
    return (
      <div className={`mb-1 flex ${mine ? "justify-end" : "items-end gap-2"}`}>
        {!mine && <Avatar handle={handle} size={28} />}
        <div
          role="img"
          aria-label={
            mine ? "Voice message you sent" : `Voice message from ${handle}`
          }
          className={`flex items-center gap-2.5 rounded-[22px] px-3.5 py-2.5 ${
            mine ? "text-white" : "bg-[var(--bubble-in)]"
          }`}
          style={mine ? { background: fxBackground } : undefined}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.22)" }}
          >
            <IconPlay size={14} />
          </span>
          <span aria-hidden="true" className="flex items-center gap-[3px]">
            {[10, 16, 8, 15, 19, 9, 14, 7, 12].map((h, j) => (
              <span
                key={j}
                className="w-[3px] rounded-full bg-current opacity-80"
                style={{ height: h }}
              />
            ))}
          </span>
          <span className="text-[13px] whitespace-nowrap">Voice message</span>
        </div>
      </div>
    );
  }

  if (m.kind === "generic" || m.kind === "admin") {
    return (
      <div className={`mb-1 flex ${mine ? "justify-end" : "items-end gap-2"}`}>
        {!mine && <Avatar handle={handle} size={28} />}
        <div
          role="img"
          aria-label={
            m.kind === "generic"
              ? "A generic message from Instagram. Its text is not on file"
              : "An admin message from Instagram. Its text is not on file"
          }
          className="rounded-[22px] px-3.5 py-2.5 text-[15px] text-[var(--dim)] italic"
          style={{ border: "1.5px dashed var(--border)" }}
        >
          {m.kind === "generic" ? "Generic message" : "Admin message"}
        </div>
      </div>
    );
  }

  // Plain text: a normal bubble, with the IG "replied to" label when the
  // message answered a story, a note or a montage share.
  const replyLabel = m.reply_to
    ? mine
      ? `You replied to a ${m.reply_to}`
      : `Replied to your ${m.reply_to}`
    : null;
  return (
    <div className={`mb-1 flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {replyLabel && (
        <p
          className={`pb-1 text-xs text-[var(--dim)] ${mine ? "pr-1" : "pl-10"}`}
        >
          {replyLabel}
        </p>
      )}
      <div className={`flex ${mine ? "justify-end" : "items-end gap-2"}`}>
        {!mine && <Avatar handle={handle} size={28} />}
        <div className="relative max-w-[78%]">
          <div
            role="button"
            tabIndex={0}
            aria-label={
              mine
                ? "Earlier message you sent. Long-press for options."
                : `Earlier message from ${handle}. Long-press for options.`
            }
            {...pressProps}
            className={`rounded-[22px] px-3.5 py-2.5 text-base leading-snug whitespace-pre-line select-none ${
              mine ? "text-white" : "bg-[var(--bubble-in)]"
            }`}
            style={mine ? { background: fxBackground } : undefined}
          >
            {m.text}
          </div>
          {reaction && (
            <span
              aria-hidden="true"
              className="absolute -bottom-2.5 left-2 rounded-full bg-[var(--surface-alt)] px-1.5 py-px text-sm"
              style={{ border: "2px solid var(--bg)" }}
            >
              {reaction}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatView: one DM thread as a full-screen Instagram DM chat. It opens
// scrolled to the bottom, showing the setup note and the thread's real
// last 10 messages in order (texts, shares, reactions, voice and
// generic/admin items, with IG date separators), then the
// three approval stages: stage 1 drafts wear a dashed outline; tapping a
// draft approves it (stage 2, a normal sent-looking bubble); the wide SEND
// button under the composer is stage 3 and the only way anything leaves
// for Instagram, after a confirmation the creator can silence. Long-press any
// bubble for reactions (one tap applies), Copy, and, for her own texts
// only, Edit (loads the composer; Enter locks it into stage 2) and
// Delete. The "Advanced" section under SEND holds the old review tools:
// Muse's draft card, feedback, verdict, Save Review, holdout reveal,
// remove. Nothing in Advanced sends.
// ---------------------------------------------------------------------------

const BUBBLE_FX = {
  gradient: {
    background: "var(--bubble-gradient)",
    label: "Default gradient",
  },
  pink: {
    background: "linear-gradient(135deg,#ff5e9c,#ff2e7e)",
    label: "Hearts pink",
  },
  orange: {
    background: "linear-gradient(135deg,#ffb03a,#ff7847)",
    label: "Fire orange",
  },
};

let lineSeq = 0;
function nextLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

function splitLines(text, stage) {
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((t) => ({ id: nextLineId(), text: t, stage }));
}

const SKIP_SEND_CONFIRM_KEY = "reply-sim-skip-send-confirm";

function readSkipSendConfirm() {
  try {
    return window.localStorage.getItem(SKIP_SEND_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

function ChatView({ item, onBack, onNext, hasNext, onGoTraining }) {
  const queryClient = useQueryClient();
  const handle = handleOf(item);
  const profile = profileOf(handle);

  const published = item.publish_status === "published";
  const publishing = item.publish_status === "publishing";
  const locked = published || publishing;

  const [screen, setScreen] = useState("chat");
  const [sheet, setSheet] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lines, setLines] = useState(() => {
    if (published && item.published_text)
      return splitLines(item.published_text, 2);
    if (item.verdict !== "pending")
      return splitLines(item.revision_text ?? item.draft_text ?? "", 2);
    return splitLines(item.draft_text ?? item.revision_text ?? "", 1);
  });
  const [composer, setComposer] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  const [verdictChoice, setVerdictChoice] = useState(
    item.verdict === "pending" ? null : item.verdict,
  );
  const [saveError, setSaveError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [sendError, setSendError] = useState("");
  const [saved, setSaved] = useState(item.verdict !== "pending");
  const [copiedWhich, setCopiedWhich] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [revealedActual, setRevealedActual] = useState(
    item.revealed ? item.actual_reply : null,
  );
  const [toast, setToast] = useState(null);
  const [label, setLabel] = useState(
    () => readLabels()[String(item.id)] ?? null,
  );
  const [muted, setMuted] = useState(false);
  const [nickname, setNickname] = useState("");
  const [fx, setFx] = useState("gradient");
  const [reactions, setReactions] = useState({});
  const [pinned, setPinned] = useState(null);
  const [replyQuote, setReplyQuote] = useState(null);
  const [extraGifs, setExtraGifs] = useState([]);
  const [scheduledNote, setScheduledNote] = useState(null);
  const [pressMsg, setPressMsg] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const pressTimer = useRef(null);
  const composerRef = useRef(null);
  const scrollRef = useRef(null);
  const advancedRef = useRef(null);
  const draftSeenRef = useRef(item.draft_text);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["items"] });

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  // Opening the chat (1.14.0, Quill #725, Rose #770): a pending draft written
  // under an older version of her voice is drafted again, once, in her voice
  // as it is now. Here her Muse is asked; a space with a model redrafts at
  // once. Approved, edited and published drafts are only marked.
  useEffect(() => {
    let live = true;
    api
      .dm_openthread({ id: item.id })
      .then((r) => {
        if (live && (r.regenerated || (r.wanted && !item.draft_wanted)))
          invalidate();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A regenerated draft replaces the stage-1 lines wholesale. She has not
  // touched the new draft yet, so nothing of hers is lost.
  useEffect(() => {
    if (item.draft_text !== draftSeenRef.current) {
      draftSeenRef.current = item.draft_text;
      if (item.verdict === "pending" && !published && !publishing) {
        setLines(splitLines(item.draft_text ?? "", 1));
        setEditingId(null);
      }
    }
  }, [item.draft_text, item.verdict, published, publishing]);

  // When a publish lands, the thread settles on exactly what was sent.
  useEffect(() => {
    if (published && item.published_text) {
      setLines(splitLines(item.published_text, 2));
      setEditingId(null);
    }
  }, [published, item.published_text]);

  // Keep the newest messages in view when a line is added.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  // A chat opens at the bottom, on the latest message and the drafts,
  // never at the top of the thread. Runs when a chat opens; the delayed
  // pass covers avatars and share cards still settling their height.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    const t = window.setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 350);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [item.id]);

  useEffect(() => {
    if (!advancedOpen) return;
    const id = window.setTimeout(
      () =>
        advancedRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      60,
    );
    return () => window.clearTimeout(id);
  }, [advancedOpen]);

  const draftMutation = useMutation({
    mutationFn: async (variant) =>
      await api.dm_generatedraft({ id: item.id, mode: "dm", variant }),
    onSuccess: () => {
      setDraftError("");
      invalidate();
    },
    onError: (error) => setDraftError(error.message),
  });
  // With no model on the server, Muse writes the draft: it waits until Muse hands it back.
  const drafting = draftMutation.isPending || item.draft_wanted;
  const draftLabel = draftMutation.isPending
    ? "Drafting…"
    : "Waiting for Muse…";

  const joinedLines = lines.map((l) => l.text).join("\n");
  const allApproved = lines.length > 0 && lines.every((l) => l.stage === 2);
  const verdict =
    verdictChoice ??
    (allApproved || (item.draft_text && joinedLines === item.draft_text.trim())
      ? "approved"
      : "edited");

  const saveMutation = useMutation({
    mutationFn: async () =>
      await api.dm_savereview({
        id: item.id,
        revision_text: joinedLines,
        feedback: feedback.trim(),
        verdict,
      }),
    onSuccess: () => {
      setSaved(true);
      setSaveError("");
      invalidate();
    },
    onError: (error) => setSaveError(error.message),
  });

  const publishMutation = useMutation({
    mutationFn: async (text) =>
      await api.dm_publishitem({
        id: item.id,
        revision_text: text,
        feedback: feedback.trim(),
        verdict:
          item.draft_text && text === item.draft_text.trim()
            ? "approved"
            : "edited",
      }),
    onSuccess: () => {
      setSaved(true);
      setSendError("");
      invalidate();
    },
    onError: (error) => setSendError(error.message),
  });

  const revealMutation = useMutation({
    mutationFn: async () => await api.dm_revealactual({ id: item.id }),
    onSuccess: (data) => {
      setRevealedActual(data.actual_reply);
      invalidate();
    },
    onError: (error) => setSaveError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => await api.dm_deleteitem({ id: item.id }),
    onSuccess: () => {
      invalidate();
      onBack();
    },
    onError: (error) => setSaveError(error.message),
  });

  const flashCopied = (which) => {
    setCopiedWhich(which);
    window.setTimeout(() => setCopiedWhich(null), 2000);
  };

  const handleCopyDraft = async () => {
    if (!item.draft_text) return;
    if (await copyToClipboard(item.draft_text)) flashCopied("draft");
  };

  const handleCopyIntoComposer = async () => {
    if (!item.draft_text) return;
    await copyToClipboard(item.draft_text);
    setComposer(item.draft_text);
    flashCopied("into");
    composerRef.current?.focus();
    showToast("Draft is in the composer. The send arrow adds it as your texts");
  };

  const handleSaveAdvanced = () => {
    if (lines.length === 0) {
      setSaveError(
        item.draft_text
          ? "Every text was deleted. Copy the draft back from the card above, or type your own in the composer."
          : "There is nothing to save yet. Draft a reply first, or type your own in the composer.",
      );
      return;
    }
    setSaveError("");
    saveMutation.mutate();
  };

  // ---- Stage flow -------------------------------------------------------

  const approvedLines = lines.filter((l) => l.stage === 2);
  const approvedText = approvedLines.map((l) => l.text).join("\n");

  const toggleStage = (id) => {
    if (locked) return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, stage: l.stage === 1 ? 2 : 1 } : l,
      ),
    );
    setSaved(false);
  };

  const deleteLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditText("");
    }
    setSaved(false);
  };

  const startEdit = (line) => {
    setEditingId(line.id);
    setEditText(line.text);
    setPressMsg(null);
    window.setTimeout(() => composerRef.current?.focus(), 60);
  };

  const confirmEdit = () => {
    const text = editText.trim();
    if (editingId && text) {
      // Pressing enter locks the edited text into stage 2.
      setLines((prev) =>
        prev.map((l) => (l.id === editingId ? { ...l, text, stage: 2 } : l)),
      );
      setSaved(false);
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const addComposed = () => {
    const parts = composer
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (parts.length === 0) return;
    setLines((prev) => [
      ...prev,
      ...parts.map((text) => ({ id: nextLineId(), text, stage: 1 })),
    ]);
    setComposer("");
    setSaved(false);
  };

  const doSend = () => {
    if (approvedLines.length === 0 || locked) return;
    setSendError("");
    publishMutation.mutate(approvedText);
  };

  const handleSendTap = () => {
    if (approvedLines.length === 0 || locked) return;
    if (readSkipSendConfirm()) {
      doSend();
      return;
    }
    setDontAskAgain(false);
    setConfirmSendOpen(true);
  };

  const confirmSend = () => {
    if (dontAskAgain) {
      try {
        window.localStorage.setItem(SKIP_SEND_CONFIRM_KEY, "1");
      } catch {
        // The choice still applies to this send.
      }
    }
    setConfirmSendOpen(false);
    doSend();
  };

  // Long-press (and right-click) opens the IG reaction/menu overlay.
  const startPress = (msg) => {
    pressTimer.current = window.setTimeout(() => {
      setPressMsg(msg);
      setMoreOpen(false);
    }, 480);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const pressHandlers = (msg) => ({
    onPointerDown: () => startPress(msg),
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onContextMenu: (e) => {
      e.preventDefault();
      cancelPress();
      setPressMsg(msg);
      setMoreOpen(false);
    },
  });

  const saveLabel = (next) => {
    setLabel(next);
    try {
      const all = readLabels();
      if (next) all[String(item.id)] = next;
      else delete all[String(item.id)];
      window.localStorage.setItem(labelKey(), JSON.stringify(all));
    } catch {
      // localStorage unavailable: the label still shows for this session.
    }
  };

  const toastEl = toast ? (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-[#2b2b2e] px-4 py-2.5 text-sm shadow-xl"
    >
      {toast}
    </div>
  ) : null;

  if (screen === "details") {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)]">
        <div className="mx-auto w-full max-w-2xl pb-[6.5rem]">
          <ChatDetails
            item={item}
            nickname={nickname}
            muted={muted}
            onBack={() => setScreen("chat")}
            onProfile={() => setScreen("profile")}
            onToggleMute={() => {
              setMuted((m) => !m);
              showToast(muted ? "Unmuted" : "Muted, in the simulator only");
            }}
            onSaveNickname={(n) => setNickname(n)}
            onToast={showToast}
          />
        </div>
        {toastEl}
      </div>
    );
  }
  if (screen === "profile") {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)]">
        <div className="mx-auto w-full max-w-2xl pb-[6.5rem]">
          <ProfileView
            handle={handle}
            onBack={() => setScreen("details")}
            onMessage={() => setScreen("chat")}
          />
        </div>
        {toastEl}
      </div>
    );
  }

  const fxStyle = BUBBLE_FX[fx] ?? BUBBLE_FX.gradient;
  // The thread's last 10 messages, oldest first. The window ends with the
  // incoming message itself (for this sender, its last two texts together
  // are the incoming message). Those trailing texts already render as the
  // incoming bubble below, so the context is everything before them.
  const threadWindow = item.thread_messages.slice(-10);
  let incomingCount = 0;
  for (let i = threadWindow.length - 1; i >= 0; i--) {
    const m = threadWindow[i];
    if (
      m &&
      m.from === "them" &&
      m.kind === "text" &&
      m.text &&
      item.incoming_text.includes(m.text)
    ) {
      incomingCount++;
    } else {
      break;
    }
  }
  const threadContext = threadWindow.slice(
    0,
    threadWindow.length - incomingCount,
  );
  const incomingAt =
    incomingCount > 0
      ? (threadWindow[threadWindow.length - 1]?.at ?? null)
      : null;
  const hasThreadTimes = threadWindow.some((m) => m.at);
  // Date separators, IG-style: one before the first message of each new
  // day, across the context messages and the incoming message.

  const threadEntries = [];
  {
    let prevAt = null;
    threadContext.forEach((m, i) => {
      if (m.at && (!prevAt || !sameLocalDay(prevAt, m.at))) {
        threadEntries.push({
          type: "sep",
          key: `sep-${i}`,
          label: igDateSeparator(m.at),
        });
      }
      if (m.at) prevAt = m.at;
      threadEntries.push({ type: "msg", key: `ctx-${i}`, m });
    });
  }
  const lastContextAt =
    [...threadContext].reverse().find((m) => m.at)?.at ?? null;
  const incomingSepLabel =
    incomingAt && (!lastContextAt || !sameLocalDay(lastContextAt, incomingAt))
      ? igDateSeparator(incomingAt)
      : null;
  const canSend =
    item.source !== "holdout" && !locked && approvedLines.length > 0;

  return (
    <section className="fixed inset-0 z-40 bg-[var(--bg)]">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
        {/* Chat header: the person's @handle tops the conversation, and
            tapping it opens their real Instagram profile. */}
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to chats"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)]"
          >
            <IconBack size={22} />
          </button>
          <button
            type="button"
            onClick={() => setScreen("details")}
            aria-label={`Chat details for ${handle}`}
            className="shrink-0 rounded-full"
          >
            <Avatar handle={handle} size={38} />
          </button>
          <a
            href={`https://www.instagram.com/${handle}/`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open @${handle} on Instagram`}
            className="min-w-0 flex-1"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-base font-bold">
                {nickname || `@${handle}`}
              </span>
              {profile.verified && <VerifiedBadge size={14} />}
            </span>
            <span className="block truncate text-[13px] text-[var(--dim)]">
              Business chat
              {label ? ` · ${label}` : ""}
              {muted ? " · Muted" : ""}
            </span>
          </a>
          <button
            type="button"
            onClick={() => setSheet("label")}
            aria-label="Add a label"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)]"
          >
            <IconTag size={21} />
          </button>
        </div>

        {pinned && (
          <div className="mx-3 mb-1 flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--dim)]">
            <IconPin size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">Pinned: {pinned}</span>
            <button
              type="button"
              onClick={() => setPinned(null)}
              aria-label="Unpin message"
              className="shrink-0 font-semibold text-[var(--text)]"
            >
              ✕
            </button>
          </div>
        )}

        {/* Messages: the only scrollable part of the chat */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
          {item.context_text && (
            <div className="mx-auto mb-3 max-w-[85%] rounded-2xl bg-[var(--surface)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--dim)]">
              {item.context_text}
            </div>
          )}

          {!hasThreadTimes && (
            <p className="py-3 text-center text-xs font-medium tracking-wide text-[var(--dim)]">
              {igDateSeparator(item.created_at)}
            </p>
          )}

          {threadWindow.length >= 10 && (
            <p className="pb-2 text-center text-xs text-[var(--dim)]">
              Showing the last 10 messages of this thread
            </p>
          )}
          {threadEntries.map((entry) =>
            entry.type === "sep" ? (
              <p
                key={entry.key}
                className="py-3 text-center text-xs font-medium tracking-wide text-[var(--dim)]"
              >
                {entry.label}
              </p>
            ) : (
              <ThreadMessageRow
                key={entry.key}
                m={entry.m}
                handle={handle}
                fxBackground={fxStyle?.background}
                reaction={reactions[entry.key]}
                pressProps={
                  entry.m.kind === "text" && entry.m.text
                    ? pressHandlers({
                        key: entry.key,
                        text: entry.m.text,
                        mine: entry.m.from === "me",
                      })
                    : undefined
                }
              />
            ),
          )}

          {incomingSepLabel && (
            <p className="py-3 text-center text-xs font-medium tracking-wide text-[var(--dim)]">
              {incomingSepLabel}
            </p>
          )}

          {item.story_reply_not_captured ? (
            <p className="mx-auto mt-4 max-w-[85%] rounded-xl bg-[var(--gold-soft)] px-3 py-2 text-center text-[13px] text-[var(--gold)]">
              They replied to your story. The words of that reply weren&apos;t
              captured when this chat was imported, so there is no message text
              to show here.
            </p>
          ) : (
            <div className="mt-2 flex items-end gap-2">
              <Avatar handle={handle} size={28} />
              <div className="relative max-w-[78%]">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Message from ${handle}. Long-press for options.`}
                  {...pressHandlers({
                    key: "in",
                    text: item.incoming_text,
                    mine: false,
                  })}
                  className="whitespace-pre-line rounded-[22px] bg-[var(--bubble-in)] px-3.5 py-2.5 text-base leading-snug select-none"
                >
                  {item.incoming_text}
                </div>
                {reactions["in"] && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-2.5 left-2 rounded-full bg-[var(--surface-alt)] px-1.5 py-px text-sm"
                    style={{ border: "2px solid var(--bg)" }}
                  >
                    {reactions["in"]}
                  </span>
                )}
              </div>
            </div>
          )}

          {item.has_actual && !revealedActual && (
            <p className="mx-auto mt-4 max-w-[85%] rounded-xl bg-[var(--gold-soft)] px-3 py-2 text-center text-[13px] text-[var(--gold)]">
              Blind holdout: what you actually replied is sealed until your
              revision is saved.
            </p>
          )}

          {item.voice_stale && item.verdict !== "pending" && (
            <p className="mx-auto mt-4 max-w-[85%] rounded-xl bg-[var(--gold-soft)] px-3 py-2 text-center text-[13px] text-[var(--gold)]">
              Voice changed since this draft
            </p>
          )}

          {lines.length > 0 ? (
            <div className="mt-5">
              <p className="pr-1 pb-1.5 text-right text-[13px] text-[var(--dim)]">
                {published
                  ? "You sent"
                  : publishing
                    ? "Sending…"
                    : "Your reply. Tap a draft to approve it"}
              </p>
              <div className="flex flex-col items-end gap-1.5">
                {lines.map((line) => {
                  const key = `out-${line.id}`;
                  const isDraft = line.stage === 1 && !locked;
                  return (
                    <div
                      key={line.id}
                      className="flex max-w-[85%] items-center gap-1.5"
                    >
                      {line.stage === 2 && !published && (
                        <span
                          aria-hidden="true"
                          style={{ color: "var(--sage)" }}
                        >
                          <IconCheck size={14} />
                        </span>
                      )}
                      <div className="relative">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={
                            published
                              ? "Sent reply. Long-press for options."
                              : isDraft
                                ? `Draft reply: ${line.text}. Tap to approve. Long-press for options.`
                                : `Approved reply: ${line.text}. Tap to move back to draft. Long-press for options.`
                          }
                          onClick={() => toggleStage(line.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleStage(line.id);
                            }
                          }}
                          {...pressHandlers({
                            key,
                            text: line.text,
                            mine: true,
                            lineId: line.id,
                            stage: line.stage,
                          })}
                          className="whitespace-pre-line rounded-[22px] px-3.5 py-2.5 text-base leading-snug text-white select-none"
                          style={{
                            background: fxStyle?.background,
                            opacity: isDraft ? 0.75 : 1,
                            outline: isDraft
                              ? "2px dashed rgba(255,255,255,0.85)"
                              : "none",
                            outlineOffset: isDraft ? 2 : 0,
                          }}
                        >
                          {line.text}
                        </div>
                        {reactions[key] && (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-2.5 right-2 rounded-full bg-[var(--surface-alt)] px-1.5 py-px text-sm"
                            style={{ border: "2px solid var(--bg)" }}
                          >
                            {reactions[key]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="pr-1 pt-2 text-right text-xs text-[var(--dim)]">
                {published
                  ? `Published ✓${item.published_at ? ` · ${new Date(item.published_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`
                  : publishing
                    ? "Publishing… your approved texts are on their way"
                    : item.publish_status === "publish_failed"
                      ? "The last send did not go through. Your approved texts are still here, tap Send to retry"
                      : approvedLines.length > 0
                        ? `${approvedLines.length} approved · ${lines.length - approvedLines.length} still draft${lines.length - approvedLines.length === 1 ? "" : "s"}`
                        : "Drafts wear a dashed outline. Tap one to approve it"}
              </p>
            </div>
          ) : (
            !published && (
              <p className="mx-auto mt-6 max-w-[85%] text-center text-sm leading-relaxed text-[var(--dim)]">
                No draft yet. Type your own reply below (it starts as a draft)
                or open Advanced and Muse will draft one in your voice.
              </p>
            )
          )}

          {extraGifs.map((g, i) => (
            <div key={`gif-${i}`} className="mt-2 flex justify-end">
              <div
                className="flex h-28 w-40 items-center justify-center rounded-[22px] text-white"
                style={{ background: g }}
                aria-label="GIF you picked"
              >
                <IconPlay size={30} />
              </div>
            </div>
          ))}

          {scheduledNote && (
            <p className="mx-auto mt-4 w-fit rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-[13px] text-[var(--dim)]">
              🕐 Scheduled: {scheduledNote}
            </p>
          )}

          {revealedActual && (
            <div className="mx-auto mt-5 max-w-[90%] rounded-2xl bg-[var(--gold-soft)] px-4 py-3">
              <p className="text-[13px] font-semibold text-[var(--gold)]">
                What you actually said
              </p>
              <p className="mt-1 whitespace-pre-line text-base leading-relaxed">
                {revealedActual}
              </p>
            </div>
          )}

          {/* Advanced panel: lives at the end of the scroll area, so a
              locked Advanced leaves nothing below it to scroll to. */}
          {advancedOpen && (
            <div
              ref={advancedRef}
              className="mt-5 rounded-3xl bg-[var(--surface)] p-4"
            >
              <h2 className="text-base font-bold">Advanced</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--dim)]">
                Draft tools, feedback and saving for training. Nothing in here
                sends. The Send button below the composer is the only way these
                texts reach Instagram.
              </p>

              <div className="mt-4">
                <h3 className="text-[13px] font-semibold tracking-wide text-[var(--dim)]">
                  Muse's draft
                </h3>
                {item.draft_text ? (
                  <>
                    <div className="mt-2 rounded-2xl bg-[var(--surface-alt)] px-3.5 py-2.5">
                      <p className="whitespace-pre-line text-base leading-relaxed">
                        {item.draft_text}
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyDraft}
                        className="rounded-full px-4 py-2 text-sm font-semibold"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {copiedWhich === "draft" ? "Copied ✓" : "Copy draft"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyIntoComposer}
                        className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        {copiedWhich === "into"
                          ? "In the composer ✓"
                          : "Copy into composer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => draftMutation.mutate("again")}
                        disabled={drafting}
                        className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {drafting ? draftLabel : "Again"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-[var(--dim)]">
                      {item.draft_wanted
                        ? "Muse is writing this draft. It shows here when it's ready."
                        : "No draft yet. Muse drafts blind, from the message alone, in your voice."}
                    </p>
                    <button
                      type="button"
                      onClick={() => draftMutation.mutate("fresh")}
                      disabled={drafting}
                      className="mt-2.5 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: "var(--accent)" }}
                    >
                      <IconSparkle size={15} />
                      {drafting ? draftLabel : "Draft a reply in my voice"}
                    </button>
                  </>
                )}
                {draftError && (
                  <p
                    className="mt-2 text-sm"
                    style={{ color: "var(--danger)" }}
                  >
                    {draftError}
                  </p>
                )}
              </div>

              <label
                htmlFor={`feedback-${item.id}`}
                className="mt-5 block text-[13px] font-semibold tracking-wide text-[var(--dim)]"
              >
                Feedback for retraining
              </label>
              <textarea
                id={`feedback-${item.id}`}
                {...FIELDS.dm_savereview.feedback}
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                  setSaved(false);
                }}
                rows={2}
                placeholder="What worked, what felt off, what to do next time…"
                className="mt-2 w-full rounded-2xl bg-[var(--bg)] px-3.5 py-2.5 text-base leading-relaxed outline-none"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />

              <div
                className="mt-4 flex flex-wrap gap-2"
                role="group"
                aria-label="Verdict"
              >
                {[
                  { id: "approved", label: "Approved as-is" },
                  { id: "edited", label: "I edited it" },
                  { id: "needs_work", label: "Needs work" },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={verdict === v.id}
                    onClick={() => {
                      setVerdictChoice(v.id);
                      setSaved(false);
                    }}
                    className="rounded-full px-3.5 py-1.5 text-sm font-medium"
                    style={
                      verdict === v.id
                        ? {
                            background:
                              v.id === "needs_work"
                                ? "var(--gold)"
                                : "var(--sage)",
                            color: "#fff",
                          }
                        : {
                            background: "var(--surface-alt)",
                            color: "var(--text)",
                          }
                    }
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {item.publish_status === "publish_failed" &&
                item.publish_error && (
                  <p
                    className="mt-3 rounded-2xl px-3.5 py-2.5 text-sm"
                    style={{ background: "#3a1620", color: "var(--danger)" }}
                  >
                    That send did not go through: {item.publish_error}
                  </p>
                )}
              {saveError && (
                <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
                  {saveError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAdvanced}
                  disabled={saveMutation.isPending}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--sage)" }}
                >
                  {saveMutation.isPending
                    ? "Saving…"
                    : saved
                      ? "Saved ✓ · save again"
                      : "Save review"}
                </button>
                {saved && hasNext && (
                  <button
                    type="button"
                    onClick={onNext}
                    className="rounded-full px-4 py-2.5 text-sm font-semibold"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    Next chat →
                  </button>
                )}
                {saved && !hasNext && (
                  <button
                    type="button"
                    onClick={onGoTraining}
                    className="rounded-full px-4 py-2.5 text-sm font-semibold"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    See training data →
                  </button>
                )}
              </div>

              {item.has_actual && saved && !revealedActual && (
                <button
                  type="button"
                  onClick={() => revealMutation.mutate()}
                  disabled={revealMutation.isPending}
                  className="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--gold)" }}
                >
                  {revealMutation.isPending
                    ? "Unsealing…"
                    : "Reveal what I actually said"}
                </button>
              )}

              <div
                className="mt-5 border-t pt-3"
                style={{ borderColor: "var(--border)" }}
              >
                {confirmDelete ? (
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-[var(--dim)]">Remove this chat?</span>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate()}
                      className="rounded-full px-3 py-1.5 font-semibold text-white"
                      style={{ background: "var(--danger)" }}
                    >
                      Yes, remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-full px-3 py-1.5 font-semibold"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-[var(--dim)] underline"
                  >
                    Remove from queue
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer: editing bar, composer, SEND (stage 3), Advanced toggle.
            It sits under the scroll area, so the scroll area ends at it.
            The bottom padding is deliberate clearance: the Muse app's
            floating tab bar overlays roughly the bottom 97 CSS px of the
            screen (measured from the creator's screenshot), so SEND and
            Advanced end above it, fully visible and tappable, never
            behind the bar. */}
        <div
          className="bg-[var(--bg)] pt-1"
          style={{ paddingBottom: "6.5rem" }}
        >
          {editingId && (
            <div className="flex items-center px-4 pt-1 pb-1.5">
              <span className="flex-1 text-sm text-[var(--dim)]">
                Editing message
              </span>
              <button
                type="button"
                onClick={cancelEdit}
                aria-label="Cancel editing"
                className="flex h-8 w-8 items-center justify-center rounded-full"
              >
                <IconX size={18} />
              </button>
            </div>
          )}
          {replyQuote && (
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--dim)]">
              <IconReplyArrow size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Replying to: {replyQuote}
              </span>
              <button
                type="button"
                onClick={() => setReplyQuote(null)}
                aria-label="Cancel reply quote"
                className="shrink-0 font-semibold text-[var(--text)]"
              >
                ✕
              </button>
            </div>
          )}
          <div className="mx-3 flex items-end gap-2 rounded-[26px] bg-[var(--surface-alt)] py-1.5 pr-2 pl-1.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                background: "linear-gradient(135deg,#5b5bd6,#0095f6)",
              }}
            >
              <IconCamera size={20} />
            </span>
            <label htmlFor={`composer-${item.id}`} className="sr-only">
              Your reply: type a text, or edit the one loaded here
            </label>
            <textarea
              id={`composer-${item.id}`}
              ref={composerRef}
              {...FIELDS.dm_savereview.revision_text}
              value={editingId ? editText : composer}
              onChange={(e) => {
                if (editingId) setEditText(e.target.value);
                else setComposer(e.target.value);
              }}
              onKeyDown={(e) => {
                if (editingId && e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  confirmEdit();
                }
              }}
              rows={1}
              placeholder="Message..."
              aria-label="Message... your reply"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-snug outline-none placeholder:text-[var(--dim)]"
            />
            {editingId ? (
              <button
                type="button"
                onClick={confirmEdit}
                aria-label="Done editing, approve this text"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "var(--bubble-gradient)" }}
              >
                <IconSend size={18} />
              </button>
            ) : composer.trim() ? (
              <button
                type="button"
                onClick={addComposed}
                aria-label="Add as a draft text"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "var(--bubble-gradient)" }}
              >
                <IconSend size={18} />
              </button>
            ) : (
              <span className="flex shrink-0 items-center gap-0.5 pb-0.5">
                <button
                  type="button"
                  aria-label="Voice message (visual only in the simulator)"
                  onClick={() =>
                    showToast(
                      "Voice notes are visual here. Type your reply instead",
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <IconMic size={22} />
                </button>
                <button
                  type="button"
                  aria-label="Photos (visual only in the simulator)"
                  onClick={() =>
                    showToast(
                      "Photos are visual here. This practice is text replies",
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <IconImage size={22} />
                </button>
                <button
                  type="button"
                  aria-label="Stickers, effects and GIFs"
                  onClick={() => setSheet("stickers")}
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <IconSticker size={22} />
                </button>
                <button
                  type="button"
                  aria-label="More: schedule this message"
                  onClick={() => setSheet("schedule")}
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <IconPlusCircle size={22} />
                </button>
              </span>
            )}
          </div>

          {sendError && (
            <p className="px-4 pt-2 text-sm" style={{ color: "var(--danger)" }}>
              {sendError}
            </p>
          )}

          {published ? (
            <p
              className="mx-3 mt-2 rounded-full py-2.5 text-center text-sm font-semibold"
              style={{
                background: "var(--sage-soft)",
                color: "var(--sage)",
              }}
            >
              Published to Instagram ✓
            </p>
          ) : item.source === "holdout" ? (
            <p className="px-4 pt-2.5 text-center text-[13px] text-[var(--dim)]">
              Practice only. You already replied to this one on Instagram.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleSendTap}
              disabled={!canSend || publishMutation.isPending}
              aria-label={
                approvedLines.length > 0
                  ? `Send ${approvedLines.length} approved texts to ${handle} on Instagram`
                  : "Send: approve at least one draft first"
              }
              className="mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-full py-3 text-base font-bold text-white disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              <IconSend size={18} />
              {publishing || publishMutation.isPending
                ? "Sending…"
                : approvedLines.length > 0
                  ? `Send ${approvedLines.length} approved ${approvedLines.length === 1 ? "text" : "texts"}`
                  : "Send"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center gap-3 px-4 pt-2.5 pb-1 text-left"
          >
            <IconSliders size={20} className="shrink-0 text-[var(--dim)]" />
            <span className="flex-1 text-base font-semibold">Advanced</span>
            <span className="text-xs text-[var(--dim)]">
              draft · feedback · save
            </span>
            <IconChevronDown
              size={18}
              className={`shrink-0 text-[var(--dim)] transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Send confirmation (stage 3) */}
      {confirmSendOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sending the approved DMs"
          onClick={() => setConfirmSendOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#1c1c1f] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg leading-snug font-bold">
              Are you sure you want to send the approved DMs?
            </h2>
            <p className="mt-1.5 text-sm text-[var(--dim)]">
              To @{handle} on Instagram. Only these approved texts send:
            </p>
            <div className="mt-3 flex flex-col items-end gap-1">
              {approvedLines.map((l) => (
                <div
                  key={l.id}
                  className="max-w-[90%] whitespace-pre-line rounded-[20px] px-3.5 py-2 text-[15px] leading-snug text-white"
                  style={{ background: fxStyle?.background }}
                >
                  {l.text}
                </div>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="h-5 w-5 shrink-0"
              />
              Don't ask me again
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmSendOpen(false)}
                className="flex-1 rounded-full py-3 text-base font-semibold"
                style={{
                  background: "var(--surface-alt)",
                  color: "var(--text)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSend}
                className="flex-1 rounded-full py-3 text-base font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Long-press overlay: reaction bar + action menu */}
      {pressMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Message options"
          onClick={() => setPressMsg(null)}
        >
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-full bg-[#2b2b2e] px-3 py-2 shadow-xl">
              {["❤️", "😂", "😮", "😢", "😡", "👍"].map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-label={`React with ${r}`}
                  onClick={() => {
                    setReactions((prev) => ({
                      ...prev,
                      [pressMsg.key]: r,
                    }));
                    setPressMsg(null);
                  }}
                  className="flex h-10 w-10 items-center justify-center text-[26px]"
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                aria-label="More reactions"
                onClick={() =>
                  showToast("Full emoji picker stays on your keyboard")
                }
                className="flex h-10 w-10 items-center justify-center text-[var(--dim)]"
              >
                <IconPlusCircle size={26} />
              </button>
            </div>

            <div
              className={`mt-4 max-w-[85%] whitespace-pre-line rounded-[22px] px-3.5 py-2.5 text-base leading-snug ${
                pressMsg.mine ? "ml-auto text-white" : "bg-[var(--bubble-in)]"
              }`}
              style={
                pressMsg.mine
                  ? {
                      background: fxStyle?.background,
                      opacity: pressMsg.stage === 1 && !locked ? 0.75 : 1,
                      outline:
                        pressMsg.stage === 1 && !locked
                          ? "2px dashed rgba(255,255,255,0.85)"
                          : "none",
                      outlineOffset: 2,
                    }
                  : undefined
              }
            >
              {pressMsg.text}
            </div>

            <div className="mt-4 overflow-hidden rounded-3xl bg-[#1c1c1f] shadow-xl">
              <p className="px-5 pt-4 pb-1 text-xs tracking-wide text-[var(--dim)]">
                {igDateSeparator(item.created_at)}
              </p>
              {[
                {
                  icon: <IconReplyArrow size={21} />,
                  label: "Reply",
                  show: true,
                  action: () => {
                    setReplyQuote(pressMsg.text);
                    setPressMsg(null);
                    composerRef.current?.focus();
                  },
                },
                {
                  icon: <IconCopy size={21} />,
                  label: "Copy",
                  show: true,
                  action: async () => {
                    const ok = await copyToClipboard(pressMsg.text);
                    setPressMsg(null);
                    showToast(
                      ok
                        ? "Copied. Paste it into the text box"
                        : "Copy did not work here",
                    );
                  },
                },
                {
                  icon: <IconSend size={19} />,
                  label: "Forward",
                  show: true,
                  action: () => {
                    setPressMsg(null);
                    setSheet("forward");
                  },
                },
                {
                  icon: <IconSticker size={21} />,
                  label: "Save reply",
                  show: true,
                  action: async () => {
                    await copyToClipboard(pressMsg.text);
                    setPressMsg(null);
                    showToast(
                      "Copied. Saved replies live in your clipboard here",
                    );
                  },
                },
                {
                  icon: <IconEdit size={21} />,
                  label: "Edit",
                  show: Boolean(pressMsg.lineId) && !locked,
                  action: () => {
                    const line = lines.find((l) => l.id === pressMsg.lineId);
                    if (line) startEdit(line);
                  },
                },
                {
                  icon: <IconTrash size={21} />,
                  label: "Delete for you",
                  show: Boolean(pressMsg.lineId) && !locked,
                  action: () => {
                    if (pressMsg.lineId) deleteLine(pressMsg.lineId);
                    setPressMsg(null);
                    showToast("Deleted. It was only a draft");
                  },
                },
              ]
                .filter((row) => row.show)
                .map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    onClick={row.action}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-base active:bg-[var(--surface-alt)]"
                  >
                    {row.icon}
                    {row.label}
                  </button>
                ))}
              {!pressMsg.mine && (
                <button
                  type="button"
                  onClick={() =>
                    showToast("Report noted. Nothing leaves the simulator")
                  }
                  className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-base"
                  style={{ color: "var(--danger)" }}
                >
                  <IconReport size={21} />
                  Report
                </button>
              )}
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((o) => !o)}
                className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-base active:bg-[var(--surface-alt)]"
              >
                <IconDots size={21} />
                More
                <span className="ml-auto">
                  <IconChevronRight
                    size={18}
                    className={
                      moreOpen
                        ? "rotate-90 transition-transform"
                        : "transition-transform"
                    }
                  />
                </span>
              </button>
              {moreOpen && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      showToast("Translation isn't available in the simulator")
                    }
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-base active:bg-[var(--surface-alt)]"
                  >
                    <IconTranslate size={21} />
                    Translate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinned(pressMsg.text);
                      setPressMsg(null);
                      showToast("Pinned to this chat");
                    }}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-base active:bg-[var(--surface-alt)]"
                  >
                    <IconPin size={21} />
                    Pin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPressMsg(null);
                      setSheet("stickers");
                    }}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-base active:bg-[var(--surface-alt)]"
                  >
                    <IconSticker size={21} />
                    Add sticker
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      New
                    </span>
                  </button>
                </>
              )}
              <div className="h-2" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheets */}
      {sheet === "label" && (
        <LabelSheet
          current={label}
          onClose={() => setSheet(null)}
          onSave={(next) => {
            saveLabel(next);
            setSheet(null);
            showToast(next ? `Labelled “${next}”` : "Label cleared");
          }}
        />
      )}
      {sheet === "schedule" && (
        <ScheduleSheet
          onClose={() => setSheet(null)}
          onConfirm={(when) => {
            setScheduledNote(when);
            setSheet(null);
            showToast(`Scheduled for ${when}. Visual only, Send still sends`);
          }}
        />
      )}
      {sheet === "forward" && (
        <ForwardSheet
          people={Array.from(new Set([handle])).filter(Boolean)}
          onClose={() => setSheet(null)}
          onSend={(names) => {
            setSheet(null);
            showToast(
              `Forwarded to ${names.join(", ")}, inside the simulator only`,
            );
          }}
        />
      )}
      {sheet === "stickers" && (
        <StickersSheet
          previewText={
            joinedLines || "this is a draft reply with the keyboard behind it"
          }
          currentFx={fx}
          onClose={() => setSheet(null)}
          onPickFx={(next) => {
            setFx(next);
            showToast("Effect applied to your reply bubbles");
          }}
          onPickSticker={(s) => {
            setComposer((c) => (c ? `${c} ${s}` : s));
            setSheet(null);
          }}
          onPickGif={(grad) => {
            setExtraGifs((prev) => [...prev, grad]);
            setSheet(null);
          }}
        />
      )}

      {toastEl}
    </section>
  );
}

// ---------------------------------------------------------------------------
// IG-style bottom sheets
// ---------------------------------------------------------------------------

function SheetShell({ title, onClose, children, right }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-t-[26px]"
        style={{ background: "var(--sheet)", paddingBottom: "6.5rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-[#555]" />
        </div>
        <div className="relative flex items-center justify-center px-5 pt-3 pb-1">
          <h2 className="text-lg font-bold">{title}</h2>
          {right && <div className="absolute right-4">{right}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

const LABEL_OPTIONS = [
  { name: "Flag", icon: <IconFlag size={24} /> },
  { name: "Booked", icon: <IconCalendar size={24} /> },
  { name: "Lead", icon: <IconTag size={24} /> },
  { name: "Ordered", icon: <IconCart size={24} /> },
  { name: "Paid", icon: <IconDollar size={24} /> },
  { name: "Shipped", icon: <IconTruck size={24} /> },
];

function LabelSheet({ current, onClose, onSave }) {
  const [picked, setPicked] = useState(current);
  return (
    <SheetShell
      title="Add a label"
      onClose={onClose}
      right={
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="rounded-full px-4 py-1.5 text-base font-semibold"
          style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
        >
          Clear
        </button>
      }
    >
      <div className="px-2 pt-2" role="radiogroup" aria-label="Chat label">
        {LABEL_OPTIONS.map((opt) => (
          <button
            key={opt.name}
            type="button"
            role="radio"
            aria-checked={picked === opt.name}
            onClick={() => setPicked(opt.name)}
            className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left text-lg active:bg-[var(--surface-alt)]"
          >
            {opt.icon}
            <span className="flex-1">{opt.name}</span>
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                border: `2px solid ${picked === opt.name ? "var(--accent)" : "#777"}`,
                background:
                  picked === opt.name ? "var(--accent)" : "transparent",
                color: "#fff",
              }}
            >
              {picked === opt.name && <IconCheck size={15} />}
            </span>
          </button>
        ))}
      </div>
      <p className="px-6 pt-2 text-sm text-[var(--dim)]">
        Only people who manage your Instagram account can view and change
        labels. In the simulator the label is kept in this browser.
      </p>
      <div className="px-5 pt-4">
        <button
          type="button"
          disabled={picked === current}
          onClick={() => onSave(picked)}
          className="w-full rounded-2xl py-3.5 text-base font-semibold text-white disabled:opacity-40"
          style={{ background: "#2b3bdb" }}
        >
          Save
        </button>
      </div>
    </SheetShell>
  );
}

function ScheduleSheet({ onClose, onConfirm }) {
  const days = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const label =
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
      out.push({
        label,
        short:
          i === 0
            ? "today"
            : i === 1
              ? "tomorrow"
              : d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                }),
      });
    }
    return out;
  }, []);
  const [dayIdx, setDayIdx] = useState(0);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState("PM");
  const day = days[dayIdx] ?? days[0];
  const timeStr = `${hour}:${String(minute).padStart(2, "0")} ${ampm}`;

  const selectStyle = {
    background: "var(--surface-alt)",
    color: "var(--text)",
    border: "1px solid var(--border)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Schedule message"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-t-[26px] pb-6"
        style={{ background: "var(--sheet)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-[#555]" />
        </div>
        <div className="relative flex items-center px-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-base"
            style={{ border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <h2 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold">
            Schedule message
          </h2>
        </div>
        <div className="grid grid-cols-4 items-end gap-2 px-5 pt-6">
          <label className="col-span-1">
            <span className="sr-only">Day</span>
            <select
              aria-label="Day"
              value={dayIdx}
              onChange={(e) => setDayIdx(Number(e.target.value))}
              className="w-full rounded-xl px-2 py-3 text-base"
              style={selectStyle}
            >
              {days.map((d, i) => (
                <option key={d.label} value={i}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Hour</span>
            <select
              aria-label="Hour"
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full rounded-xl px-2 py-3 text-base"
              style={selectStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Minute</span>
            <select
              aria-label="Minute"
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="w-full rounded-xl px-2 py-3 text-base"
              style={selectStyle}
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">AM or PM</span>
            <select
              aria-label="AM or PM"
              value={ampm}
              onChange={(e) => setAmpm(e.target.value)}
              className="w-full rounded-xl px-2 py-3 text-base"
              style={selectStyle}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </label>
        </div>
        <p className="px-6 pt-4 text-center text-sm text-[var(--dim)]">
          Scheduling is visual in the simulator. Your Publish tap in the review
          panel is still what sends.
        </p>
        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={() => onConfirm(`${day?.short ?? "today"} at ${timeStr}`)}
            className="w-full rounded-2xl py-3.5 text-base font-semibold text-white"
            style={{ background: "#4353ff" }}
          >
            Send {day?.short ?? "today"} at {timeStr}
          </button>
        </div>
      </div>
    </div>
  );
}

function ForwardSheet({ people, onClose, onSend }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState([]);
  const shown = people.filter((p) =>
    p.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <SheetShell title="Forward" onClose={onClose}>
      <div className="flex items-center gap-2 px-5 pt-2">
        <label className="flex flex-1 items-center gap-2.5 rounded-full bg-[var(--surface-alt)] px-4 py-2.5">
          <IconSearch size={18} className="shrink-0 text-[var(--dim)]" />
          <span className="sr-only">Search people to forward to</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search people to forward to"
            className="w-full bg-transparent text-base outline-none placeholder:text-[var(--dim)]"
          />
        </label>
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-alt)]"
        >
          <IconGroupPlus size={21} />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-5 px-5 pt-5">
        {shown.map((person) => {
          const isChosen = chosen.includes(person);
          const prof = profileOf(person);
          return (
            <button
              key={person}
              type="button"
              aria-pressed={isChosen}
              onClick={() =>
                setChosen((prev) =>
                  isChosen
                    ? prev.filter((x) => x !== person)
                    : [...prev, person],
                )
              }
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className="rounded-full"
                style={
                  isChosen
                    ? { boxShadow: "0 0 0 3px var(--accent)" }
                    : undefined
                }
              >
                <Avatar handle={person} size={68} />
              </span>
              <span className="flex max-w-full items-center gap-1 text-sm">
                <span className="truncate">{person}</span>
                {prof.verified && <VerifiedBadge size={12} />}
              </span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--dim)]">
          Nobody matches that search.
        </p>
      )}
      <div className="px-5 pt-6">
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onSend(chosen)}
          className="w-full rounded-2xl py-3.5 text-base font-semibold text-white disabled:opacity-40"
          style={{ background: "#2b3bdb" }}
        >
          Send
        </button>
      </div>
    </SheetShell>
  );
}

const STICKER_SET = ["❤️", "😂", "🙏", "✨", "🌹", "🔥", "😍", "👏"];
const GIF_TILES = [
  { label: "laugh", background: "linear-gradient(135deg,#f7971e,#ffd200)" },
  { label: "love", background: "linear-gradient(135deg,#ee0979,#ff6a00)" },
  { label: "wow", background: "linear-gradient(135deg,#2193b0,#6dd5ed)" },
  { label: "sleepy", background: "linear-gradient(135deg,#232526,#414345)" },
  { label: "dance", background: "linear-gradient(135deg,#8e2de2,#4a00e0)" },
  { label: "yes", background: "linear-gradient(135deg,#11998e,#38ef7d)" },
];

function StickersSheet({
  previewText,
  currentFx,
  onClose,
  onPickFx,
  onPickSticker,
  onPickGif,
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const stickers = STICKER_SET.filter((s) => !q || s.includes(q));
  const gifs = GIF_TILES.filter((g) => !q || g.label.includes(q));
  return (
    <SheetShell title="Stickers" onClose={onClose}>
      <div className="px-5 pt-1">
        <label className="flex items-center gap-2.5 rounded-full bg-[var(--surface-alt)] px-4 py-2.5">
          <IconSearch size={18} className="shrink-0 text-[var(--dim)]" />
          <span className="sr-only">Search stickers</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stickers"
            aria-label="Search stickers"
            className="w-full bg-transparent text-base outline-none placeholder:text-[var(--dim)]"
          />
        </label>
      </div>

      <h3 className="px-5 pt-5 pb-2 text-base font-semibold text-[var(--dim)]">
        Effects
      </h3>
      <div className="flex gap-3 overflow-x-auto px-5 pb-1">
        {Object.keys(BUBBLE_FX).map((key) => {
          const fxDef = BUBBLE_FX[key];
          if (!fxDef) return null;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={currentFx === key}
              aria-label={`Apply effect: ${fxDef.label}`}
              onClick={() => onPickFx(key)}
              className="w-56 shrink-0 rounded-[20px] px-3.5 py-3 text-left text-[15px] leading-snug text-white"
              style={{
                background: fxDef.background,
                boxShadow:
                  currentFx === key ? "0 0 0 3px #fff inset" : undefined,
              }}
            >
              <span className="line-clamp-4">{previewText}</span>
            </button>
          );
        })}
      </div>

      <h3 className="px-5 pt-5 pb-2 text-base font-semibold text-[var(--dim)]">
        Stickers
      </h3>
      <div className="flex flex-wrap gap-2 px-5">
        {stickers.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Add sticker ${s}`}
            onClick={() => onPickSticker(s)}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-alt)] text-4xl"
          >
            {s}
          </button>
        ))}
        {stickers.length === 0 && (
          <p className="text-sm text-[var(--dim)]">No stickers match.</p>
        )}
      </div>

      <h3 className="px-5 pt-5 pb-2 text-base font-semibold text-[var(--dim)]">
        GIFs
      </h3>
      <div className="flex gap-2.5 overflow-x-auto px-5 pb-2">
        {gifs.map((g) => (
          <button
            key={g.label}
            type="button"
            aria-label={`Send GIF: ${g.label}`}
            onClick={() => onPickGif(g.background)}
            className="relative h-24 w-32 shrink-0 rounded-xl text-white"
            style={{ background: g.background }}
          >
            <span className="absolute inset-0 flex items-center justify-center">
              <IconPlay size={26} />
            </span>
            <span className="absolute bottom-1.5 left-2 text-xs font-semibold capitalize">
              {g.label}
            </span>
          </button>
        ))}
        {gifs.length === 0 && (
          <p className="text-sm text-[var(--dim)]">No GIFs match.</p>
        )}
      </div>
    </SheetShell>
  );
}

// ---------------------------------------------------------------------------
// Chat details (tap the chat header) and the Profile ("see profile") view
// ---------------------------------------------------------------------------

function ChatDetails({
  item,
  nickname,
  muted,
  onBack,
  onProfile,
  onToggleMute,
  onSaveNickname,
  onToast,
}) {
  const handle = handleOf(item);
  const profile = profileOf(handle);
  const [disappearing, setDisappearing] = useState("Off");
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState(nickname);
  const [searching, setSearching] = useState(false);

  const rows = [
    {
      icon: (
        <span
          aria-hidden="true"
          className="h-8 w-8 rounded-full"
          style={{ background: "var(--bubble-gradient)" }}
        />
      ),
      title: "Customize",
      sub: "Theme and font",
      action: () => onToast("Pick a theme from Effects in the sticker sheet"),
    },
    {
      icon: <IconNickname size={27} />,
      title: "Nicknames",
      action: () => {
        setNickDraft(nickname);
        setEditingNick(true);
      },
    },
    {
      icon: <IconClockDots size={27} />,
      title: "Disappearing messages",
      sub: disappearing,
      action: () => {
        const next =
          disappearing === "Off"
            ? "24 hours"
            : disappearing === "24 hours"
              ? "7 days"
              : "Off";
        setDisappearing(next);
        onToast(`Disappearing messages: ${next} (simulator setting)`);
      },
    },
    {
      icon: <IconHelpBubble size={27} />,
      title: "Chat controls",
      action: () => onToast("Chat controls are visual in the simulator"),
    },
    {
      icon: <IconLock size={27} />,
      title: "Privacy & safety",
      action: () => onToast("Privacy & safety is visual in the simulator"),
    },
    {
      icon: <IconGroupPlus size={27} />,
      title: "Create a group chat",
      action: () => onToast("Group chats aren't part of reply practice"),
    },
    {
      icon: <IconReport size={27} />,
      title: "Something isn't working",
      action: () => onToast("Tell Muse in chat if something here breaks"),
    },
  ];

  return (
    <section className="pt-1">
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chat"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-alt)]"
        >
          <IconBack size={22} />
        </button>
      </div>
      <div className="flex flex-col items-center px-4 pt-2">
        <Avatar handle={handle} size={96} />
        <h1 className="mt-3 flex items-center gap-1.5 text-2xl font-bold">
          {nickname || handle}
          {profile.verified && <VerifiedBadge size={17} />}
        </h1>
      </div>

      <div className="mx-auto mt-5 grid max-w-md grid-cols-4 px-4">
        {[
          {
            icon: <IconPerson size={27} />,
            label: "Profile",
            action: onProfile,
          },
          {
            icon: <IconSearch size={27} />,
            label: "Search",
            action: () => setSearching((s) => !s),
          },
          {
            icon: muted ? <IconBellOff size={27} /> : <IconBell size={27} />,
            label: muted ? "Unmute" : "Mute",
            action: onToggleMute,
          },
          {
            icon: <IconDots size={27} />,
            label: "Options",
            action: () => onToast("Options are visual in the simulator"),
          },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.action}
            className="flex flex-col items-center gap-1.5 py-1 text-sm"
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {searching && (
        <div className="px-4 pt-3">
          <label className="flex items-center gap-2.5 rounded-full bg-[var(--surface-alt)] px-4 py-2.5">
            <IconSearch size={18} className="shrink-0 text-[var(--dim)]" />
            <span className="sr-only">Search in conversation</span>
            <input
              type="search"
              placeholder="Search in conversation"
              aria-label="Search in conversation"
              className="w-full bg-transparent text-base outline-none placeholder:text-[var(--dim)]"
            />
          </label>
          <p className="px-1 pt-2 text-[13px] text-[var(--dim)]">
            This practice thread holds the one message in your queue. It is the
            bubble you see in the chat.
          </p>
        </div>
      )}

      {editingNick && (
        <div className="mx-4 mt-4 rounded-2xl bg-[var(--surface)] p-4">
          <label htmlFor="nickname-input" className="text-sm font-semibold">
            Nickname for {handle}
          </label>
          <input
            id="nickname-input"
            value={nickDraft}
            onChange={(e) => setNickDraft(e.target.value)}
            placeholder={handle}
            className="mt-2 w-full rounded-xl bg-[var(--bg)] px-3.5 py-2.5 text-base outline-none"
            style={{ border: "1px solid var(--border)" }}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onSaveNickname(nickDraft.trim());
                setEditingNick(false);
                onToast(
                  nickDraft.trim()
                    ? `Nickname set to “${nickDraft.trim()}”`
                    : "Nickname cleared",
                );
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Save nickname
            </button>
            <button
              type="button"
              onClick={() => setEditingNick(false)}
              className="rounded-full px-4 py-2 text-sm font-semibold"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 px-2">
        {rows.map((row) => (
          <button
            key={row.title}
            type="button"
            onClick={row.action}
            className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left active:bg-[var(--surface)]"
          >
            <span className="flex w-9 shrink-0 items-center justify-center">
              {row.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg leading-tight">{row.title}</span>
              {row.sub && (
                <span className="block text-sm text-[var(--dim)]">
                  {row.sub}
                </span>
              )}
            </span>
            <IconChevronRight
              size={19}
              className="shrink-0 text-[var(--dim)]"
            />
          </button>
        ))}
      </div>

      <div className="mt-8 px-4">
        <div
          className="flex items-center justify-around border-t pt-3"
          style={{ borderColor: "var(--border)" }}
          role="tablist"
          aria-label="Shared media"
        >
          <span aria-hidden="true" className="text-[var(--text)]">
            <IconReels size={26} />
          </span>
          <span aria-hidden="true" className="text-[var(--dim)]">
            <IconGrid size={26} />
          </span>
          <span aria-hidden="true" className="text-[var(--dim)]">
            <IconLink size={26} />
          </span>
        </div>
        <p className="py-6 text-center text-sm text-[var(--dim)]">
          Shared media from the real thread lives in Instagram. This practice
          thread holds just the message you're replying to.
        </p>
      </div>
    </section>
  );
}

function ProfileView({ handle, onBack, onMessage }) {
  const profile = profileOf(handle);
  return (
    <section className="pt-1">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chat details"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-alt)]"
        >
          <IconBack size={22} />
        </button>
        <a
          href={`https://www.instagram.com/${handle}/`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open @${handle} on Instagram`}
          className="flex items-center gap-1.5 text-xl font-bold"
        >
          @{handle}
          {profile.verified && <VerifiedBadge size={16} />}
        </a>
      </div>

      <div className="flex items-center gap-6 px-5 pt-3">
        <Avatar handle={handle} size={86} ring />
        <div className="flex flex-1 items-center justify-around text-center">
          <div>
            <p className="text-lg font-bold">
              {profile.posts != null ? profile.posts : "-"}
            </p>
            <p className="text-sm text-[var(--dim)]">posts</p>
          </div>
          <div>
            <p className="text-lg font-bold">-</p>
            <p className="text-sm text-[var(--dim)]">followers</p>
          </div>
          <div>
            <p className="text-lg font-bold">-</p>
            <p className="text-sm text-[var(--dim)]">following</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-3">
        {profile.name && (
          <p className="text-base font-semibold">{profile.name}</p>
        )}
        {profile.category && (
          <p className="text-sm text-[var(--dim)]">{profile.category}</p>
        )}
        {profile.bio ? (
          profile.bio.map((line) => (
            <p key={line} className="text-base leading-snug">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm leading-relaxed text-[var(--dim)]">
            No profile details are saved for @{handle} in the simulator yet.
            This view fills in where her real profile data is on hand.
          </p>
        )}
        {profile.link && (
          <p
            className="mt-1 flex items-center gap-1.5 text-base font-medium"
            style={{ color: "#8ab4ff" }}
          >
            <IconLink size={15} />
            {profile.link}
          </p>
        )}
        {profile.followedBy && (
          <div className="mt-3 flex items-center gap-2.5">
            <span className="flex -space-x-2">
              <Avatar handle={handle} size={26} />
            </span>
            <p className="text-sm">
              <span className="text-[var(--dim)]">Followed by </span>
              <span className="font-semibold">{profile.followedBy}</span>
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-5 pt-4">
        <span className="flex-1 rounded-xl bg-[var(--surface-alt)] py-2.5 text-center text-base font-semibold">
          Following
        </span>
        <button
          type="button"
          onClick={onMessage}
          className="flex-1 rounded-xl bg-[var(--surface-alt)] py-2.5 text-base font-semibold"
        >
          Message
        </button>
      </div>

      <div className="px-5 pt-5">
        <div className="flex flex-col items-center w-fit">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-alt)] text-2xl"
            aria-hidden="true"
          >
            ✨
          </span>
          <span className="mt-1 text-xs">Highlights</span>
        </div>
      </div>

      <div
        className="mt-5 flex items-center justify-around border-t pt-2.5"
        style={{ borderColor: "var(--border)" }}
        aria-hidden="true"
      >
        <IconGrid size={26} />
        <span className="text-[var(--dim)]">
          <IconReels size={26} />
        </span>
        <span className="text-[var(--dim)]">
          <IconPerson size={26} />
        </span>
      </div>
      {profile.posts != null ? (
        <div className="grid grid-cols-3 gap-[2px] pt-2">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="relative aspect-[3/4]"
              style={{
                background:
                  AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] ??
                  "var(--surface-alt)",
              }}
              aria-hidden="true"
            >
              <span className="absolute top-1.5 right-1.5 text-white">
                <IconPlay size={15} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-[var(--dim)]">
          Their posts aren't loaded in the simulator.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// One comment item: incoming message, draft, revision, verdict (the review
// card used for comments; DMs use the chat view above)
// ---------------------------------------------------------------------------

function ItemCard({ item, onNext, hasNext, onGoTraining }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("listening");
  const [revision, setRevision] = useState(item.revision_text ?? "");
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  const [verdictChoice, setVerdictChoice] = useState(
    item.verdict === "pending" ? null : item.verdict,
  );
  const verdict = verdictChoice ?? (item.draft_text ? "approved" : "edited");
  const [saveError, setSaveError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [saved, setSaved] = useState(item.verdict !== "pending");
  const [copiedWhich, setCopiedWhich] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revealedActual, setRevealedActual] = useState(
    item.revealed ? item.actual_reply : null,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["items"] });

  const draftMutation = useMutation({
    mutationFn: async (variant) =>
      await api.dm_generatedraft({
        id: item.id,
        mode: item.kind === "dm" ? "dm" : mode,
        variant,
      }),
    onSuccess: () => {
      setDraftError("");
      invalidate();
    },
    onError: (error) => setDraftError(error.message),
  });
  // With no model on the server, Muse writes the draft: it waits until Muse hands it back.
  const drafting = draftMutation.isPending || item.draft_wanted;
  const draftLabel = draftMutation.isPending
    ? "Drafting…"
    : "Waiting for Muse…";

  const saveMutation = useMutation({
    mutationFn: async () =>
      await api.dm_savereview({
        id: item.id,
        revision_text: revision.trim(),
        feedback: feedback.trim(),
        verdict,
      }),
    onSuccess: () => {
      setSaved(true);
      setSaveError("");
      invalidate();
    },
    onError: (error) => setSaveError(error.message),
  });

  const publishMutation = useMutation({
    mutationFn: async () =>
      await api.dm_publishitem({
        id: item.id,
        revision_text: revision.trim(),
        feedback: feedback.trim(),
        verdict,
      }),
    onSuccess: () => {
      setSaved(true);
      setSaveError("");
      invalidate();
    },
    onError: (error) => setSaveError(error.message),
  });

  const revealMutation = useMutation({
    mutationFn: async () => await api.dm_revealactual({ id: item.id }),
    onSuccess: (data) => {
      setRevealedActual(data.actual_reply);
      invalidate();
    },
    onError: (error) => setSaveError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => await api.dm_deleteitem({ id: item.id }),
    onSuccess: () => invalidate(),
    onError: (error) => setSaveError(error.message),
  });

  const flashCopied = (which) => {
    setCopiedWhich(which);
    window.setTimeout(() => setCopiedWhich(null), 2000);
  };

  const handleCopyDraft = async () => {
    if (!item.draft_text) return;
    if (await copyToClipboard(item.draft_text)) flashCopied("draft");
  };

  const handleCopyIntoRevision = async () => {
    if (!item.draft_text) return;
    await copyToClipboard(item.draft_text);
    setRevision(item.draft_text);
    setVerdictChoice("approved");
    setSaved(false);
    flashCopied("into");
  };

  const handleRevisionChange = (value) => {
    setRevision(value);
    setSaved(false);
    if (
      verdict === "approved" &&
      item.draft_text &&
      value.trim() !== "" &&
      value.trim() !== item.draft_text.trim()
    ) {
      setVerdictChoice("edited");
    }
  };

  const approvingAsIs =
    verdict === "approved" && !revision.trim() && !!item.draft_text;

  const handleSave = () => {
    if (!revision.trim() && !approvingAsIs) {
      setSaveError(
        item.draft_text
          ? "Your revision field is empty. Either pick “Approved as-is” to save the draft word for word, or copy the draft in and make it yours first."
          : "Your revision field is empty. Write your own reply first. That field is the source of truth.",
      );
      return;
    }
    setSaveError("");
    saveMutation.mutate();
  };

  const handlePublish = () => {
    if (!revision.trim() && !approvingAsIs) {
      setSaveError(
        item.draft_text
          ? "Nothing to publish yet. Either pick “Approved as-is” to publish the draft word for word, or write your answer in the revision field first."
          : "Nothing to publish yet. Draft a reply first, or write your own in the revision field.",
      );
      return;
    }
    setSaveError("");
    publishMutation.mutate();
  };

  const draftMatchesRevision =
    item.draft_text != null &&
    revision.trim() !== "" &&
    revision.trim() === item.draft_text.trim();

  return (
    <article
      className="mt-5 rounded-[var(--radius)] p-5"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={item.kind === "dm" ? "accent" : "gold"}>
          {kindLabel(item.kind)}
        </Badge>
        <Badge tone="dim">{sourceLabel(item.source)}</Badge>
        {item.sender && (
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            @{handleOf(item)}
            {profileOf(handleOf(item)).verified && <VerifiedBadge size={12} />}
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--dim)]">
          {new Date(item.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      <blockquote className="mt-4 text-2xl leading-snug font-medium">
        “{item.incoming_text}”
      </blockquote>

      {item.context_text && (
        <div
          className="mt-3 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed"
          style={{ background: "var(--surface-alt)" }}
        >
          <span className="font-semibold">Context: </span>
          {item.context_text}
        </div>
      )}

      {item.has_actual && !revealedActual && (
        <p
          className="mt-3 rounded-lg px-3.5 py-2.5 text-sm"
          style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
        >
          Blind holdout: what you actually replied is sealed. It unlocks only
          after you save your revision, so this stays an honest blind test.
        </p>
      )}

      {item.publish_status === "publishing" && (
        <p
          className="mt-3 rounded-lg px-3.5 py-2.5 text-sm"
          style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
        >
          Publishing… your approved answer was handed to Muse to send on
          Instagram. This card updates when it lands.
        </p>
      )}
      {item.publish_status === "published" && (
        <div
          className="mt-3 rounded-lg px-3.5 py-2.5 text-sm"
          style={{ background: "var(--sage-soft)", color: "var(--sage)" }}
        >
          <span className="font-semibold">Published to Instagram</span>
          {item.published_at
            ? ` ${new Date(item.published_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`
            : ""}
          {item.published_text ? (
            <span className="mt-1 block whitespace-pre-line text-[var(--text)]">
              “{item.published_text}”
            </span>
          ) : null}
        </div>
      )}
      {item.publish_status === "publish_failed" && (
        <p
          className="mt-3 rounded-lg px-3.5 py-2.5 text-sm"
          style={{ background: "#3a1620", color: "var(--danger)" }}
        >
          That publish did not go through
          {item.publish_error ? `: ${item.publish_error}` : "."} You can tap
          Publish to try again.
        </p>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold tracking-wide text-[var(--dim)]">
          Muse's draft
        </h3>
        {item.kind === "comment" && !item.draft_text && (
          <div
            className="mt-2 flex gap-2"
            role="group"
            aria-label="Draft style"
          >
            {[
              { id: "listening", label: "Listening" },
              { id: "deterrence", label: "Deterrence" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium"
                style={
                  mode === m.id
                    ? { background: "var(--accent)", color: "#fff" }
                    : {
                        background: "var(--surface-alt)",
                        color: "var(--text)",
                      }
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {item.draft_text ? (
          <div
            className="mt-2 rounded-lg px-4 py-3"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="whitespace-pre-line text-base leading-relaxed">
              {item.draft_text}
            </p>
            {item.draft_mode && (
              <p className="mt-2 text-xs text-[var(--dim)]">
                Drafted in{" "}
                {item.draft_mode === "dm"
                  ? "DM"
                  : item.draft_mode === "deterrence"
                    ? "deterrence"
                    : "listening"}{" "}
                style
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--dim)]">
            {item.draft_wanted
              ? "Muse is writing this draft. It shows here when it's ready."
              : "No draft yet. Muse drafts blind, from the message alone, in your voice."}
          </p>
        )}
        {draftError && (
          <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
            {draftError}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!item.draft_text ? (
            <button
              type="button"
              onClick={() => draftMutation.mutate("fresh")}
              disabled={drafting}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {drafting ? draftLabel : "Draft a reply in my voice"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCopyDraft}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {copiedWhich === "draft" ? "Copied ✓" : "Copy draft"}
              </button>
              <button
                type="button"
                onClick={handleCopyIntoRevision}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                {copiedWhich === "into"
                  ? "Pasted below ✓"
                  : "Copy into revision ↓"}
              </button>
              <button
                type="button"
                onClick={() => draftMutation.mutate("again")}
                disabled={drafting}
                className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {drafting ? draftLabel : "Again"}
              </button>
              {item.kind === "comment" && item.draft_mode === "deterrence" && (
                <button
                  type="button"
                  onClick={() => draftMutation.mutate("sharper")}
                  disabled={drafting}
                  className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Sharper
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <label
          htmlFor={`revision-${item.id}`}
          className="text-sm font-semibold tracking-wide text-[var(--dim)]"
        >
          Your revision: the source of truth
        </label>
        <textarea
          id={`revision-${item.id}`}
          {...FIELDS.dm_savereview.revision_text}
          value={revision}
          onChange={(e) => handleRevisionChange(e.target.value)}
          rows={3}
          placeholder="Paste the draft here and make it yours, or write your reply from scratch…"
          className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base leading-relaxed outline-none"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
        {draftMatchesRevision && (
          <p className="mt-1.5 text-xs" style={{ color: "var(--sage)" }}>
            Matches the draft word for word.
          </p>
        )}
        {approvingAsIs && (
          <p className="mt-1.5 text-xs" style={{ color: "var(--sage)" }}>
            Approving as-is: no edit needed. Save Review keeps the draft as your
            answer, and Publish sends it to Instagram word for word.
          </p>
        )}
        <label
          htmlFor={`feedback-${item.id}`}
          className="mt-4 block text-sm font-semibold tracking-wide text-[var(--dim)]"
        >
          Feedback for retraining
        </label>
        <textarea
          id={`feedback-${item.id}`}
          {...FIELDS.dm_savereview.feedback}
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            setSaved(false);
          }}
          rows={2}
          placeholder="What worked, what felt off, what to do next time…"
          className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base leading-relaxed outline-none"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />

        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Verdict"
        >
          {[
            { id: "approved", label: "Approved as-is" },
            { id: "edited", label: "I edited it" },
            { id: "needs_work", label: "Needs work" },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={verdict === v.id}
              onClick={() => {
                setVerdictChoice(v.id);
                setSaved(false);
              }}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium"
              style={
                verdict === v.id
                  ? {
                      background:
                        v.id === "needs_work" ? "var(--gold)" : "var(--sage)",
                      color: "#fff",
                    }
                  : {
                      background: "var(--surface-alt)",
                      color: "var(--text)",
                    }
              }
            >
              {v.label}
            </button>
          ))}
        </div>

        {saveError && (
          <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
            {saveError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--sage)" }}
          >
            {saveMutation.isPending
              ? "Saving…"
              : saved
                ? "Saved ✓ · save again"
                : "Save review"}
          </button>
          {item.source === "holdout" ? (
            <span className="text-xs text-[var(--dim)]">
              Holdouts are practice only. You already replied to this one on
              Instagram.
            </span>
          ) : item.publish_status === "published" ? (
            <span
              className="rounded-full px-4 py-2.5 text-sm font-semibold"
              style={{ background: "var(--sage-soft)", color: "var(--sage)" }}
            >
              Published ✓
            </span>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={
                publishMutation.isPending ||
                item.publish_status === "publishing"
              }
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {publishMutation.isPending || item.publish_status === "publishing"
                ? "Publishing…"
                : item.publish_status === "publish_failed"
                  ? "Publish again"
                  : "Publish"}
            </button>
          )}
          {saved && hasNext && (
            <button
              type="button"
              onClick={onNext}
              className="rounded-full px-4 py-2.5 text-sm font-semibold"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              Next in queue →
            </button>
          )}
          {saved && !hasNext && (
            <button
              type="button"
              onClick={onGoTraining}
              className="rounded-full px-4 py-2.5 text-sm font-semibold"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              See training data →
            </button>
          )}
        </div>
      </div>

      {item.has_actual && saved && !revealedActual && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => revealMutation.mutate()}
            disabled={revealMutation.isPending}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--gold)" }}
          >
            {revealMutation.isPending
              ? "Unsealing…"
              : "Reveal what I actually said"}
          </button>
        </div>
      )}
      {revealedActual && (
        <div
          className="mt-6 rounded-lg px-4 py-3"
          style={{ background: "var(--gold-soft)" }}
        >
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--gold)" }}
          >
            What you actually said
          </h3>
          <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed">
            {revealedActual}
          </p>
          <p className="mt-2 text-xs text-[var(--dim)]">
            Compare it with the draft and your revision above. The gaps are
            exactly what the feedback field is for.
          </p>
        </div>
      )}

      <div
        className="mt-6 border-t pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        {confirmDelete ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--dim)]">Remove this item?</span>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              className="rounded-full px-3 py-1.5 font-semibold text-white"
              style={{ background: "var(--danger)" }}
            >
              Yes, remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-full px-3 py-1.5 font-semibold"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-[var(--dim)] underline"
          >
            Remove from queue
          </button>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Ready to Publish: reviewed answers that have not been published yet.
// Shows their message and her answer as a mini chat thread.
// ---------------------------------------------------------------------------

function ReadyView({ items, onOpen, onRefresh, isRefreshing }) {
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => api.dm_getaccount({}),
    staleTime: 60_000,
  });
  const account = accountQuery.data?.handle ?? null;
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState("");

  const ready = items.filter(
    (i) =>
      i.verdict !== "pending" &&
      i.source !== "holdout" &&
      (i.publish_status === "unpublished" ||
        i.publish_status === "publish_failed"),
  );
  const publishing = items.filter((i) => i.publish_status === "publishing");
  const published = items.filter((i) => i.publish_status === "published");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["items"] });

  const publishOne = (item) =>
    api.dm_publishitem({
      id: item.id,
      revision_text: item.revision_text ?? "",
      feedback: item.feedback ?? "",
      verdict: item.verdict === "pending" ? "approved" : item.verdict,
    });

  const publishMutation = useMutation({
    mutationFn: async (item) => await publishOne(item),
    onSuccess: () => {
      setError("");
      invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const publishSelectedMutation = useMutation({
    mutationFn: async (chosen) => {
      for (const item of chosen) {
        await publishOne(item);
      }
    },
    onSuccess: () => {
      setError("");
      setSelectedIds([]);
      invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const toggleSelected = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const chosen = ready.filter((i) => selectedIds.includes(i.id));

  return (
    <section className="px-4 pt-4 sm:px-0">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold leading-tight">Ready to publish</h1>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh queue"
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          <span
            aria-hidden="true"
            className={
              isRefreshing ? "inline-block animate-spin" : "inline-block"
            }
          >
            ↻
          </span>
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
        These are answers you already reviewed and saved but did not publish
        yet. What you see is exactly what will be sent: their message, and your
        answer under it. {sendsAs(account)}
      </p>

      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {publishing.length > 0 && (
        <div
          className="mt-4 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
        >
          Publishing now:{" "}
          {publishing
            .map((i) => (i.sender ? `@${handleOf(i)}` : "one reply"))
            .join(", ")}
          . This list updates as each one lands.
        </div>
      )}

      {ready.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--dim)]">
          Nothing waiting to publish. When you save a review without tapping
          Publish, your answer lands here, ready when you are.
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => publishSelectedMutation.mutate(chosen)}
              disabled={
                chosen.length === 0 || publishSelectedMutation.isPending
              }
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {publishSelectedMutation.isPending
                ? "Publishing…"
                : chosen.length > 0
                  ? `Publish selected (${chosen.length})`
                  : "Publish selected"}
            </button>
            <span className="text-sm text-[var(--dim)]">
              Tick the ones you want, or publish one at a time below.
            </span>
          </div>

          <ul className="mt-4 space-y-3">
            {ready.map((item) => {
              const handle = handleOf(item);
              const answer = item.revision_text ?? item.draft_text ?? "";
              return (
                <li
                  key={item.id}
                  className="rounded-[var(--radius)] px-4 py-4"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar handle={handle} size={30} />
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      @{handle}
                      {profileOf(handle).verified && (
                        <VerifiedBadge size={12} />
                      )}
                    </span>
                    <Badge
                      tone={item.verdict === "needs_work" ? "gold" : "sage"}
                    >
                      {verdictLabel(item.verdict)}
                    </Badge>
                    {item.publish_status === "publish_failed" && (
                      <Badge tone="accent">Publish failed</Badge>
                    )}
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${
                          item.sender ? `@${handle}'s` : "this"
                        } reply to publish`}
                        className="h-5 w-5"
                      />
                      Select
                    </label>
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <Avatar handle={handle} size={24} />
                    <div className="max-w-[80%] whitespace-pre-line rounded-[20px] bg-[var(--bubble-in)] px-3.5 py-2.5 text-[15px] leading-snug">
                      {item.incoming_text}
                    </div>
                  </div>
                  {item.context_text && (
                    <p className="mt-2 pl-9 text-[13px] text-[var(--dim)]">
                      Context: {item.context_text}
                    </p>
                  )}
                  <div className="mt-2 flex flex-col items-end gap-1">
                    {answer
                      .split("\n")
                      .filter((l) => l.trim() !== "")
                      .map((line, i) => (
                        <div
                          key={i}
                          className="max-w-[82%] whitespace-pre-line rounded-[20px] px-3.5 py-2.5 text-[15px] leading-snug text-white"
                          style={{ background: "var(--bubble-gradient)" }}
                        >
                          {line}
                        </div>
                      ))}
                  </div>

                  {item.publish_status === "publish_failed" &&
                    item.publish_error && (
                      <p
                        className="mt-2 text-sm"
                        style={{ color: "var(--danger)" }}
                      >
                        Last try did not go through: {item.publish_error}
                      </p>
                    )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => publishMutation.mutate(item)}
                      disabled={publishMutation.isPending}
                      className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: "var(--accent)" }}
                    >
                      {item.publish_status === "publish_failed"
                        ? "Publish again"
                        : "Publish"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(item.id)}
                      className="rounded-full px-4 py-2 text-sm font-semibold"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      Open in Chats
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {published.length > 0 && (
        <>
          <h2 className="mt-8 text-xl font-bold">Published</h2>
          <ul className="mt-3 space-y-2">
            {published.map((item) => (
              <li
                key={item.id}
                className="rounded-[var(--radius)] px-4 py-3"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.kind === "dm" ? "accent" : "gold"}>
                    {kindLabel(item.kind)}
                  </Badge>
                  {item.sender && (
                    <span className="text-sm font-semibold">
                      @{handleOf(item)}
                    </span>
                  )}
                  <span className="ml-auto">
                    <Badge tone="sage">Published ✓</Badge>
                  </span>
                </span>
                <span className="mt-1.5 block truncate text-sm text-[var(--dim)]">
                  {item.incoming_text}
                </span>
                <span className="mt-0.5 block truncate text-sm">
                  You sent: {item.published_text ?? item.revision_text ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Add: put a new message in the queue
// ---------------------------------------------------------------------------

function AddView({ onCreated }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("dm");
  const [source, setSource] = useState("live");
  const [sender, setSender] = useState("");
  const [incoming, setIncoming] = useState("");
  const [context, setContext] = useState("");
  const [actual, setActual] = useState("");
  const [mediaId, setMediaId] = useState("");
  const [commentId, setCommentId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: async () =>
      await api.dm_createitem({
        kind,
        sender: sender.trim(),
        incoming_text: incoming.trim(),
        context_text: context.trim() ? context.trim() : undefined,
        source,
        actual_reply:
          source === "holdout" && actual.trim() ? actual.trim() : undefined,
        media_id:
          kind === "comment" && mediaId.trim() ? mediaId.trim() : undefined,
        comment_id:
          kind === "comment" && commentId.trim() ? commentId.trim() : undefined,
        thread_id:
          kind === "dm" && threadId.trim() ? threadId.trim() : undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      onCreated(data.id);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = () => {
    if (!incoming.trim()) {
      setError("Paste the message you want to practice replying to first.");
      return;
    }
    if (source === "holdout" && !actual.trim()) {
      setError(
        "A blind holdout needs what you actually replied. It stays sealed until you save your revision.",
      );
      return;
    }
    setError("");
    createMutation.mutate();
  };

  const inputStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <section className="px-4 pt-4 sm:px-0">
      <h1 className="text-3xl font-bold leading-tight">Add a message</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
        Paste any DM or comment here instead of answering it in Instagram. Muse
        drafts blind and you review it here.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <span className="text-sm font-semibold tracking-wide text-[var(--dim)]">
            Type
          </span>
          <div
            className="mt-2 flex gap-2"
            role="group"
            aria-label="Message type"
          >
            {[
              { id: "dm", label: "DM" },
              { id: "comment", label: "Comment" },
            ].map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => setKind(k.id)}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={
                  kind === k.id
                    ? { background: "var(--accent)", color: "#fff" }
                    : { background: "var(--surface-alt)", color: "var(--text)" }
                }
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-semibold tracking-wide text-[var(--dim)]">
            Where it comes from
          </span>
          <div className="mt-2 space-y-2">
            {[
              {
                id: "live",
                label: "Live queue",
                hint: "Still waiting for a reply. No answer exists yet, so the test is genuinely blind.",
              },
              {
                id: "holdout",
                label: "Blind holdout",
                hint: "You already replied to this one. Your real reply is sealed until your revision is saved.",
              },
              {
                id: "paste",
                label: "Pasted practice",
                hint: "From anywhere else: another platform, a screenshot, a what-if.",
              },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={source === s.id}
                onClick={() => setSource(s.id)}
                className="block w-full rounded-[var(--radius)] px-4 py-3 text-left"
                style={{
                  background:
                    source === s.id ? "var(--accent-soft)" : "var(--surface)",
                  border: `1px solid ${source === s.id ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="mt-0.5 block text-sm text-[var(--dim)]">
                  {s.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="add-sender"
            className="text-sm font-semibold tracking-wide text-[var(--dim)]"
          >
            From (their @handle, optional)
          </label>
          <input
            id="add-sender"
            {...FIELDS.dm_createitem.sender}
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="theirhandle"
            className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="add-incoming"
            className="text-sm font-semibold tracking-wide text-[var(--dim)]"
          >
            Their message
          </label>
          <textarea
            id="add-incoming"
            {...FIELDS.dm_createitem.incoming_text}
            value={incoming}
            onChange={(e) => setIncoming(e.target.value)}
            rows={4}
            placeholder="Paste their DM or comment exactly as they wrote it…"
            className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base leading-relaxed outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="add-context"
            className="text-sm font-semibold tracking-wide text-[var(--dim)]"
          >
            Context (optional)
          </label>
          <textarea
            id="add-context"
            {...FIELDS.dm_createitem.context_text}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder="The post caption, or what came earlier in the thread…"
            className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base leading-relaxed outline-none"
            style={inputStyle}
          />
        </div>

        {source !== "holdout" && kind === "comment" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="add-media-id"
                className="text-sm font-semibold tracking-wide text-[var(--dim)]"
              >
                Instagram post ID (optional)
              </label>
              <input
                id="add-media-id"
                {...FIELDS.dm_createitem.media_id}
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
                placeholder="Only if you have it. Publish finds the comment without it"
                className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                htmlFor="add-comment-id"
                className="text-sm font-semibold tracking-wide text-[var(--dim)]"
              >
                Instagram comment ID (optional)
              </label>
              <input
                id="add-comment-id"
                {...FIELDS.dm_createitem.comment_id}
                value={commentId}
                onChange={(e) => setCommentId(e.target.value)}
                placeholder="Makes Publish reply to exactly this comment"
                className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base outline-none"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {source !== "holdout" && kind === "dm" && (
          <div>
            <label
              htmlFor="add-thread-id"
              className="text-sm font-semibold tracking-wide text-[var(--dim)]"
            >
              Instagram thread ID (optional)
            </label>
            <input
              id="add-thread-id"
              {...FIELDS.dm_createitem.thread_id}
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              placeholder="Only if you have it. Publish finds the thread by sender without it"
              className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base outline-none"
              style={inputStyle}
            />
          </div>
        )}

        {source === "holdout" && (
          <div>
            <label
              htmlFor="add-actual"
              className="text-sm font-semibold tracking-wide text-[var(--dim)]"
            >
              What you actually replied (sealed)
            </label>
            <textarea
              id="add-actual"
              {...FIELDS.dm_createitem.actual_reply}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              rows={3}
              placeholder="Your real reply. Muse never sees it while drafting, and it stays hidden until your revision is saved…"
              className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-base leading-relaxed outline-none"
              style={inputStyle}
            />
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {createMutation.isPending ? "Adding…" : "Add to the queue"}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Training: reviewed revisions are the retraining corpus
// ---------------------------------------------------------------------------

function TrainingView({ items, stats }) {
  const [copied, setCopied] = useState(false);
  const reviewed = items.filter((i) => i.verdict !== "pending");

  const exportQuery = useQuery({
    queryKey: ["training-export"],
    queryFn: () => api.dm_exporttraining({}),
  });

  const handleCopyJson = async () => {
    if (!exportQuery.data) return;
    if (await copyToClipboard(JSON.stringify(exportQuery.data, null, 2))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!exportQuery.data) return;
    const blob = new Blob([JSON.stringify(exportQuery.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reply-training.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const approvedPct =
    stats && stats.reviewed > 0
      ? Math.round((stats.approved / stats.reviewed) * 100)
      : 0;

  return (
    <section className="px-4 pt-4 sm:px-0">
      <h1 className="text-3xl font-bold leading-tight">Training data</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
        Every saved revision is a gold example: what they said, what Muse
        drafted, and what you actually wanted sent. This is the set that
        retrains the drafter.
      </p>

      {stats && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {[
            { label: "Reviewed", value: String(stats.reviewed) },
            { label: "Approved as-is", value: `${approvedPct}%` },
            { label: "Edited by you", value: String(stats.edited) },
            { label: "Needs work", value: String(stats.needs_work) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--radius)] px-4 py-3"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-sm text-[var(--dim)]">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopyJson}
          disabled={!exportQuery.data || exportQuery.data.count === 0}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {copied ? "Copied ✓" : "Copy training JSON"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!exportQuery.data || exportQuery.data.count === 0}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          Download JSON
        </button>
      </div>

      {reviewed.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--dim)]">
          Nothing reviewed yet. Save your first review in the Chats tab and it
          will appear here.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {[...reviewed].reverse().map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--radius)] px-4 py-3.5"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.kind === "dm" ? "accent" : "gold"}>
                  {kindLabel(item.kind)}
                </Badge>
                <Badge tone={item.verdict === "needs_work" ? "gold" : "sage"}>
                  {verdictLabel(item.verdict)}
                </Badge>
                {item.publish_status === "published" && (
                  <Badge tone="sage">Published ✓</Badge>
                )}
                {item.publish_status === "publishing" && (
                  <Badge tone="gold">Publishing…</Badge>
                )}
                {item.publish_status === "publish_failed" && (
                  <Badge tone="accent">Publish failed</Badge>
                )}
                {item.sender && (
                  <span className="text-sm font-semibold">
                    @{handleOf(item)}
                  </span>
                )}
              </div>
              <p className="mt-2.5 text-sm text-[var(--dim)]">
                They said: {item.incoming_text}
              </p>
              {item.draft_text && (
                <p className="mt-1.5 text-sm text-[var(--dim)]">
                  Muse drafted: {item.draft_text}
                </p>
              )}
              <p className="mt-2 text-lg leading-snug font-medium">
                {item.revision_text}
              </p>
              {item.feedback && (
                <p className="mt-1.5 text-sm italic text-[var(--dim)]">
                  Your note: {item.feedback}
                </p>
              )}
              {item.revealed && item.actual_reply && (
                <p className="mt-1.5 text-sm" style={{ color: "var(--gold)" }}>
                  You actually said: {item.actual_reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Voice: the rules the drafter follows
// ---------------------------------------------------------------------------

function VoiceView() {
  const queryClient = useQueryClient();
  const voiceQuery = useQuery({
    queryKey: ["voice-profile"],
    queryFn: () => api.dm_getvoiceprofile({}),
  });
  const [draft, setDraft] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (voiceQuery.data && draft === null) {
      setDraft(voiceQuery.data.sections.map((s) => ({ ...s })));
    }
  }, [voiceQuery.data, draft]);

  const sections = draft ?? voiceQuery.data?.sections ?? [];
  const dirty =
    draft !== null &&
    JSON.stringify(draft) !== JSON.stringify(voiceQuery.data?.sections ?? []);

  const saveMutation = useMutation({
    mutationFn: async () =>
      await api.dm_savevoiceprofile({ sections: draft ?? [] }),
    onSuccess: () => {
      setSaveError("");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ["voice-profile"] });
    },
    onError: (error) => setSaveError(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => await api.dm_resetvoiceprofile({}),
    onSuccess: (data) => {
      setDraft(data.sections.map((s) => ({ ...s })));
      setSaveError("");
      queryClient.invalidateQueries({ queryKey: ["voice-profile"] });
    },
    onError: (error) => setSaveError(error.message),
  });

  const updateSection = (index, patch) => {
    setDraft((prev) =>
      (prev ?? sections).map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const removeSection = (index) => {
    setDraft((prev) => (prev ?? sections).filter((_, i) => i !== index));
  };

  const addSection = () => {
    setDraft((prev) => [
      ...(prev ?? sections),
      { title: "New section", body: "Write the rule here…" },
    ]);
  };

  return (
    <section className="px-4 pt-4 sm:px-0">
      <h1 className="text-3xl font-bold leading-tight">
        The voice behind the drafts
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">
        This is your written voice source. Every field is editable, and your
        changes apply to the next draft Muse writes. One rule per line. The
        starting wording comes from Muse, and Restore puts it back.
      </p>

      {voiceQuery.isPending ? (
        <p className="py-10 text-center text-sm text-[var(--dim)]">
          Loading your voice…
        </p>
      ) : voiceQuery.isError ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[var(--dim)]">
            Your voice profile could not be loaded.
          </p>
          <button
            type="button"
            onClick={() => voiceQuery.refetch()}
            className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {sections.map((s, i) => (
              <div
                key={i}
                className="rounded-[var(--radius)] px-4 py-3.5"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-2">
                  <label htmlFor={`voice-title-${i}`} className="sr-only">
                    Section title
                  </label>
                  <textarea
                    id={`voice-title-${i}`}
                    value={s.title}
                    maxLength={120}
                    rows={s.title.length > 30 ? 2 : 1}
                    onChange={(e) =>
                      updateSection(i, { title: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    className="min-w-0 flex-1 resize-none bg-transparent text-lg leading-snug font-semibold outline-none"
                    style={{ color: "var(--text)" }}
                  />
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    aria-label={`Remove section ${s.title}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--dim)]"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <IconX size={14} />
                  </button>
                </div>
                <label htmlFor={`voice-body-${i}`} className="sr-only">
                  Rules for {s.title}
                </label>
                <textarea
                  id={`voice-body-${i}`}
                  value={s.body}
                  maxLength={6000}
                  onChange={(e) => updateSection(i, { body: e.target.value })}
                  rows={Math.min(10, Math.max(2, s.body.split("\n").length))}
                  className="mt-2 w-full resize-y rounded-xl bg-[var(--bg)] px-3.5 py-2.5 text-sm leading-relaxed outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSection}
            className="mt-3 rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            + Add a section
          </button>

          {saveError && (
            <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
              {saveError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => {
                if (sections.some((s) => !s.title.trim() || !s.body.trim())) {
                  setSaveError(
                    "Every section needs a title and at least one rule. Fill in or remove the empty one first.",
                  );
                  return;
                }
                setSaveError("");
                saveMutation.mutate();
              }}
              disabled={!dirty || saveMutation.isPending}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--sage)" }}
            >
              {saveMutation.isPending
                ? "Saving…"
                : justSaved
                  ? "Saved ✓"
                  : "Save voice"}
            </button>
            {voiceQuery.data?.is_custom && (
              <button
                type="button"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {resetMutation.isPending
                  ? "Restoring…"
                  : "Restore the original"}
              </button>
            )}
            {dirty && !justSaved && (
              <span className="text-sm text-[var(--dim)]">
                Unsaved changes. Drafts keep using the saved voice until you
                save.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
