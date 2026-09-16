import { Outlet, useMatches } from "react-router-dom";
import Header from "./header";
import BottomTabs from "./bottom-tabs";
import CartFloatButton from "../common/cart-float-button";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore } from "@/stores/app.store";
import { canOrderInEntry } from "@/utils/entry-context";
import type { RouteHandle } from "@/types/router.types";

export default function Layout() {
  const matches = useMatches();
  const current = matches[matches.length - 1];
  const handle = current.handle as RouteHandle | undefined;

  const { hideBottomTabs, hideCart, hideHeader, headerPosition } = handle ?? {};
  const { totalItems } = useCartStore();
  const { workflow, entryContext, tableId } = useAppStore();
  const hasVerifiedTable = entryContext.kind === "root" || tableId === entryContext.tableId;
  const canShowCart = workflow !== null && hasVerifiedTable && canOrderInEntry(workflow, entryContext);

  return (
    <div className="relative flex h-screen w-screen flex-col bg-[#F7F8FA]">
      {!hideHeader && (
        <Header
          title={handle?.title}
          back={handle?.back}
          position={headerPosition}
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <Outlet />
        {!hideCart && canShowCart && totalItems > 0 && <CartFloatButton itemCount={totalItems} />}
      </div>
      {!hideBottomTabs && <BottomTabs />}
    </div>
  );
}
