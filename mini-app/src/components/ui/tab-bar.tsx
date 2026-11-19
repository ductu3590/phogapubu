import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDaysIcon, ClipboardListIcon, UtensilsIcon } from "@/components/common/icons";
import { activeTabKey, type TabDef, type TabKey } from "@/utils/nav-sets";
import { cn } from "@/utils/cn";

const ICON: Record<TabKey, (p: { className: string }) => JSX.Element> = {
  home: (p) => <UtensilsIcon {...p} />,
  menu: (p) => <UtensilsIcon {...p} />,
  reserve: (p) => <CalendarDaysIcon {...p} />,
  "my-orders": (p) => <ClipboardListIcon {...p} />,
  session: (p) => <ClipboardListIcon {...p} />,
};

// Theme garden: mục đang chọn dùng icon TÔ ĐẶC (bản vẽ docs/design/yen-garden/apple-hig, HIG tab-bars.md:
// "Prefer filled symbols"). Vẽ tay cùng hình với icon lucide ở trên; chữ trong hình đục bằng màu nền.
// Garden: tab "Trang chủ" là ngôi nhà (bản vẽ), không dùng dao nĩa trùng với tab Thực đơn.
const outline = (d: string) => (p: { className: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d={d} />
  </svg>
);
const CLIPBOARD_OUTLINE = outline("M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M8 3h8v3H8zM9 11h6M9 15h4");
const GARDEN_OUTLINE: Record<TabKey, (p: { className: string }) => JSX.Element> = {
  home: outline("M3.5 11 12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"),
  menu: outline("M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-1.8 1.5-2.5 4-2.5 7h3V21"),
  reserve: outline("M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM8 3v4M16 3v4M4 10h16"),
  "my-orders": CLIPBOARD_OUTLINE,
  session: CLIPBOARD_OUTLINE,
};

const FILLED: Record<TabKey, (p: { className: string }) => JSX.Element> = {
  home: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  menu: (p) => <UtensilsFilled {...p} />,
  reserve: (p) => (
    <svg viewBox="0 0 24 24" aria-hidden {...p}>
      <path fill="currentColor" d="M8 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1z" />
      <path fill="none" stroke="rgb(var(--c-background))" strokeWidth={1.8} strokeLinecap="round" d="M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  ),
  "my-orders": (p) => <ClipboardFilled {...p} />,
  session: (p) => <ClipboardFilled {...p} />,
};

function UtensilsFilled(p: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <path d="M5 2.5a1 1 0 0 1 1 1V8h1V3.5a1 1 0 0 1 2 0V8h1V3.5a1 1 0 0 1 2 0V9a3 3 0 0 1-2 2.8V21a1 1 0 0 1-2 0v-9.2A3 3 0 0 1 4 9V3.5a1 1 0 0 1 1-1zM17 2.5c.6 0 1 .4 1 1V21a1 1 0 0 1-2 0v-6h-2a1 1 0 0 1-1-1c0-5 1.5-9.5 4-11.5z" />
    </svg>
  );
}

function ClipboardFilled(p: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...p}>
      <path fill="currentColor" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" d="M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M8 3h8v3H8z" />
      <path fill="none" stroke="rgb(var(--c-background))" strokeWidth={1.8} strokeLinecap="round" d="M9 11h6M9 15h4" />
    </svg>
  );
}

// badges: chấm đỏ góc icon (vd. tab Đơn gọi còn lượt chờ thu ngân xác nhận).
export default function TabBar({ tabs, badges = {} }: { tabs: TabDef[]; badges?: Partial<Record<TabKey, boolean>> }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeKey = activeTabKey(tabs, pathname);
  return (
    <nav className="flex shrink-0 border-t border-neutral100 bg-surface garden:bg-background" style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          // Cỡ chữ đặt ở nút: cn() (tailwind-merge) gộp nhầm "text-xxsmall" (cỡ) với "text-primary" (màu)
          // và bỏ mất cỡ chữ ở nhãn bên dưới. Garden đặt 12px ở đây để nhãn không bị phóng 15px.
          <button key={tab.key} type="button" onClick={() => navigate(tab.path)} aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 garden:gap-[3px] garden:pb-0 garden:pt-1.5 garden:text-[12px] garden:leading-4">
            {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary garden:hidden" aria-hidden />}
            <span className="relative">
              {ICON[tab.key]({ className: cn("size-6 garden:hidden", active ? "text-primary" : "text-neutral300") })}
              {!active && GARDEN_OUTLINE[tab.key]({ className: "hidden size-[22px] text-text-secondary garden:block" })}
              {active && FILLED[tab.key]({ className: "hidden size-[22px] text-primary garden:block" })}
              {badges[tab.key] && <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-critical-dot garden:border-background" aria-label="Có lượt chờ xác nhận" />}
            </span>
            <span className={cn("text-xxsmall font-semibold", active ? "text-primary garden:font-bold" : "text-text-secondary garden:font-medium")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
