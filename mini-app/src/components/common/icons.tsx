// Icon dùng trong Mini App — đường vẽ lấy từ lucide (ISC license, https://lucide.dev), CÙNG bộ icon với admin-web.
// File SINH TỰ ĐỘNG bởi scripts/gen-mini-app-icons.cjs — thêm icon thì thêm tên vào NAMES trong script rồi chạy lại, đừng sửa tay.
// Không cài lucide-react vào mini-app: mỗi worktree quán sẽ phải npm install lại trước khi deploy.
import type { SVGProps } from "react";

type IconNode = [string, Record<string, string>][];

function createIcon(displayName: string, node: IconNode) {
  function Icon({ className, ...props }: SVGProps<SVGSVGElement>) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className ?? "size-5"}
        {...props}
      >
        {node.map(([tag, attrs], index) => {
          const Tag = tag as "path";
          return <Tag key={index} {...attrs} />;
        })}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const BikeIcon = createIcon("BikeIcon", [
  ["circle", { cx: "18.5", cy: "17.5", r: "3.5" }],
  ["circle", { cx: "5.5", cy: "17.5", r: "3.5" }],
  ["circle", { cx: "15", cy: "5", r: "1" }],
  ["path", { d: "M12 17.5V14l-3-3 4-3 2 3h2" }]
] as IconNode);

export const LockIcon = createIcon("LockIcon", [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]
] as IconNode);

export const BellIcon = createIcon("BellIcon", [
  ["path", { d: "M10.268 21a2 2 0 0 0 3.464 0" }],
  [
    "path",
    {
      d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
    }
  ]
] as IconNode);

export const ArmchairIcon = createIcon("ArmchairIcon", [
  ["path", { d: "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" }],
  [
    "path",
    {
      d: "M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"
    }
  ],
  ["path", { d: "M5 18v2" }],
  ["path", { d: "M19 18v2" }]
] as IconNode);

export const LayersIcon = createIcon("LayersIcon", [
  [
    "path",
    {
      d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
    }
  ],
  [
    "path",
    {
      d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
    }
  ],
  [
    "path",
    {
      d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
    }
  ]
] as IconNode);

export const MoonIcon = createIcon("MoonIcon", [
  [
    "path",
    {
      d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
    }
  ]
] as IconNode);

export const CircleAlertIcon = createIcon("CircleAlertIcon", [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["line", { x1: "12", x2: "12", y1: "8", y2: "12" }],
  ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16" }]
] as IconNode);

export const UtensilsIcon = createIcon("UtensilsIcon", [
  ["path", { d: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" }],
  ["path", { d: "M7 2v20" }],
  ["path", { d: "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" }]
] as IconNode);

export const TicketIcon = createIcon("TicketIcon", [
  [
    "path",
    {
      d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"
    }
  ],
  ["path", { d: "M13 5v2" }],
  ["path", { d: "M13 17v2" }],
  ["path", { d: "M13 11v2" }]
] as IconNode);

export const UserIcon = createIcon("UserIcon", [
  ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
  ["circle", { cx: "12", cy: "7", r: "4" }]
] as IconNode);

export const GiftIcon = createIcon("GiftIcon", [
  ["path", { d: "M12 7v14" }],
  ["path", { d: "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" }],
  [
    "path",
    { d: "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5" }
  ],
  ["rect", { x: "3", y: "7", width: "18", height: "4", rx: "1" }]
] as IconNode);

export const FootprintsIcon = createIcon("FootprintsIcon", [
  [
    "path",
    {
      d: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"
    }
  ],
  [
    "path",
    {
      d: "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"
    }
  ],
  ["path", { d: "M16 17h4" }],
  ["path", { d: "M4 13h4" }]
] as IconNode);

export const TriangleAlertIcon = createIcon("TriangleAlertIcon", [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
    }
  ],
  ["path", { d: "M12 9v4" }],
  ["path", { d: "M12 17h.01" }]
] as IconNode);

export const CreditCardIcon = createIcon("CreditCardIcon", [
  ["rect", { width: "20", height: "14", x: "2", y: "5", rx: "2" }],
  ["line", { x1: "2", x2: "22", y1: "10", y2: "10" }]
] as IconNode);

export const BanknoteIcon = createIcon("BanknoteIcon", [
  ["rect", { width: "20", height: "12", x: "2", y: "6", rx: "2" }],
  ["circle", { cx: "12", cy: "12", r: "2" }],
  ["path", { d: "M6 12h.01M18 12h.01" }]
] as IconNode);

export const HourglassIcon = createIcon("HourglassIcon", [
  ["path", { d: "M5 22h14" }],
  ["path", { d: "M5 2h14" }],
  [
    "path",
    {
      d: "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"
    }
  ],
  [
    "path",
    { d: "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" }
  ]
] as IconNode);

export const CircleCheckIcon = createIcon("CircleCheckIcon", [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["path", { d: "m9 12 2 2 4-4" }]
] as IconNode);

export const ChefHatIcon = createIcon("ChefHatIcon", [
  [
    "path",
    {
      d: "M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"
    }
  ],
  ["path", { d: "M6 17h12" }]
] as IconNode);

