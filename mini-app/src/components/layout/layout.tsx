import { Outlet, useMatches } from "react-router-dom";
import AppToolbar from "@/components/ui/app-toolbar";
import TabBar from "@/components/ui/tab-bar";
import StickyCartBar from "@/components/ui/sticky-cart-bar";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore } from "@/stores/app.store";
import { canOrderInEntry, rootCapabilities } from "@/utils/entry-context";
import { tabsFor, toolbarModeFor } from "@/utils/nav-sets";
import { calculateCartTotal } from "@/utils/cart";
import { getBookingAccesses } from "@/services/reservation/reservation-storage";
import type { RouteHandle } from "@/types/router.types";
import { useTableSessionBill } from "@/services/order/order.queries";
import { hasPendingRound } from "@/utils/round-status";
import { useStoreMenu } from "@/services/category/category.queries";
import { orderedQuantity, pickQuickReorder } from "@/utils/quick-reorder";
import { isStoreOpen } from "@/utils/store-hours";
import QuickReorderBar from "@/components/ui/quick-reorder-bar";
import BootSplash from "@/components/ui/boot-splash";

export default function Layout() {
  const matches = useMatches();
  const handle = matches[matches.length - 1].handle as RouteHandle | undefined;
  const { hideBottomTabs, hideCart, hideHeader } = handle ?? {};
  const { items, totalItems } = useCartStore();
  const { workflow, entryContext, tableId, tableNumber, storeId, paymentTiming, zaloUserId, deviceId, sessionState, isAcceptingOrders, servingHours, theme, bootDone } = useAppStore();

  const hasVerifiedTable = entryContext.kind === "root" || tableId === entryContext.tableId;
  const canOrder = workflow !== null && hasVerifiedTable && canOrderInEntry(workflow, entryContext);
  const readOnlyMenu = entryContext.kind === "root" && (!workflow || rootCapabilities(workflow).readOnlyMenu);
  const tabs = tabsFor({
    entryKind: entryContext.kind,
    readOnlyMenu,
    reservationsEnabled: workflow?.reservationsEnabled === true,
    hasBookings: getBookingAccesses(storeId).length > 0,
  });
  const showTabs = !hideBottomTabs && tabs.length > 1;
  // Cùng route /session-orders: ở bàn là "Đơn gọi", lối vào thường (đơn mang về) là "Đơn của tôi" — khớp nhãn tab.
  const toolbarTitle = handle?.title === "Đơn gọi" && entryContext.kind === "root" ? "Đơn của tôi" : handle?.title;

  // Chấm báo tab Đơn gọi: chỉ trả sau tại bàn. Cùng queryKey với trang Đơn gọi nên không gọi trùng.
  const watchBill = entryContext.kind === "table" && paymentTiming === "postpay" && hasVerifiedTable;
  const { data: bill } = useTableSessionBill(tableId, zaloUserId, deviceId, watchBill);
  const sessionPending =
    watchBill && !!bill && bill.found &&
    hasPendingRound(
      bill.orders.map((o) => ({ status: o.status, source: o.order_source })),
      { paymentTiming: "postpay", kitchenPolicy: workflow?.kitchenReleasePolicy ?? "automatic" },
    );

  // Gọi thêm nhanh (mig 136): chỉ ở màn có thanh giỏ, khi bàn này đang được gọi món và đã từng gọi
  // món thuộc danh mục chủ quán tick. Cùng queryKey với trang menu nên không tải menu lần hai.
  const { data: menu } = useStoreMenu(storeId);
  const tableBlocked = sessionState?.mode === "postpay" && (sessionState.state === "locked" || sessionState.state === "reserved");
  const quickPick =
    !hideCart && canOrder && watchBill && !tableBlocked && !!bill && bill.found && !!menu &&
    isStoreOpen({ isAcceptingOrders, servingHours })
      ? pickQuickReorder(bill.orders, menu)
      : null;
  const billFound = watchBill && !!bill && bill.found ? bill : null;

  // Theme garden: chưa đọc xong quán thì chỉ hiện dòng chữ MEVO.VN ở giữa (không thanh đầu "M · MEVO", không tab).
  // Classic giữ màn chờ cũ.
  if (theme === "garden" && !bootDone) return <BootSplash />;

  return (
    <div className="relative flex h-screen w-screen flex-col bg-background">
      {!hideHeader && (
        <AppToolbar title={toolbarTitle} back={handle?.back} mode={toolbarModeFor({ entryKind: entryContext.kind, canOrder })} cartCount={totalItems} tableTotal={billFound ? billFound.total : undefined} tableOpenedAt={billFound ? billFound.opened_at : undefined} />
      )}
      <main className="relative min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      {quickPick && <QuickReorderBar pick={quickPick} ordered={billFound ? orderedQuantity(billFound.orders, quickPick) : 0} />}
      {!hideCart && canOrder && (
        <StickyCartBar count={totalItems} total={calculateCartTotal(items)} tableLabel={entryContext.kind === "table" ? tableNumber : undefined} aboveTabBar={showTabs} />
      )}
      {showTabs && <TabBar tabs={tabs} badges={{ session: sessionPending }} />}
    </div>
  );
}
