import { useEffect, useMemo, useRef, useState } from "react";
import { imageUrlFor } from "./CoverCanvas.jsx";
import { hexToHsv, hsvToHex, photoTone, randomWheelColor } from "./houseColor.js";
import Icon from "./icons.jsx";
import { CONTRAST_MODES, FONT_LABELS, HALF_PRESETS, STYLE_DEFAULTS, autoLineCount, canvasMeasureAt, colorPatch, estimatedLineCount, hasFace, presetOn } from "./renderCover.js";

// The text editor that opens on the cover. Every change shows on the cover right away and saves as she goes (1.8):
// there is no Save or Cancel. Undo, after the editor closes, steps back one saved change at a time.

// Lines works like the original: on Auto it shows how many rows it draws; the first tap either way picks a number,
// fewer stops at 1, more has no cap but the word count (a row needs a word).
const lineWords = (n) => (n === 1 ? "1 line" : `${n} lines`);
const WEIGHTS = [[300, "Light"], [400, "Regular"], [500, "Medium"], [700, "Bold"]]; // Light since 1.20.0 (Big Edit item 5)
const ALIGNS = [["left", "L", "Left"], ["center", "C", "Center"], ["right", "R", "Right"], ["justify", "J", "Justify"]];

export default function CoverEditor({
  draft, activeBox, setActiveBox, setBox, setItem, setImageEdit, palette, brandColors = [], locked = false, fonts, customColors, quotesUnlocked,
  pickMode, setPickMode, onRemoveBox, onNewBox, onAddMosaic, canAddBox, onRemoveCustomColor, photo = null,
}) {
  // Removing her own colors (1.9.1): Remove colors turns each custom swatch into a remove button until Done.
  const [removing, setRemoving] = useState(false);
  useEffect(() => { if (!customColors.length) setRemoving(false); }, [customColors.length]);
  const extras = draft.extraTexts || [];
  // The photo the editor is on (1.20.0, Big Edit item 3): the cover holds the quote and its own boxes; a carousel photo
  // holds only the boxes she put on it, and starts with none.
  const here = extras.map((b, i) => [b, i]).filter(([b]) => (photo === null ? b.slide == null : b.slide === photo)).map(([, i]) => i);
  const isMain = photo === null && activeBox === -1;
  const hasBox = isMain || here.includes(activeBox);
  const box = { ...STYLE_DEFAULTS, ...(isMain ? draft : (hasBox && extras[activeBox]) || {}) };
  const text = isMain ? draft.quote || "" : box.quote || "";
  const words = text.split(/\s+/).filter(Boolean).length;
  const measure = typeof document !== "undefined" ? canvasMeasureAt(box) : null;
  const autoRows = useMemo(() => (measure ? autoLineCount({ ...box, quote: text }, measure) : estimatedLineCount(text)),
    [text, box.fontSize, box.textFont, box.fontWeight, box.textWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = box.lineCount > 0 ? box.lineCount : autoRows;
  // Light only where the font has a Light face (1.20.0): unknown until the sample is drawn, so it starts available.
  const [lightIn, setLightIn] = useState({});
  useEffect(() => {
    let alive = true;
    if (lightIn[box.textFont] === undefined) hasFace(box.textFont, 300).then((ok) => { if (alive) setLightIn((m) => ({ ...m, [box.textFont]: ok })); });
    return () => { alive = false; };
  }, [box.textFont]); // eslint-disable-line react-hooks/exhaustive-deps
  const noLight = lightIn[box.textFont] === false;
  // Every way to pick a color goes through here: after a 50% preset, the text is 100% again (1.20.0, Big Edit item 8).
  const pickColor = (hex) => setBox(colorPatch(box, hex));

  function eyedropper() {
    if (typeof window !== "undefined" && window.EyeDropper) {
      new window.EyeDropper().open().then((r) => pickColor(r.sRGBHex.toUpperCase())).catch(() => {});
      return;
    }
    setPickMode(!pickMode);
  }
  // Her own colors come first, in her order, then the 11 (1.20.0, Big Edit item 2). A color in both shows once, as hers.
  const own = new Set(brandColors.map((c) => c.hex.toUpperCase()));
  const colors = [...brandColors, ...palette.filter((c) => !own.has(c.hex.toUpperCase()))];
  // Random (1.26.0, Arjang #1092): a truly random hue from the wheel, lit to read on this photo behind the text.
  const randomColor = async () => {
    const slideUrl = Number.isInteger(photo) ? (draft.slides || []).find((sl) => sl.at === photo)?.mediaUrl : null; // a carousel photo
    const tone = (await photoTone(slideUrl || imageUrlFor(draft), box)) || { r: 128, g: 128, b: 128 };
    pickColor(randomWheelColor(tone));
  };
  const [wheelOpen, setWheelOpen] = useState(false);

  return (
    <section className="editor" aria-label="Edit the text on this cover">
      {/* Top of the sheet, like the original: these sit over the lower part of the photo. */}
      <div className="editorTools">
        <button type="button" className="toolBtn" onClick={onNewBox} disabled={!canAddBox}><Icon name="text" size={20} /> New text box</button>
        {photo === null && <button type="button" className="toolBtn" onClick={onAddMosaic}><Icon name="mosaic" size={20} /> Face mosaic</button>}
      </div>
      {(photo === null ? here.length > 0 : here.length > 1) && (
        <div className="boxTabs" role="tablist" aria-label="Text boxes">
          {photo === null && <button role="tab" aria-selected={isMain} className={isMain ? "on" : ""} onClick={() => setActiveBox(-1)}>Quote</button>}
          {here.map((i, n) => (
            <button key={i} role="tab" aria-selected={activeBox === i} className={activeBox === i ? "on" : ""} onClick={() => setActiveBox(i)}>Text {n + 1}</button>
          ))}
        </div>
      )}
      {!hasBox && <p className="hint emptyPhoto">No text on this photo yet. Add a text box to write on it.</p>}

      {hasBox && (<>
      <div className="twoUp">
        <Slider label="Text width" value={box.widthScale} min={10} max={50} onChange={(v) => setBox({ widthScale: v })} />
        <Slider label="Text height" value={box.heightScale} min={10} max={50} onChange={(v) => setBox({ heightScale: v })} />
      </div>

      <label className="fieldLabel" htmlFor="quoteField">{isMain ? "Quote" : "Text"}</label>
      <textarea id="quoteField" className="field" rows={3} value={text}
        onChange={(e) => (isMain ? setItem({ quote: e.target.value }) : setBox({ quote: e.target.value }))} />
      {/* The quote's on and off moved to the T icon by the pencil (1.13.9). */}
      {isMain && !quotesUnlocked && <p className="hint">Quotes are locked until they're yours. Take the quote quiz behind the info button.</p>}

      <div className="rowBetween">
        <span className="fieldLabel inline">Lines</span>
        <div className="linesPicker" role="group" aria-label="Lines">
          <button type="button" aria-label="Fewer lines" disabled={!words || lines <= 1} onClick={() => setBox({ lineCount: Math.max(1, lines - 1) })}><Icon name="arrowLeft" /></button>
          <span aria-live="polite">{words ? lineWords(lines) : "No text"}{box.lineCount > 0 || !words ? "" : " \u00b7 auto"}</span>
          <button type="button" aria-label="More lines" disabled={!words || lines >= words} onClick={() => setBox({ lineCount: Math.min(words, lines + 1) })}><Icon name="arrowRight" /></button>
        </div>
      </div>

      <span className="fieldLabel">Color</span>
      <div className="swatches" role="group" aria-label="Text color">
        {/* The far-left picker opens on the color wheel (1.26.0, Arjang #1092). */}
        <button type="button" className={wheelOpen ? "swatch tool rainbow on" : "swatch tool rainbow"} aria-label="Pick any color on the wheel"
          aria-expanded={wheelOpen} onClick={() => setWheelOpen((v) => !v)}>
          <span className="plusDot" aria-hidden="true"><Icon name="plus" size={12} /></span>
        </button>
        <button type="button" className={pickMode ? "swatch tool on" : "swatch tool"} onClick={eyedropper} aria-pressed={pickMode} aria-label="Pick a color from the photo"><Icon name="eyedropper" size={20} /></button>
        <button type="button" className="swatch tool rainbow" onClick={randomColor} aria-label="Random color from the wheel"><Icon name="shuffle" size={18} /></button>
        {colors.map((c) => (
          <button type="button" key={c.hex} className={box.textColor === c.hex ? "swatch on" : "swatch"} style={{ background: c.hex }}
            aria-label={c.name} aria-pressed={box.textColor === c.hex} onClick={() => pickColor(c.hex)} />
        ))}
        {/* Her 5 newest colors from the wheel, then the two 50% colors last, in the same rows (1.26.0, Arjang #1092). */}
        {customColors.slice(0, 5).map((hex) => (
          <button type="button" key={`c${hex}`} className={box.textColor === hex ? "swatch on" : "swatch"} style={{ background: hex }}
            aria-label={`Recent ${hex}`} aria-pressed={box.textColor === hex} onClick={() => pickColor(hex)} />
        ))}
        {HALF_PRESETS.map((p) => {
          const on = presetOn(box, p);
          return (
            <button type="button" key={p.name} className={on ? "swatch half on" : "swatch half"} aria-label={p.name} aria-pressed={on}
              style={{ "--tone": `${p.patch.textColor}80`, "--ink": p.patch.textColor === "#000000" ? "#FFFFFF" : "#000000" }}
              onClick={() => setBox(p.patch)}>
              <span aria-hidden="true">50%</span>
            </button>
          );
        })}
      </div>
      {wheelOpen && <ColorWheel value={box.textColor} onPick={pickColor} onDone={() => setWheelOpen(false)} />}
      <details className="customColors">
        <summary><span>Custom colors</span><span className="countBadge">{customColors.length}</span></summary>
        {customColors.length ? (
          <>
            <div className="swatches">
              {customColors.map((hex) => (removing ? (
                <button type="button" key={hex} className="swatch removing" style={{ background: hex }}
                  aria-label={`Remove custom ${hex}`} onClick={() => onRemoveCustomColor?.(hex)}>
                  <span className="removeDot" aria-hidden="true"><Icon name="close" size={12} /></span>
                </button>
              ) : (
                <button type="button" key={hex} className={box.textColor === hex ? "swatch on" : "swatch"} style={{ background: hex }}
                  aria-label={`Custom ${hex}`} aria-pressed={box.textColor === hex} onClick={() => pickColor(hex)} />
              )))}
            </div>
            <div className="rowEnd">
              {removing
                ? <button type="button" className="linkBtn" onClick={() => setRemoving(false)}>Done</button>
                : <button type="button" className="linkBtn muted" onClick={() => setRemoving(true)}>Remove colors</button>}
            </div>
          </>
        ) : <p className="hint">Colors you pick yourself land here.</p>}
      </details>

      <div className="fontAlign">
        <div>
          <label className="fieldLabel" htmlFor="fontField">Font</label>
          <div className="selectWrap">
            <select id="fontField" className="field" value={box.textFont} onChange={(e) => setBox({ textFont: e.target.value })}>
              {fonts.map((f) => <option key={f} value={f}>{FONT_LABELS[f] || f}</option>)}
            </select>
            <Icon name="chevronDown" size={18} className="selectChevron" />
          </div>
        </div>
        <div>
          <span className="fieldLabel">Align</span>
          <div className="segmented small" role="group" aria-label="Align">
            {ALIGNS.map(([v, short, long]) => (
              <button type="button" key={v} className={box.textAlign === v ? "on" : ""} aria-pressed={box.textAlign === v} aria-label={long} onClick={() => setBox({ textAlign: v })}>{short}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Justified text gets its own width (1.20.0, Big Edit item 6): both sides of the column move in and out together. */}
      {box.textAlign === "justify" && (
        <Slider label="Justify width" value={box.textWidth} min={20} max={100} unit="%" inline onChange={(v) => setBox({ textWidth: v })} />
      )}

      <span className="fieldLabel">Font weight</span>
      <div className="segmented" role="group" aria-label="Font weight">
        {WEIGHTS.map(([w, name]) => (
          <button type="button" key={w} className={Number(box.fontWeight) === w ? "on" : ""} style={{ fontWeight: w }} aria-pressed={Number(box.fontWeight) === w}
            disabled={w === 300 && noLight} onClick={() => setBox({ fontWeight: w })}>{name}</button>
        ))}
      </div>
      {noLight && <p className="hint weightHint">This font has no Light, so Light would look like Regular.</p>}

      {photo === null && <div className="rowBetween">
        <label className="fieldLabel inline" htmlFor="contrastField">Image contrast</label>
        <div className="selectWrap pill">
          <select id="contrastField" className="field" value={draft.imageEdit?.contrast || "normal"} onChange={(e) => setImageEdit({ contrast: e.target.value })}>
            {CONTRAST_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <Icon name="chevronDown" size={16} className="selectChevron" />
        </div>
      </div>}

      <Slider label="Size" value={box.fontSize} min={24} max={110} inline onChange={(v) => setBox({ fontSize: v })} />
      {/* The space between lines (1.20.0, Big Edit item 7): the box's line height, 60 to 200% of the text size. */}
      <Slider label="Line spacing" value={box.textHeight} min={60} max={200} unit="%" inline onChange={(v) => setBox({ textHeight: v })} />
      <Slider label="Opacity" value={box.opacity} min={25} max={100} unit="%" inline onChange={(v) => setBox({ opacity: v })} />
      <Slider label="Horizontal" value={box.horizontalPosition} min={0} max={100} unit="%" inline onChange={(v) => setBox({ horizontalPosition: v })} />
      <Slider label="Vertical" value={box.verticalPosition} min={0} max={100} unit="%" inline onChange={(v) => setBox({ verticalPosition: v })} />

      {!isMain && <button type="button" className="dangerLink" onClick={onRemoveBox}>Remove this text box</button>}
      </>)}

      <label className="fieldLabel" htmlFor="noteField">Note for the next revision</label>
      <textarea id="noteField" className="field" rows={2} value={draft.note || ""} placeholder="Say it how you would say it"
        onChange={(e) => setItem({ note: e.target.value })} />
    </section>
  );
}

/** A labelled slider: label and value on one line, the track under them (or beside, when inline). */
function Slider({ label, value, min, max, unit = "", inline = false, onChange }) {
  const id = `s-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const v = Math.round(Number(value));
  return (
    <div className={inline ? "slider inline" : "slider"}>
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{v}{unit}</output>
      <input id={id} type="range" min={min} max={max} value={v} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%` }} />
    </div>
  );
}

/** The color wheel (1.26.0, Arjang #1092): hue around the ring, white toward the middle, brightness on the slider. The
 *  text follows her finger; the color she lands on joins her recent colors when it saves. */
function ColorWheel({ value, onPick, onDone }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const wheel = useRef(null), held = useRef(false);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const move = (e) => {
    const r = wheel.current.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const next = { h: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(x, y) / (r.width / 2)), v: hsv.v || 1 };
    setHsv(next);
    onPick(hsvToHex(next.h, next.s, next.v));
  };
  const rad = (hsv.h * Math.PI) / 180;
  return (
    <div className="wheelPop" role="group" aria-label="Color wheel">
      <div ref={wheel} className="wheel" style={{ "--dim": 1 - hsv.v }}
        onPointerDown={(e) => { held.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (held.current) move(e); }}
        onPointerUp={() => { held.current = false; }} onPointerCancel={() => { held.current = false; }}>
        <span className="wheelDot" style={{ left: `${50 + Math.sin(rad) * hsv.s * 50}%`, top: `${50 - Math.cos(rad) * hsv.s * 50}%`, background: hex }} />
      </div>
      <div className="wheelSide">
        <span className="wheelNow" style={{ background: hex }} aria-hidden="true" />
        <input type="range" min="5" max="100" value={Math.round(hsv.v * 100)} aria-label="Brightness"
          onChange={(e) => { const next = { ...hsv, v: Number(e.target.value) / 100 }; setHsv(next); onPick(hsvToHex(next.h, next.s, next.v)); }} />
        <span className="wheelHex">{hex}</span>
        <button type="button" className="linkBtn" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
