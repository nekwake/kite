// Line icons (24×24 grid, 1.7 stroke) used across panels instead of text glyphs.

const PATHS = {
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  filePlus: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6",
  folderPlus: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  collapse: "M9 9h11v11H9zM5 15V5a1 1 0 0 1 1-1h9M12 14.5h5",
  history: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2",
  openTab: "M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  fetch: "M4 14a5 5 0 0 1 2-9.6 6 6 0 0 1 11.3 1.7A4 4 0 0 1 20 14M12 11v10M8.5 17.5L12 21l3.5-3.5",
  pull: "M12 4v15M6 13l6 6 6-6",
  push: "M12 20V5M6 11l6-6 6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  close: "M6 6l12 12M18 6L6 18",
  maximize: "M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7",
  restore: "M14 10l7-7M10 14l-7 7M14 4v6h6M10 20v-6H4",
  split: "M4 4h16v16H4zM12 4v16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z",
  terminal: "M5 17l5-5-5-5M12 19h7",
  layoutFull: "M3 4h18v16H3zM3 14h18",
  layoutLeft: "M3 4h18v16H3zM14 4v16M3 14h11",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a2 2 0 0 0 3.4 0",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Tree/section disclosure arrow */
export function Chevron({ open }: { open: boolean }) {
  return <Icon name={open ? "chevronDown" : "chevronRight"} size={14} className="chevron" />;
}
