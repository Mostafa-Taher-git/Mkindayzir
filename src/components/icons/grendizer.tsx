/**
 * Grendizer line icons — 2px stroke, angular terminals, 24px grid.
 * Professional helpdesk/PM set. All icons accept className for sizing.
 */
import * as React from "react";

type P = { className?: string };

const base = (className?: string) => ({
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  className,
  "aria-hidden": true,
});

export const IconPalette = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 4h16v10H9l-5 5V4z" />
    <path d="M8 9h.01M12 9h.01M16 9h.01" />
  </svg>
);

export const IconImage = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="4" width="18" height="16" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M3 17l5-5 4 4 3-3 6 6" />
  </svg>
);

export const IconEdit = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 20h4L20 8l-4-4L4 16v4z" />
    <path d="M14 6l4 4" />
  </svg>
);

export const IconArchive = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="4" width="18" height="5" />
    <path d="M5 9v11h14V9" />
    <path d="M10 13h4" />
  </svg>
);

export const IconTemplate = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="4" y="3" width="16" height="18" />
    <path d="M4 9h16M10 9v12" />
  </svg>
);

export const IconMore = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={2.5} />
  </svg>
);

export const IconClose = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconCheck = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 13l5 5L20 6" />
  </svg>
);

export const IconStar = ({ className, filled }: P & { filled?: boolean }) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.6 19.6l1.1-6L3.2 9.4l6.1-.8L12 3z" />
  </svg>
);

export const IconShare = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 12v8h16v-8" />
    <path d="M12 15V3M8 7l4-4 4 4" />
  </svg>
);

export const IconDuplicate = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="8" y="8" width="12" height="12" />
    <path d="M4 16V4h12" />
  </svg>
);

export const IconVisibility = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const IconSwitch = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 7h12l-3-3M20 17H8l3 3" />
  </svg>
);

export const IconPlus = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconComment = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 5h18v12H8l-5 4V5z" />
  </svg>
);

export const IconLabel = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 3h8l10 10-8 8L3 11V3z" />
    <path d="M8 8h.01" />
  </svg>
);

export const IconClock = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

export const IconChecklist = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="4" y="4" width="16" height="16" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);

export const IconMember = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
);

export const IconTrash = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
  </svg>
);

export const IconUpload = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 20h16" />
  </svg>
);
