// Line icons for the review screen, drawn for this app: one 24px grid, one stroke weight.

const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  arrowLeft: <><path d="M20 12H5" /><path d="M10 7l-5 5 5 5" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="M14 7l5 5-5 5" /></>,
  info: <><circle cx="12" cy="12" r="9.25" /><path d="M12 11v6" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" /></>,
  undo: <><path d="M5.6 9.5A7.5 7.5 0 1 1 4.6 14" /><path d="M5.3 4.6v5.2h5.2" /></>,
  redo: <><path d="M18.4 9.5A7.5 7.5 0 1 0 19.4 14" /><path d="M18.7 4.6v5.2h-5.2" /></>,
  heart: <path d="M12 20.3s-7.4-4.4-9.1-9.1C1.7 7.8 3.8 4.6 7.1 4.6c2 0 3.6 1.1 4.9 3 1.3-1.9 2.9-3 4.9-3 3.3 0 5.4 3.2 4.2 6.6-1.7 4.7-9.1 9.1-9.1 9.1z" />,
  repost: <><path d="M17 2.8l3.2 3.2L17 9.2" /><path d="M3.8 11.2V10a4 4 0 0 1 4-4h12.4" /><path d="M7 21.2L3.8 18 7 14.8" /><path d="M20.2 12.8V14a4 4 0 0 1-4 4H3.8" /></>,
  download: <><path d="M12 3.5v11.5" /><path d="M7 10l5 5 5-5" /><path d="M4.5 20h15" /></>,
  dislike: <><path d="M7.5 3.5h9.3a2 2 0 0 1 1.9 1.5l1.7 6.6a2 2 0 0 1-1.9 2.5h-4.6l.8 3.7a2.1 2.1 0 0 1-2 2.6l-5.2-6.8z" /><path d="M3.5 3.5h4v10.2h-4z" /></>,
  comment: <path d="M4.5 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2L4.5 20.5z" />,
  edit: <><path d="M14.6 4.4l3.9 3.9L8.3 18.5l-4.8.9.9-4.8z" /><path d="M12.6 6.4l3.9 3.9" /><path d="M13 20h7.5" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  sparkle: <><path d="M10.5 3.5l1.6 4.6 4.6 1.6-4.6 1.6-1.6 4.6-1.6-4.6-4.6-1.6 4.6-1.6z" /><path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  play: <path d="M8.5 5.8v12.4l9.8-6.2z" fill="currentColor" stroke="none" />,
  pause: <><path d="M8.5 6v12" /><path d="M15.5 6v12" /></>,
  shuffle: <><path d="M16.5 4h3.5v3.5" /><path d="M4 19.5L20 4" /><path d="M20 16.5V20h-3.5" /><path d="M14.5 14.5L20 20" /><path d="M4 4.5l5.2 5.2" /></>,
  star: <path d="M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z" />,
  check: <path d="M6.8 12.6l3.4 3.4 7-7.2" />,
  text: <><path d="M5.5 6.5V5h13v1.5" /><path d="M12 5v14" /><path d="M9.2 19h5.6" /></>,
  mosaic: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>,
  eyedropper: <><path d="M14.2 5.6l4.2 4.2" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3l-2.3 2.3-3-3z" /><path d="M14.4 7.8L6 16.2l-1 3.8 3.8-1 8.4-8.4" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></>,
  photoAdd: <><rect x="3.5" y="5" width="14" height="14" rx="2.5" /><path d="M3.5 15.5l4-4 3.5 3.5 2-2 4.5 4.5" /><path d="M19.5 3v5.5" /><path d="M16.75 5.75h5.5" /></>,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.8 4.2v4.6h-4.6" /></>,
  zoom: <><circle cx="10.5" cy="10.5" r="6.25" /><path d="M15.1 15.1L20 20" /><path d="M10.5 7.9v5.2" /><path d="M7.9 10.5h5.2" /></>,
};

/** An icon by name. Decorative by default; give it a label when it stands alone. */
export default function Icon({ name, size = 24, filled = false, label, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"} focusable="false">
      {PATHS[name]}
    </svg>
  );
}
