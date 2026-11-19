import { useMemo } from "react";
import Icon from "./icons.jsx";
import { CONTRAST_MODES, FONT_LABELS, HALF_PRESETS, STYLE_DEFAULTS, autoLineCount, canvasMeasureAt, presetOn } from "./renderCover.js";

// The text editor that opens on the cover. Every change shows on the cover right away and saves as she goes (1.8):
// there is no Save or Cancel. Undo, after the editor closes, steps back one saved change at a time.

// Lines works like the original: on Auto it shows how many rows it draws; the first tap either way picks a number,
// fewer stops at 1, more has no cap but the word count (a row needs a word).
const lineWords = (n) => (n === 1 ? "1 line" : `${n} lines`);
const WEIGHTS = [[400, "Regular"], [500, "Medium"], [700, "Bold"]];
const ALIGNS = [["left", "L", "Left"], ["center", "C", "Center"], ["right", "R", "Right"], ["justify", "J", "Justify"]];

export default function CoverEditor({
  draft, activeBox, setActiveBox, setBox, setItem, setImageEdit, palette, fonts, customColors, quotesUnlocked,
  pickMode, setPickMode, onRemoveBox, onNewBox, onAddMosaic, canAddBox,
}) {
  const extras = draft.extraTexts || [];
  const box = { ...STYLE_DEFAULTS, ...(activeBox === -1 ? draft : extras[activeBox] || {}) };
  const isMain = activeBox === -1;
  const text = isMain ? draft.quote || "" : box.quote || "";
  const words = text.split(/\s+/).filter(Boolean).length;
  const measure = typeof document !== "undefined" ? canvasMeasureAt(box) : null;
  const autoRows = useMemo(() => (measure ? autoLineCount({ ...box, quote: text }, measure) : Math.max(1, Math.min(words, Math.ceil(text.length / 20)))),
    [text, box.fontSize, box.textFont, box.fontWeight, box.textWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = box.lineCount > 0 ? box.lineCount : autoRows;

  function eyedropper() {
    if (typeof window !== "undefined" && window.EyeDropper) {
      new window.EyeDropper().open().then((r) => setBox({ textColor: r.sRGBHex.toUpperCase() })).catch(() => {});
      return;
    }
    setPickMode(!pickMode);
  }
  const randomColor = () => setBox({ textColor: palette[Math.floor(Math.random() * palette.length)]?.hex || "#FFFFFF" });

  return (
    <section className="editor" aria-label="Edit the text on this cover">
      {/* Top of the sheet, like the original: these sit over the lower part of the photo. */}
      <div className="editorTools">
        <button type="button" className="toolBtn" onClick={onNewBox} disabled={!canAddBox}><Icon name="text" size={20} /> New text box</button>
        <button type="button" className="toolBtn" onClick={onAddMosaic}><Icon name="mosaic" size={20} /> Face mosaic</button>
      </div>
      {extras.length > 0 && (
        <div className="boxTabs" role="tablist" aria-label="Text boxes">
          <button role="tab" aria-selected={isMain} className={isMain ? "on" : ""} onClick={() => setActiveBox(-1)}>Quote</button>
          {extras.map((b, i) => (
            <button key={i} role="tab" aria-selected={activeBox === i} className={activeBox === i ? "on" : ""} onClick={() => setActiveBox(i)}>Text {i + 1}</button>
          ))}
        </div>
      )}

      <div className="twoUp">
        <Slider label="Text width" value={box.widthScale} min={10} max={50} onChange={(v) => setBox({ widthScale: v })} />
        <Slider label="Text height" value={box.heightScale} min={10} max={50} onChange={(v) => setBox({ heightScale: v })} />
      </div>

      <label className="fieldLabel" htmlFor="quoteField">{isMain ? "Quote" : "Text"}</label>
      <textarea id="quoteField" className="field" rows={3} value={text}
        onChange={(e) => (isMain ? setItem({ quote: e.target.value }) : setBox({ quote: e.target.value }))} />
      {isMain && (
        <>
          <div className="switchRow">
            <span>Quote on the cover</span>
            <button type="button" role="switch" aria-checked={Boolean(draft.showQuote)} className={draft.showQuote ? "switch on" : "switch"}
              disabled={!quotesUnlocked && !draft.showQuote} onClick={() => setItem({ showQuote: !draft.showQuote })}>
              <span className="knob" />
            </button>
          </div>
          {!quotesUnlocked && <p className="hint">Locked until the quotes are yours. Take the quote quiz behind the info button.</p>}
        </>
      )}

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
        <label className="swatch tool rainbow" title="Any color">
          <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(box.textColor) ? box.textColor : "#FFFFFF"} aria-label="Pick any color"
            onChange={(e) => setBox({ textColor: e.target.value.toUpperCase() })} />
          <span className="plusDot" aria-hidden="true"><Icon name="plus" size={12} /></span>
        </label>
        <button type="button" className={pickMode ? "swatch tool on" : "swatch tool"} onClick={eyedropper} aria-pressed={pickMode} aria-label="Pick a color from the photo"><Icon name="eyedropper" size={20} /></button>
        <button type="button" className="swatch tool rainbow" onClick={randomColor} aria-label="Random palette color"><Icon name="shuffle" size={18} /></button>
        {palette.map((c) => (
          <button type="button" key={c.hex} className={box.textColor === c.hex ? "swatch on" : "swatch"} style={{ background: c.hex }}
            aria-label={c.name} aria-pressed={box.textColor === c.hex} onClick={() => setBox({ textColor: c.hex })} />
        ))}
      </div>
      {/* Their own row beside the 11 colors (Arjang #263, Quill #269): each sets the color and the opacity together. */}
      <div className="swatches presets" role="group" aria-label="Colors at 50%">
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
      <details className="customColors">
        <summary><span>Custom colors</span><span className="countBadge">{customColors.length}</span></summary>
        {customColors.length ? (
          <div className="swatches">
            {customColors.map((hex) => (
              <button type="button" key={hex} className={box.textColor === hex ? "swatch on" : "swatch"} style={{ background: hex }}
                aria-label={`Custom ${hex}`} aria-pressed={box.textColor === hex} onClick={() => setBox({ textColor: hex })} />
            ))}
          </div>
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

      <span className="fieldLabel">Font weight</span>
      <div className="segmented" role="group" aria-label="Font weight">
        {WEIGHTS.map(([w, name]) => (
          <button type="button" key={w} className={Number(box.fontWeight) === w ? "on" : ""} style={{ fontWeight: w }} aria-pressed={Number(box.fontWeight) === w} onClick={() => setBox({ fontWeight: w })}>{name}</button>
        ))}
      </div>

      <div className="rowBetween">
        <label className="fieldLabel inline" htmlFor="contrastField">Image contrast</label>
        <div className="selectWrap pill">
          <select id="contrastField" className="field" value={draft.imageEdit?.contrast || "normal"} onChange={(e) => setImageEdit({ contrast: e.target.value })}>
            {CONTRAST_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <Icon name="chevronDown" size={16} className="selectChevron" />
        </div>
      </div>

      <Slider label="Size" value={box.fontSize} min={24} max={110} inline onChange={(v) => setBox({ fontSize: v })} />
      <Slider label="Opacity" value={box.opacity} min={20} max={100} unit="%" inline onChange={(v) => setBox({ opacity: v })} />
      <Slider label="Horizontal" value={box.horizontalPosition} min={0} max={100} unit="%" inline onChange={(v) => setBox({ horizontalPosition: v })} />
      <Slider label="Vertical" value={box.verticalPosition} min={0} max={100} unit="%" inline onChange={(v) => setBox({ verticalPosition: v })} />

      {!isMain && <button type="button" className="dangerLink" onClick={onRemoveBox}>Remove this text box</button>}

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
        style={{ "--pct": `${((v - min) / (max - min)) * 100}%` }} />
    </div>
  );
}
