import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDaysIcon, ClipboardListIcon, UtensilsIcon } from "@/components/common/icons";
import type { TabDef, TabKey } from "@/utils/nav-sets";
import { cn } from "@/utils/cn";

const ICON: Record<TabKey, (p: { className: string }) => JSX.Element> = {
  home: (p) => <UtensilsIcon {...p} />,
  menu: (p) => <UtensilsIcon {...p} />,
  reserve: (p) => <CalendarDaysIcon {...p} />,
  "my-orders": (p) => <ClipboardListIcon {...p} />,
  session: (p) => <ClipboardListIcon {...p} />,
};

export default function TabBar({ tabs }: { tabs: TabDef[] }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className="flex shrink-0 border-t border-neutral100 bg-surface" style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}>
      {tabs.map((tab) => {
        const active = tab.matchPaths.includes(pathname);
        return (
          <button key={tab.key} type="button" onClick={() => navigate(tab.path)} aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2">
            {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
            {ICON[tab.key]({ className: cn("size-6", active ? "text-primary" : "text-neutral300") })}
            <span className={cn("text-xxsmall font-semibold", active ? "text-primary" : "text-text-secondary")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