export const CircleXIcon = createIcon("CircleXIcon", [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["path", { d: "m15 9-6 6" }],
  ["path", { d: "m9 9 6 6" }]
] as IconNode);

export const MapPinIcon = createIcon("MapPinIcon", [
  [
    "path",
    {
      d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
    }
  ],
  ["circle", { cx: "12", cy: "10", r: "3" }]
] as IconNode);

export const RotateCwIcon = createIcon("RotateCwIcon", [
  ["path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }],
  ["path", { d: "M21 3v5h-5" }]
] as IconNode);

export const PartyPopperIcon = createIcon("PartyPopperIcon", [
  ["path", { d: "M5.8 11.3 2 22l10.7-3.79" }],
  ["path", { d: "M4 3h.01" }],
  ["path", { d: "M22 8h.01" }],
  ["path", { d: "M15 2h.01" }],
  ["path", { d: "M22 20h.01" }],
  [
    "path",
    {
      d: "m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"
    }
  ],
  [
    "path",
    { d: "m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17" }
  ],
  ["path", { d: "m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" }],
  [
    "path",
    {
      d: "M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"
    }
  ]
] as IconNode);

export const ClockIcon = createIcon("ClockIcon", [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["path", { d: "M12 6v6l4 2" }]
] as IconNode);

export const LandmarkIcon = createIcon("LandmarkIcon", [
  ["path", { d: "M10 18v-7" }],
  [
    "path",
    {
      d: "M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"
    }
  ],
  ["path", { d: "M14 18v-7" }],
  ["path", { d: "M18 18v-7" }],
  ["path", { d: "M3 22h18" }],
  ["path", { d: "M6 18v-7" }]
] as IconNode);

export const ClipboardListIcon = createIcon("ClipboardListIcon", [
  ["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1" }],
  [
    "path",
    {
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    }
  ],
  ["path", { d: "M12 11h4" }],
  ["path", { d: "M12 16h4" }],
  ["path", { d: "M8 11h.01" }],
  ["path", { d: "M8 16h.01" }]
] as IconNode);

export const PackageIcon = createIcon("PackageIcon", [
  [
    "path",
    {
      d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
    }
  ],
  ["path", { d: "M12 22V12" }],
  ["polyline", { points: "3.29 7 12 12 20.71 7" }],
  ["path", { d: "m7.5 4.27 9 5.15" }]
] as IconNode);

export const ScanLineIcon = createIcon("ScanLineIcon", [
  ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2" }],
  ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }],
  ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }],
  ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }],
  ["path", { d: "M7 12h10" }]
] as IconNode);

export const PhoneIcon = createIcon("PhoneIcon", [
  [
    "path",
    {
      d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"
    }
  ]
] as IconNode);

export const WifiIcon = createIcon("WifiIcon", [
  ["path", { d: "M12 20h.01" }],
  ["path", { d: "M2 8.82a15 15 0 0 1 20 0" }],
  ["path", { d: "M5 12.859a10 10 0 0 1 14 0" }],
  ["path", { d: "M8.5 16.429a5 5 0 0 1 7 0" }]
] as IconNode);

export const FileTextIcon = createIcon("FileTextIcon", [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
  ["path", { d: "M10 9H8" }],
  ["path", { d: "M16 13H8" }],
  ["path", { d: "M16 17H8" }]
] as IconNode);

export const MessageCircleIcon = createIcon("MessageCircleIcon", [
  [
    "path",
    {
      d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
    }
  ]
] as IconNode);

export const ShoppingCartIcon = createIcon("ShoppingCartIcon", [
  ["circle", { cx: "8", cy: "21", r: "1" }],
  ["circle", { cx: "19", cy: "21", r: "1" }],
  [
    "path",
    {
      d: "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"
    }
  ]
] as IconNode);

export const HeartIcon = createIcon("HeartIcon", [
  [
    "path",
    {
      d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
    }
  ]
] as IconNode);

export const SearchIcon = createIcon("SearchIcon", [
  ["path", { d: "m21 21-4.34-4.34" }],
  ["circle", { cx: "11", cy: "11", r: "8" }]
] as IconNode);

export const ChevronLeftIcon = createIcon("ChevronLeftIcon", [["path", { d: "m15 18-6-6 6-6" }]] as IconNode);

export const PlusIcon = createIcon("PlusIcon", [
  ["path", { d: "M5 12h14" }],
  ["path", { d: "M12 5v14" }]
] as IconNode);

export const MinusIcon = createIcon("MinusIcon", [["path", { d: "M5 12h14" }]] as IconNode);

export const ArrowRightIcon = createIcon("ArrowRightIcon", [
  ["path", { d: "M5 12h14" }],
  ["path", { d: "m12 5 7 7-7 7" }]
] as IconNode);

export const CalendarDaysIcon = createIcon("CalendarDaysIcon", [
  ["path", { d: "M8 2v4" }],
  ["path", { d: "M16 2v4" }],
  ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2" }],
  ["path", { d: "M3 10h18" }],
  ["path", { d: "M8 14h.01" }],
  ["path", { d: "M12 14h.01" }],
  ["path", { d: "M16 14h.01" }],
  ["path", { d: "M8 18h.01" }],
  ["path", { d: "M12 18h.01" }],
  ["path", { d: "M16 18h.01" }]
] as IconNode);
