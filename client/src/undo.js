// Undo and redo for the review screen. Each entry says how to put a change back (before) and how to
// make it again (after); the screen applies them through the same calls that made the change.

/** A history that keeps the last `limit` changes. A new change after an undo clears redo. */
export function createHistory(limit = 50) {
  const done = [];
  let undone = [];
  return {
    push(entry) {
      done.push(entry);
      if (done.length > limit) done.shift();
      undone = [];
    },
    undo() {
      const entry = done.pop() || null;
      if (entry) undone.push(entry);
      return entry;
    },
    redo() {
      const entry = undone.pop() || null;
      if (entry) done.push(entry);
      return entry;
    },
    /** The step undo or redo would take next, without taking it, or null (1.13.5). */
    peek(direction) {
      const side = direction === "undo" ? done : undone;
      return side[side.length - 1] || null;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    /** Whether undo can still take this entry back (1.34.0: Rewind takes back a swipe only while it's there). */
    includes: (entry) => done.includes(entry),
    /** Takes an entry out wherever it is: Rewind took it back another way, or it never happened. Answers where it was in
     *  undo's list, or -1. */
    remove(entry) {
      const u = undone.indexOf(entry);
      if (u >= 0) undone.splice(u, 1);
      const at = done.indexOf(entry);
      if (at >= 0) done.splice(at, 1);
      return at;
    },
    /** Puts an entry back at the spot remove answered, when what took it out didn't happen. */
    insert(entry, at) {
      done.splice(Math.max(0, Math.min(at, done.length)), 0, entry);
      if (done.length > limit) done.shift();
    },
  };
}
