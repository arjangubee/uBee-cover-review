import { useEffect, useRef, useState } from "react";
import { signIn } from "./session.js";

// The sign-in screen (1.15.0, room #735): one field, her Instagram username, and Continue. No password. A copy with covers
// or quotes from before accounts, no owner yet and no Instagram handle on file asks the first new username whether
// they're hers.
const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function SignIn({ note }) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [claim, setClaim] = useState(null); // { handle, counts } while the page asks
  const fieldRef = useRef(null);
  const questionRef = useRef(null);
  useEffect(() => { (claim ? questionRef : fieldRef).current?.focus(); }, [claim]);

  async function go(answer) {
    setBusy(true);
    setError("");
    try {
      const r = await signIn(claim ? claim.handle : handle, answer);
      if (r.needsClaim) setClaim({ handle: r.handle, counts: r.counts || {} });
    } catch (e) {
      setError(e.message);
      setClaim(null);
    } finally { setBusy(false); }
  }
  const shown = error || note;

  return (
    <main className="signIn">
      <div className="signInCard">
        <h1>Cover Review</h1>
        <p className="hint signInBy">by uBee</p>
        {claim ? (
          <div role="group" aria-labelledby="claimQuestion">
            <p id="claimQuestion" className="signInQuestion" tabIndex={-1} ref={questionRef}>
              This copy has {counted(claim.counts.photos || 0, "photo", "photos")} and {counted(claim.counts.quotes || 0, "quote", "quotes")} saved
              before accounts. Are they yours?
            </p>
            <button type="button" className="primaryBtn" disabled={busy} onClick={() => go(true)}>Yes, they're mine</button>
            <button type="button" className="secondaryBtn" disabled={busy} onClick={() => go(false)}>No, start with none</button>
            <button type="button" className="linkBtn signInBack" disabled={busy} onClick={() => setClaim(null)}>Use another username</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (handle.trim()) go(undefined); }}>
            <label className="fieldLabel" htmlFor="signInHandle">Your Instagram username</label>
            <div className="handleField">
              <span aria-hidden="true">@</span>
              <input id="signInHandle" ref={fieldRef} className="field" value={handle} onChange={(e) => setHandle(e.target.value)}
                autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40} enterKeyHint="go"
                aria-describedby={shown ? "signInProblem" : "signInHint"} />
            </div>
            <button type="submit" className="primaryBtn" disabled={busy || !handle.trim()}>{busy ? "Signing in..." : "Continue"}</button>
          </form>
        )}
        {shown && <p id="signInProblem" className="signInError" role="alert">{shown}</p>}
        {!claim && <p id="signInHint" className="hint signInFoot">No password. Use the same username on each device to see the same covers.</p>}
      </div>
    </main>
  );
}
