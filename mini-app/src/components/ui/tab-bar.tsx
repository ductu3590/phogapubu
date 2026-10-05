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

// badges: chấm đỏ góc icon (vd. tab Đơn gọi còn lượt chờ thu ngân xác nhận).
export default function TabBar({ tabs, badges = {} }: { tabs: TabDef[]; badges?: Partial<Record<TabKey, boolean>> }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeKey = activeTabKey(tabs, pathname);
  return (
    <nav className="flex shrink-0 border-t border-neutral100 bg-surface" style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button key={tab.key} type="button" onClick={() => navigate(tab.path)} aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2">
            {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
            <span className="relative">
              {ICON[tab.key]({ className: cn("size-6", active ? "text-primary" : "text-neutral300") })}
              {badges[tab.key] && <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-critical-dot" aria-label="Có lượt chờ xác nhận" />}
            </span>
            <span className={cn("text-xxsmall font-semibold", active ? "text-primary" : "text-text-secondary")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
