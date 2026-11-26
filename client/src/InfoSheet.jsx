import { useEffect, useRef, useState } from "react";
import { post } from "./api.js";
import Icon from "./icons.jsx";
import { setRestrictSignups, signOut, useSession } from "./session.js";
import { setSnapGuidesOn, snapGuidesOn } from "./snapGuides.js";

// Behind the info button: adding photos, setup, Pollen, the quote quiz, "Something wrong?" and her account (1.15.0).
// Everything that used to sit under the cover lives here now, one tap away.

export default function InfoSheet({ status, pollen, quotesStatus, quizQuotes, list, currentId, onClose, onUpload, onSortDump, onConsent,
  onConnectPollen, onQuizDecide, onConnectQuotes, onGrievance }) {
  const [pollenCode, setPollenCode] = useState("");
  const [snapOn, setSnapOn] = useState(snapGuidesOn); // "Snap to guides", on by default (1.24.0)
  const [pollenNote, setPollenNote] = useState("");
  const [ownQuotes, setOwnQuotes] = useState("");
  const [grievance, setGrievance] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [grievanceError, setGrievanceError] = useState(null);
  const session = useSession();
  const [signupNote, setSignupNote] = useState("");
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Focus lands on Close once, when the sheet opens; the app updating behind it never moves her focus.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function connect() {
    setPollenNote("");
    try { await onConnectPollen(pollenCode.trim()); setPollenCode(""); } catch (e) { setPollenNote(e.message); }
  }
  // The owner's switch (1.15.0): off by default, so any username can sign in; on, only usernames this copy knows.
  async function toggleSignups() {
    setSignupNote("");
    try { setRestrictSignups((await post("/api/accounts/signups", { restrict: !session.restrictSignups })).restrictSignups); }
    catch (e) { setSignupNote(e.message); }
  }
  async function sendGrievance() {
    const text = grievance.trim();
    if (!text) return;
    try {
      const r = await onGrievance(text, { tab: list, currentItemId: currentId ?? null, photoCount: status?.photoCount ?? null });
      setReceipt(r.receipt || { id: r.grievance?.id, receivedAt: r.grievance?.receivedAt });
      setGrievanceError(null);
      setGrievance("");
    } catch (e) {
      // A failed save must say so here, never vanish silently.
      setGrievanceError(e.message);
      setReceipt(null);
    }
  }

  return (
    <div className="sheetBackdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet infoSheet" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
        <div className="sheetHead">
          <h2 id="infoTitle">Cover Review</h2>
          <button type="button" ref={closeRef} className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <p className="hint">by uBee. Made for creators, by creators.</p>

        <section className="infoBlock">
          <h3>Photos</h3>
          <p>Photos are the only thing this app needs. {status ? `You have ${status.photoCount} so far.` : ""}</p>
          <label className="primaryBtn asLabel">
            <Icon name="photoAdd" size={20} /> Add photos
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; if (files.length) onUpload(files); }} />
          </label>
        </section>

        <section className="infoBlock">
          <h3>Setup</h3>
          <p>Everything else helps your Muse work smarter, and none of it blocks review.</p>
          <ul>
            <li>Drive: ask your Muse to connect Drive. It makes a folder called "uBee Cover Review" with a "DUMP" folder inside. Throw everything in DUMP, say "done", and your Muse sorts it.</li>
            <li>Spotify: connect it for songs from your own library. Without it, songs come from what's trending on Instagram.</li>
            <li>Instagram: with your consent, your Muse learns your voice from your past captions.</li>
          </ul>
          <div className="stackBtns">
            <button type="button" className="secondaryBtn" onClick={onSortDump}>I'm done dumping. Sort my DUMP</button>
            <button type="button" className="secondaryBtn" onClick={onConsent}>Learn my voice from my Instagram captions</button>
          </div>
          {status?.voiceProfile && (
            <p className="hint">Voice profile live: {status.voiceProfile.sampleCount} captions, about {status.voiceProfile.avgWords} words each{status.voiceProfile.mostlyLowercase ? ", mostly lowercase" : ""}.</p>
          )}
        </section>

        <section className="infoBlock">
          <h3>Pollen</h3>
          {pollen?.connected ? (
            <p>Pollen is connected{pollen.creator?.display_name ? ` for ${pollen.creator.display_name}` : ""}. In Approved, tap Select to schedule covers.</p>
          ) : (
            <>
              <p>uBee client? Paste the code uBee gave you.</p>
              <div className="inlineForm">
                <input className="field" type="password" autoComplete="off" value={pollenCode} onChange={(e) => setPollenCode(e.target.value)} placeholder="Pollen code" aria-label="Pollen code" />
                <button type="button" className="secondaryBtn" onClick={connect} disabled={!pollenCode.trim()}>Connect</button>
              </div>
              {(pollenNote || pollen?.message) && <p className="problem">{pollenNote || pollen.message}</p>}
            </>
          )}
        </section>

        <section className="infoBlock">
          <h3>Quote quiz</h3>
          {quotesStatus?.unlocked
            ? <p>Your quotes are on. You have {quotesStatus.creatorQuoteCount} of your own. Keep stealing more below.</p>
            : <p>Quotes stay off the cover until they're yours. Steal the ones that sound like you, and they become your list.</p>}
          {quizQuotes[0] ? (
            <>
              <p className="quizQuote">"{quizQuotes[0].text}"</p>
              <div className="inlineForm">
                <button type="button" className="secondaryBtn" onClick={() => onQuizDecide(quizQuotes[0].text, false)}>Not me</button>
                <button type="button" className="primaryBtn" onClick={() => onQuizDecide(quizQuotes[0].text, true)}>Steal it</button>
                <span className="hint">{quotesStatus ? `${quotesStatus.quizRemaining} left` : ""}</span>
              </div>
            </>
          ) : <p className="hint">Quiz done. Every quote has your answer.</p>}
          <label className="fieldLabel" htmlFor="ownQuotes">Or paste your own quotes, one per line</label>
          <textarea id="ownQuotes" className="field" rows={3} value={ownQuotes} onChange={(e) => setOwnQuotes(e.target.value)} placeholder="Or ask your Muse to load your whole list" />
          <button type="button" className="secondaryBtn" disabled={!ownQuotes.trim()} onClick={async () => { await onConnectQuotes(ownQuotes); setOwnQuotes(""); }}>Connect my quotes</button>
        </section>

        <section className="infoBlock">
          <h3>Something wrong?</h3>
          <p>Tell your AI here. It reads this, finds the problem, fixes it, and proves the fix.</p>
          <div className="inlineForm">
            <input id="grievanceBox" className="field" value={grievance} onChange={(e) => setGrievance(e.target.value)} placeholder="Example: the like button stopped working" aria-label="What's wrong, in your words" />
            <button type="button" className="secondaryBtn" onClick={sendGrievance} disabled={!grievance.trim()}>Tell my AI</button>
          </div>
          {receipt && (
            <p className="receipt">✓ Received {receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleString() : ""}{receipt.id ? ` (#${receipt.id})` : ""}. Your AI has it. Now tell your Muse or AI assistant: fix my Cover Review grievance.</p>
          )}
          {grievanceError && <p className="error">That didn't send: {grievanceError}. Try again.</p>}
        </section>

        <section className="infoBlock">
          <h3>Tips</h3>
          <ul>
            <li>Swipe the cover right to approve it, or left to pass. The heart and the X under it do the same. Rewind brings the last one back.</li>
            <li>On a carousel, tap the right or left side of the photo to move between slides.</li>
            <li>Download saves the photo on screen in one tap. On a carousel, press and hold it, then let go, to save every slide.</li>
            <li>Tap the text on the cover to edit it. Undo and redo sit at the top.</li>
            <li>On a computer: left and right arrow keys move between covers.</li>
          </ul>
        </section>

        <section className="infoBlock">
          <h3>Editing</h3>
          <button type="button" role="switch" aria-checked={snapOn} className="callSwitch" onClick={() => { setSnapOn(!snapOn); setSnapGuidesOn(!snapOn); }}>
            <span className="track" aria-hidden="true"><span className="knob" /></span>
            <span className="callLabel">Snap to guides</span>
          </button>
        </section>

        <section className="infoBlock">
          <h3>Account</h3>
          <p>Signed in as @{session.handle}{session.owner ? ", the owner of this copy" : ""}.</p>
          {session.owner && (
            <>
              <button type="button" role="switch" aria-checked={session.restrictSignups} className="callSwitch" onClick={toggleSignups}>
                <span className="track" aria-hidden="true"><span className="knob" /></span>
                <span className="callLabel">Only usernames already on this copy can sign in</span>
              </button>
              {signupNote && <p className="problem">{signupNote}</p>}
            </>
          )}
          <div className="stackBtns">
            <button type="button" className="secondaryBtn" onClick={signOut}>Log out</button>
          </div>
        </section>
      </div>
    </div>
  );
}
