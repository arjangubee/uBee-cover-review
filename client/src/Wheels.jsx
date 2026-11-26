import { useEffect, useMemo, useRef } from "react";

// Date and time wheels (1.38.0, Arjang Nov 26: Schedule Post's "date and time scheduler wheels"), the way a phone's
// own picker turns: each column scrolls and snaps, the row in the middle band is the pick, and a tap on a row turns to
// it. From a keyboard, the arrow keys step and Page Up and Page Down jump. Everything is her own local time.

const ROW = 36; // px per row; the column shows five, the middle one picked
const DAYS = 60;
const glide = () => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** One column. options: [{ value, label }]. value: the picked option's value. */
export function Wheel({ label, options, value, onChange, className = "" }) {
  const box = useRef(null);
  const settle = useRef(null);
  const scrolling = useRef(false);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  // A pick from outside (or the first draw) turns the column to it without a fuss.
  useEffect(() => {
    const el = box.current;
    if (!el || scrolling.current) return;
    if (Math.abs(el.scrollTop - index * ROW) > 1) el.scrollTop = index * ROW;
  }, [index]);
  useEffect(() => () => clearTimeout(settle.current), []);
  const onScroll = () => {
    scrolling.current = true;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      scrolling.current = false;
      const el = box.current;
      if (!el) return;
      const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (options[i] && options[i].value !== value) onChange(options[i].value);
      else if (Math.abs(el.scrollTop - i * ROW) > 1) el.scrollTo({ top: i * ROW, behavior: glide() });
    }, 110);
  };
  const go = (i) => {
    const n = Math.min(options.length - 1, Math.max(0, i));
    box.current?.scrollTo({ top: n * ROW, behavior: glide() });
    if (options[n].value !== value) onChange(options[n].value);
  };
  const onKey = (e) => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (step) { e.preventDefault(); go(index + step); return; }
    if (e.key === "Home") { e.preventDefault(); go(0); }
    if (e.key === "End") { e.preventDefault(); go(options.length - 1); }
  };
  return (
    <div className={`dtWheel ${className}`.trim()}>
      <div ref={box} className="dtScroll" role="spinbutton" tabIndex={0} aria-label={label} aria-valuenow={index}
        aria-valuemin={0} aria-valuemax={options.length - 1} aria-valuetext={options[index]?.label} onScroll={onScroll} onKeyDown={onKey}>
        <div className="dtPad" aria-hidden="true" />
        {options.map((o, i) => (
          <div key={o.value} className={i === index ? "dtRow on" : "dtRow"} aria-hidden="true" onClick={() => go(i)}>{o.label}</div>
        ))}
        <div className="dtPad" aria-hidden="true" />
      </div>
    </div>
  );
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Today", "Tomorrow", then "Sat Nov 29". */
export function dayLabel(d, today = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(today)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
}

/** "Thu Nov 27, 6:30 PM": a picked time, read back to her. */
export function whenLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${dayLabel(d)}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** A local Date for "HH:MM" on the day `days` from today, minutes rounded to 5. */
export function atTimeOfDay(hhmm, days = 1, now = new Date()) {
  const [h, m] = String(hhmm || "18:00").split(":").map(Number);
  const d = startOfDay(now);
  d.setDate(d.getDate() + days);
  d.setHours(Number.isFinite(h) ? h : 18, Number.isFinite(m) ? Math.round(m / 5) * 5 % 60 : 0, 0, 0);
  return d;
}

/** "HH:MM" of a Date, for her saved time of day. */
export const timeOfDay = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Day, hour, minute and AM or PM, as four wheels over one value (a Date). */
export function DateTimeWheels({ value, onChange, label = "When" }) {
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return { value: dayKey(d), label: dayLabel(d, today), date: d };
    });
  }, []);
  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), []);
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, "0") })), []);
  const halves = useMemo(() => [{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }], []);
  const d = new Date(value);
  const h24 = d.getHours();
  const parts = { day: dayKey(d), hour: h24 % 12 || 12, minute: Math.round(d.getMinutes() / 5) * 5 % 60, half: h24 >= 12 ? "PM" : "AM" };
  const set = (patch) => {
    const p = { ...parts, ...patch };
    const day = days.find((x) => x.value === p.day)?.date || startOfDay(new Date());
    const next = new Date(day);
    next.setHours((p.hour % 12) + (p.half === "PM" ? 12 : 0), p.minute, 0, 0);
    onChange(next);
  };
  return (
    <div className="dateWheels" role="group" aria-label={label}>
      <Wheel label={`${label}: day`} className="dtDay" options={days} value={parts.day} onChange={(day) => set({ day })} />
      <Wheel label={`${label}: hour`} options={hours} value={parts.hour} onChange={(hour) => set({ hour })} />
      <Wheel label={`${label}: minute`} options={minutes} value={parts.minute} onChange={(minute) => set({ minute })} />
      <Wheel label={`${label}: AM or PM`} options={halves} value={parts.half} onChange={(half) => set({ half })} />
    </div>
  );
}
