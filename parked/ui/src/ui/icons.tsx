/** A small, consistent icon set: 24-unit grid, 1.75 stroke, currentColor. Decorative unless labelled. */

import type { JSX } from "preact";

const PATHS = {
  inbox: "M4 13h4l1.5 2.5h5L16 13h4M5.5 5h13L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-5z",
  room: "M4 6.5h16M4 12h16M4 17.5h10",
  shield: "M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z",
  refresh: "M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4",
  cloudOff: "M3 3l18 18M8.5 6.6A6 6 0 0 1 17.6 10 4 4 0 0 1 20 17.2M17 18H7a4.5 4.5 0 0 1-1.6-8.7",
  merge: "M7 4v16M7 7a5 5 0 0 0 5 5h3M17 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  unlock: "M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2",
  message: "M4 5h16v11H9l-5 4z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5h4",
  check: "M5 12.5 10 17 19 7.5",
  circle: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  alert: "M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.01",
  refused: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM6.5 6.5l11 11",
  carry: "M4 7h9a5 5 0 0 1 0 10H8M10 13.5 6.5 17 10 20.5",
  clock: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4l2.5 2",
  play: "M8 5.5v13l10-6.5z",
  pause: "M8 5v14M16 5v14",
  back: "M18 6 10 12l8 6zM6 6v12",
  forward: "M6 6l8 6-8 6zM18 6v12",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  monitor: "M3.5 5h17v11h-17zM9 20h6M12 16v4",
  chevron: "M9 6l6 6-6 6",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  info: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 11v5M12 8v.01",
  commit: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 12h6M15 12h6",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  why: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  close: "M6 6l12 12M18 6 6 18",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  keyboard: "M3 6.5h18v11H3zM7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, label, class: cls }: { name: IconName; size?: number; label?: string; class?: string }): JSX.Element {
  return (
    <svg
      class={`icon${cls ? ` ${cls}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
