import { useSyncExternalStore } from "react";

// Whether she's in the middle of something, by screen (1.14). Covers says so while its editor or a sheet is open; the
// update notes, above both screens, wait until nothing is (a git copy updates itself only at a quiet minute, 1.13.10).
const open = new Set();
const listeners = new Set();

export function setBusy(screen, on) {
  if (open.has(screen) === Boolean(on)) return;
  if (on) open.add(screen); else open.delete(screen);
  for (const l of listeners) l();
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const anyBusy = () => open.size > 0;

export function useAnyBusy() {
  return useSyncExternalStore(subscribe, anyBusy, anyBusy);
}
