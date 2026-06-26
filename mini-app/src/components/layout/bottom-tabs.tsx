import { useNavigate, useLocation } from "react-router-dom";
import { useCartStore } from "@/stores/cart.store";
import { cn } from "@/utils/cn";

const TABS = [
  {
    path: "/",
    matchPaths: ["/", "/menu"],
    label: "Menu",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={cn("h-6 w-6", active ? "text-primary" : "text-neutral300")} fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    path: "/session-orders",
    matchPaths: ["/session-orders"],
    label: "Đã gọi",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={cn("h-6 w-6", active ? "text-primary" : "text-neutral300")} fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    path: "/store-info",
    matchPaths: ["/store-info"],
    label: "Nhà hàng",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={cn("h-6 w-6", active ? "text-primary" : "text-neutral300")} fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
  },
] as const;

export default function BottomTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { totalItems } = useCartStore();

  return (
    <div
      className="flex shrink-0 border-t border-neutral100 bg-white"
      style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}
    >
      {TABS.map((tab) => {
        const active = (tab.matchPaths as readonly string[]).includes(pathname);
        const isOrderTab = tab.path === "/session-orders";
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
          >
            <div className="relative">
              {tab.icon(active)}
              {isOrderTab && totalItems > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </div>
            <span
              className={cn(
                "text-[10px] font-medium",
                active ? "text-primary" : "text-neutral300",
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
