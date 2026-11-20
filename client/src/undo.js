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
  };
}
