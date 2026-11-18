import { useCallback, useEffect, useRef, useState } from "react";
import UpdateBanner from "./UpdateBanner.jsx";

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

const FONT_CSS = {
  tiktok: "'TikTok Sans', system-ui, sans-serif",
  avenir: "Avenir, 'Segoe UI', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  condensed: "'Arial Narrow', 'Helvetica Neue Condensed', sans-serif",
  papyrus: "Papyrus, fantasy",
  papyrus_condensed: "Papyrus, fantasy",
};

export default function App() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("queue");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(8);
  const [dragX, setDragX] = useState(0);
  const [palette, setPalette] = useState([]);
  const [fonts, setFonts] = useState([]);
  const [showEditor, setShowEditor] = useState(false);
  const [storyView, setStoryView] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [quotesStatus, setQuotesStatus] = useState(null);
  const [quizQuotes, setQuizQuotes] = useState([]);
  const [ownQuotes, setOwnQuotes] = useState("");
  const startX = useRef(null);

  const load = useCallback(async () => {
    const [s, q, qs, quiz] = await Promise.all([
      api("/api/setup/status"), api(`/api/items?status=${tab}`),
      api("/api/quotes/status"), api("/api/quiz/quotes"),
    ]);
    setStatus(s);
    setItems(q.items);
    setQuotesStatus(qs);
    setQuizQuotes(quiz.quotes);
  }, [tab]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { api("/api/palette").then((p) => { setPalette(p.palette); setFonts(p.fonts); }).catch(() => {}); }, []);
  const current = items[0];

  useEffect(() => { setNote(current?.note || ""); setRating(current?.rating || 8); setDragX(0); }, [current?.id]);

  function patchCurrent(item) { setItems((prev) => prev.map((i) => (i.id === item.id ? item : i))); }

  async function uploadPhotos(e) {
    const files = [...e.target.files];
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append("photos", f));
    await api("/api/items/upload", { method: "POST", body: form });
    setTab("queue");
    await load();
  }

  async function decide(decision) {
    if (!current) return;
    await post(`/api/items/${current.id}/decide`, { decision, rating, note });
    await load();
  }

  async function editCurrent(patch) {
    if (!current) return;
    const { item } = await post(`/api/items/${current.id}/edit`, patch);
    patchCurrent(item);
  }

  async function style(patch) {
    if (!current) return;
    const { item } = await post(`/api/items/${current.id}/style`, patch);
    patchCurrent(item);
  }

  async function ratePart(key, value) {
    if (!current) return;
    const { item } = await post(`/api/items/${current.id}/rate`, { [key]: value });
    patchCurrent(item);
  }

  async function verify() {
    if (!current) return;
    const { item } = await post(`/api/items/${current.id}/verify`);
    patchCurrent(item);
  }

  async function doSearch() {
    const r = await api(`/api/photos/search?q=${encodeURIComponent(search)}`);
    setSearchResults(r.results);
  }

  async function addSlide(e) {
    const file = e.target.files[0];
    if (!file || !current) return;
    const form = new FormData();
    form.append("slide", file);
    const { item } = await api(`/api/items/${current.id}/slides`, { method: "POST", body: form });
    patchCurrent(item);
  }

  async function sortDump() {
    const r = await post("/api/dump/sort");
    alert(r.message);
    await load();
  }

  async function grantCaptionConsent() {
    const handle = prompt("Your Instagram handle, with the @");
    if (!handle) return;
    await post("/api/connectors/instagram/consent", { captionConsent: true, handle });
    await load();
  }

  useEffect(() => {
    function onKey(e) {
      if (!current || showEditor) return;
      if (e.key === "ArrowRight") decide("approved");
      if (e.key === "ArrowLeft") decide("rejected");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function quizDecide(keep) {
    const q = quizQuotes[0];
    if (!q) return;
    await post("/api/quiz/decide", { text: q.text, keep });
    await load();
  }

  async function connectOwnQuotes() {
    const texts = ownQuotes.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!texts.length) return;
    await post("/api/quotes/connect", { quotes: texts });
    setOwnQuotes("");
    await load();
  }

  async function toggleQuote() {
    if (!current) return;
    try {
      const { item } = await post(`/api/items/${current.id}/quote-toggle`, { showQuote: !current.showQuote });
      patchCurrent(item);
    } catch (e) { alert(e.message); }
  }

  const quoteVisible = Boolean(current?.showQuote && quotesStatus?.unlocked);
  const activeSlides = (current?.slides || []).filter((s) => !s.deletedAt).sort((a, b) => a.position - b.position);
  const overlayStyle = current ? {
    color: current.textColor, fontFamily: FONT_CSS[current.textFont] || FONT_CSS.tiktok,
    fontSize: `${Math.max(14, current.fontSize * 0.55)}px`, fontWeight: current.fontWeight,
    opacity: current.opacity / 100, textAlign: current.textAlign,
    left: `${current.horizontalPosition}%`, top: `${current.verticalPosition}%`,
  } : {};

  return (
    <div className="app">
      <UpdateBanner />
      <header>
        <img src="/brand/ubee-bee-chartreuse.png" alt="uBee bee" className="bee" />
        <div>
          <h1>Cover Review</h1>
          <p className="sub">by uBee - made for creators, by creators</p>
        </div>
        <span className="pill">{status ? `${status.photoCount} photos` : "..."}</span>
      </header>

      <section className="setup card">
        <h2>Setup</h2>
        <p>Photos are the only thing this app needs. Everything else helps your Muse work smarter, and none of it blocks review.</p>
        <ul>
          <li>Drive: ask your Muse to connect Drive. It creates a folder called "uBee Cover Review" with a "DUMP" folder inside. Throw everything in DUMP, say "done", and your Muse sorts it into Images, Videos, Quotes, Music, Voice Profile and Captions.</li>
          <li>Spotify: connect it for songs from your own library. No Spotify, no problem, songs default to what is trending on Instagram.</li>
          <li>Instagram: with your consent, your Muse learns your voice from your previous captions and keeps trending songs fresh.</li>
          <li>Quotes: the uBee default quote pack is loaded already. Your Muse can swap in your own list any time.</li>
        </ul>
        <div className="row">
          <button onClick={sortDump}>I am done dumping - sort my DUMP</button>
          <button className="ghost" onClick={grantCaptionConsent}>Consent: learn my voice from my Instagram captions</button>
        </div>
        {status?.voiceProfile && (
          <p className="hint">Voice profile live: {status.voiceProfile.sampleCount} captions, about {status.voiceProfile.avgWords} words each{status.voiceProfile.mostlyLowercase ? ", mostly lowercase" : ""}. Signature words: {status.voiceProfile.signatureWords.slice(0, 6).join(", ")}</p>
        )}
      </section>

      <section className="card">
        <h2>Quote quiz</h2>
        {quotesStatus?.unlocked ? (
          <p>Your quotes are on. You have {quotesStatus.creatorQuoteCount} of your own, from {quotesStatus.source === "quiz" ? "the quiz" : "your list"}. Keep stealing more below, they join your list.</p>
        ) : (
          <p>Quote over image stays off until the quotes are yours. Rate these generalized quotes from the uBee pack, steal the ones that sound like you, and they become your list. Nothing Arjang specific is in here, that all got sorted out.</p>
        )}
        {quizQuotes[0] ? (
          <div>
            <p className="quizQuote">"{quizQuotes[0].text}"</p>
            <div className="row">
              <button className="reject" onClick={() => quizDecide(false)}>Not me</button>
              <button className="approve" onClick={() => quizDecide(true)}>Steal it</button>
              <span className="hint">{quotesStatus ? `${quotesStatus.quizRemaining} left` : ""}</span>
            </div>
          </div>
        ) : <p className="hint">Quiz done. Every generalized quote has a verdict from you.</p>}
        <label>Or connect your own quote list <span className="hint">(one quote per line)</span></label>
        <div className="row">
          <input value={ownQuotes} onChange={(e) => setOwnQuotes(e.target.value)} placeholder="Paste a quote, connect, repeat - or ask your Muse to load your whole list" />
          <button className="ghost" onClick={connectOwnQuotes}>Connect</button>
        </div>
      </section>

      <section className="card">
        <div className="row spread">
          <div className="tabs">
            {["queue", "approved", "rejected"].map((t) => (
              <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <label className="upload">
            Add photos
            <input type="file" accept="image/*" multiple hidden onChange={uploadPhotos} />
          </label>
        </div>

        {!current && <p className="empty">Nothing in {tab} right now. Add photos above, or sort your DUMP, and review starts here. No connectors needed.</p>}

        {current && (
          <div className="review">
            <div className="row spread">
              <span className="hint">{storyView ? "Story view, 9:16" : "Review deck"}</span>
              <button className="ghost" onClick={() => setStoryView(!storyView)}>{storyView ? "Back to deck" : "Story view"}</button>
            </div>

            {storyView ? (
              <div className="storyFrame">
                <img src={current.imageUrl} alt={current.title} style={{ transform: `translate(${(current.storyPanX - 50) / 2}%, ${(current.storyPanY - 50) / 2}%) scale(1.35)` }} />
                {quoteVisible && <div className="overlayText" style={overlayStyle}>{current.quote}</div>}
              </div>
            ) : (
              <div
                className="photo"
                style={{ transform: `translateX(${dragX}px) rotate(${dragX / 24}deg)` }}
                onPointerDown={(e) => { startX.current = e.clientX; }}
                onPointerMove={(e) => { if (startX.current != null) setDragX(e.clientX - startX.current); }}
                onPointerUp={() => {
                  if (dragX > 90) decide("approved");
                  else if (dragX < -90) decide("rejected");
                  startX.current = null; setDragX(0);
                }}
              >
                <img src={current.imageUrl} alt={current.title} draggable={false} />
                {quoteVisible && <div className="overlayText" style={overlayStyle}>{current.quote}</div>}
              </div>
            )}
            <p className="title">{current.title}{current.driveId ? ` - Drive ${current.driveId}` : ""}{current.imageQualityStatus === "quarantined" ? " - quality quarantined" : ""}</p>

            {storyView && (
              <div>
                <label>Story pan X: {current.storyPanX}</label>
                <input type="range" min="0" max="100" value={current.storyPanX} onChange={(e) => patchCurrent({ ...current, storyPanX: Number(e.target.value) })} onPointerUp={(e) => post(`/api/items/${current.id}/story-framing`, { storyPanX: Number(e.target.value), storyPanY: current.storyPanY }).then(({ item }) => patchCurrent(item))} />
                <label>Story pan Y: {current.storyPanY}</label>
                <input type="range" min="0" max="100" value={current.storyPanY} onChange={(e) => patchCurrent({ ...current, storyPanY: Number(e.target.value) })} onPointerUp={(e) => post(`/api/items/${current.id}/story-framing`, { storyPanX: current.storyPanX, storyPanY: Number(e.target.value) }).then(({ item }) => patchCurrent(item))} />
              </div>
            )}

            <label>Quote <span className="hint">(uBee default pack)</span></label>
            <div className="row">
              <input value={current.quote} onChange={(e) => editCurrent({ quote: e.target.value })} />
              <button className="ghost" onClick={() => editCurrent({ shuffleQuote: true })}>Shuffle</button>
            </div>
            <div className="row">
              <button className={quoteVisible ? "tab active" : "tab"} onClick={toggleQuote} disabled={!quotesStatus?.unlocked && !current.showQuote}>
                Quote over image: {current.showQuote ? "on" : "off"}
              </button>
              {!quotesStatus?.unlocked && <span className="hint">Locked. Connect your quotes or take the quote quiz below to turn quotes on.</span>}
            </div>
            <label>Song {current.songSource && <span className="hint">({current.songSource})</span>}</label>
            <div className="row">
              <input value={current.song} onChange={(e) => editCurrent({ song: e.target.value })} placeholder="Connect Spotify, or trending on Instagram fills this in" />
              <button className="ghost" onClick={() => editCurrent({ shuffleSong: true })}>Shuffle</button>
            </div>
            <label>Caption <span className="hint">(drafted from your voice profile)</span></label>
            <div className="row">
              <input value={current.caption} onChange={(e) => editCurrent({ caption: e.target.value })} />
              <button className="ghost" onClick={() => editCurrent({ regenerateCaption: true })}>Redo</button>
            </div>

            <button className="ghost wide" onClick={() => setShowEditor(!showEditor)}>{showEditor ? "Close editor" : "Open editor: text, slides, ratings"}</button>

            {showEditor && (
              <div className="editor">
                <label>Text color <span className="hint">(the 11 color palette, nothing else)</span></label>
                <div className="swatches">
                  {palette.map((c) => (
                    <button key={c.hex} title={`${c.name} ${c.hex}`} className={current.textColor === c.hex ? "swatch active" : "swatch"} style={{ background: c.hex }} onClick={() => style({ textColor: c.hex })} />
                  ))}
                </div>
                <label>Font</label>
                <div className="row wrap">
                  {fonts.map((f) => (
                    <button key={f} className={current.textFont === f ? "tab active" : "tab"} onClick={() => style({ textFont: f })}>{f}</button>
                  ))}
                </div>
                <label>Weight</label>
                <div className="row">
                  {[400, 500, 700].map((w) => (
                    <button key={w} className={current.fontWeight === w ? "tab active" : "tab"} onClick={() => style({ fontWeight: w })}>{w === 400 ? "Regular" : w === 500 ? "Medium" : "Bold"}</button>
                  ))}
                  {["left", "center", "right"].map((a) => (
                    <button key={a} className={current.textAlign === a ? "tab active" : "tab"} onClick={() => style({ textAlign: a })}>{a}</button>
                  ))}
                </div>
                <label>Size: {current.fontSize}</label>
                <input type="range" min="24" max="110" value={current.fontSize} onChange={(e) => style({ fontSize: Number(e.target.value) })} />
                <label>Opacity: {current.opacity}%</label>
                <input type="range" min="20" max="100" value={current.opacity} onChange={(e) => style({ opacity: Number(e.target.value) })} />
                <label>Horizontal: {current.horizontalPosition}%</label>
                <input type="range" min="0" max="100" value={current.horizontalPosition} onChange={(e) => style({ horizontalPosition: Number(e.target.value) })} />
                <label>Vertical: {current.verticalPosition}%</label>
                <input type="range" min="0" max="100" value={current.verticalPosition} onChange={(e) => style({ verticalPosition: Number(e.target.value) })} />
                <label>Bar color</label>
                <div className="row">
                  {["#000000", "#FFFFFF"].map((b) => (
                    <button key={b} className={current.barColor === b ? "tab active" : "tab"} onClick={() => style({ barColor: b })}>{b === "#000000" ? "Black bars" : "White bars"}</button>
                  ))}
                  <button className="tab" onClick={() => style({ textNegative: !current.textNegative })}>Negative: {current.textNegative ? "on" : "off"}</button>
                </div>

                <label>Rate the parts</label>
                {[["qualityRating", "Photo quality"], ["songRating", "Song"], ["quoteRating", "Quote"]].map(([key, label]) => (
                  <div key={key} className="row">
                    <span className="rateLabel">{label}: {current[key] || "-"}</span>
                    <input type="range" min="1" max="10" value={current[key] || 5} onChange={(e) => ratePart(key, Number(e.target.value))} />
                  </div>
                ))}

                <label>Carousel slides <span className="hint">(first slide sets the ratio, slides after the cover close the story)</span></label>
                <div className="slides">
                  {activeSlides.map((s, i) => (
                    <div key={i} className="slideThumb">
                      <img src={s.mediaUrl} alt={s.title} />
                      <button className="ghost mini" onClick={async () => { const all = current.slides; const idx = all.indexOf(s); const { item } = await post(`/api/items/${current.id}/slides/${idx}/remove`); patchCurrent(item); }}>Remove</button>
                    </div>
                  ))}
                  <label className="upload mini">
                    + Add slide
                    <input type="file" accept="image/*,video/*" hidden onChange={addSlide} />
                  </label>
                </div>

                <label>Swap this photo <span className="hint">(quote, song and styling stay)</span></label>
                <div className="row">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your photos by name" />
                  <button className="ghost" onClick={doSearch}>Search</button>
                </div>
                <div className="slides">
                  {searchResults.map((r, i) => (
                    <div key={i} className="slideThumb">
                      <img src={r.imageUrl} alt={r.title} />
                      <button className="ghost mini" onClick={async () => { const { item } = await post(`/api/items/${current.id}/swap-photo`, { imageUrl: r.imageUrl, title: r.title }); patchCurrent(item); }}>Use this</button>
                    </div>
                  ))}
                </div>
                <div className="row wrap">
                  <button className="ghost" onClick={async () => { const { item } = await post(`/api/items/${current.id}/restore-original`); patchCurrent(item); }}>Restore original photo</button>
                  <button className="ghost" onClick={async () => { await post(`/api/items/${current.id}/remix`); setTab("queue"); await load(); }}>Remix this cover</button>
                  <button className="ghost" onClick={verify}>Verify compose steps</button>
                </div>
                {current.beacons && (
                  <p className="hint">QUOTE_IN_STOCK: {current.beacons.QUOTE_IN_STOCK ? "YES" : "NO"} - SONG_IN_POOL: {current.beacons.SONG_IN_POOL ? "YES" : "NO"} - STEPS_VERIFIED: {current.beacons.STEPS_VERIFIED ? "YES" : "NO"}</p>
                )}
              </div>
            )}

            <label>Your note <span className="hint">(anything at all - body notes, crop notes, reshoot notes)</span></label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say it how you would say it" />
            <label>Rating: {rating} / 10</label>
            <input type="range" min="1" max="10" value={rating} onChange={(e) => setRating(Number(e.target.value))} />
            <div className="actions">
              <button className="reject" onClick={() => decide("rejected")}>Pass</button>
              <button className="ghost" onClick={() => setItems((p) => [...p.slice(1), p[0]])}>Skip</button>
              <button className="approve" onClick={() => decide("approved")}>Approve</button>
            </div>
            <p className="hint">Swipe the photo or use the buttons. In the deck, arrow keys work too. Approving never deletes anything, your choice and your note are saved.</p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Something wrong?</h2>
        <p>Tell your AI here. It reads this, finds the problem, fixes it, and proves the fix. You just point at what hurts, in your own words.</p>
        <div className="row">
          <input id="grievanceBox" placeholder="Example: the approve button stopped working on my last photo" />
          <button onClick={async () => {
            const el = document.getElementById("grievanceBox");
            const text = el.value.trim();
            if (!text) return;
            await post("/api/grievances", { text, context: { tab, currentItemId: current?.id || null, photoCount: status?.photoCount ?? null } });
            el.value = "";
            alert("Saved. Now tell your Muse or AI assistant: fix my Cover Review grievance. It knows what to do from there.");
          }}>Tell my AI</button>
        </div>
      </section>

      <footer>
        <img src="/brand/ubee-wordmark-chartreuse.png" alt="ubee" className="wordmark" />
      </footer>
    </div>
  );
}
