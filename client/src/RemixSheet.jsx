import { useEffect, useRef, useState } from "react";
import Icon from "./icons.jsx";

const PROMPT_MAX = 300;
const OPTIONS = [
  { key: "quote", label: "New quote", placeholder: "Optional, like slow mornings" },
  { key: "song", label: "New song", placeholder: "Optional, like upbeat summer" },
];

// The remix menu (1.17.0; Rose #796 and #797, Quill #798). New quote and New song, each a button with a small prompt box
// under it. Typing in a box ticks its button. Unticking keeps the words but leaves them out. Submit needs one ticked.
// Since 1.21.0 Submit changes this cover right away (Big Edit item 16). A remix that can't pick keeps the sheet open with
// the reason, until she changes what's ticked or typed.
export default function RemixSheet({ quotesLocked, onSubmit, onClose }) {
  const [parts, setParts] = useState({ quote: { on: false, prompt: "" }, song: { on: false, prompt: "" } });
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !sending) { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);
  const set = (key, patch) => { setProblem(null); setParts((p) => ({ ...p, [key]: { ...p[key], ...patch } })); };
  const ready = parts.quote.on || parts.song.on;
  const firstKey = quotesLocked ? "song" : "quote"; // focus starts on the first option she can tick

  async function submit(e) {
    e.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    const part = (key) => (parts[key].on ? { on: true, prompt: parts[key].prompt.trim() } : { on: false });
    const out = await onSubmit({ quote: part("quote"), song: part("song") });
    if (out === true) return; // the sheet closes
    setProblem(typeof out === "string" ? out : "That remix didn't work. Try again.");
    setSending(false);
  }

  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <form className="sheet remixSheet" role="dialog" aria-modal="true" aria-labelledby="remixTitle" aria-describedby="remixHint" onSubmit={submit}>
        <div className="sheetHead"><h2 id="remixTitle">Remix this cover</h2></div>
        <p className="hint" id="remixHint">This cover changes right away, and Undo brings it back. Tick what changes.</p>
        {OPTIONS.map(({ key, label, placeholder }) => {
          const locked = key === "quote" && quotesLocked;
          return (
            <div className={parts[key].on ? "remixOption on" : "remixOption"} key={key}>
              <button type="button" ref={key === firstKey ? first : undefined} className="remixToggle" aria-pressed={parts[key].on}
                disabled={locked || sending} onClick={() => set(key, { on: !parts[key].on })}>
                <span className="tick">{parts[key].on && <Icon name="checkCircle" size={24} />}</span>{label}
              </button>
              <input className="field remixPrompt" value={parts[key].prompt} maxLength={PROMPT_MAX} disabled={locked || sending}
                placeholder={placeholder} aria-label={`${label} prompt, optional`}
                onChange={(e) => set(key, { prompt: e.target.value, ...(e.target.value.trim() ? { on: true } : {}) })} />
              {locked && <p className="hint remixLocked">Quotes show once you connect yours or keep some from the quiz.</p>}
            </div>
          );
        })}
        {problem && <p className="problem remixProblem" role="alert">That remix didn't work. {problem}</p>}
        <div className="remixActions">
          <button type="button" className="secondaryBtn" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" className="primaryBtn" disabled={!ready || sending}>Submit</button>
        </div>
      </form>
    </div>
  );
}
