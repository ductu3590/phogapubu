import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// Thanh hành động dính đáy. Nằm TRONG luồng flex của Layout (không fixed) nên không bao giờ đè
// TabBar; trang không có TabBar thì tự cộng safe-area đáy.
export default function StickyActionBar({ variant, children, aboveTabBar }: { variant: "dark" | "primary"; children: ReactNode; aboveTabBar: boolean }) {
  return (
    <div
      className={cn("shrink-0 px-3 pt-2", variant === "dark" ? "bg-transparent" : "border-t border-neutral100 bg-surface")}
      style={{ paddingBottom: aboveTabBar ? "8px" : "calc(var(--zaui-safe-area-inset-bottom, 0px) + 12px)" }}
    >
      {children}
    </div>
  );
}
