import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "zmp-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app.store";
import { useSessionOrders, useTableSessionBill, useTakeawayOrders } from "@/services/order/order.queries";
import { useConfirmReceived } from "@/services/order/order.mutations";
import { orderService } from "@/services/order/order.api";
import { supabase } from "@/services/supabase";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";
import { lineLabel, reconcileRounds, roundDiscount, roundSourceLabel, roundStatus, type RoundContext, type RoundTone } from "@/utils/round-status";
import { canOrderInEntry } from "@/utils/entry-context";
import SectionCard from "@/components/ui/section-card";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import StickyActionBar from "@/components/ui/sticky-action-bar";
import { GET_SESSION_ORDERS_KEY, GET_TABLE_SESSION_BILL_KEY } from "@/constants/api";
import type { SessionOrder, TakeawayOrder, OrderItem, TableSessionBillItem } from "@/types/order.types";
import { ScanLineIcon, PackageIcon, ClipboardListIcon, CircleAlertIcon, PlusIcon, RotateCwIcon } from "@/components/common/icons";

// Hook dùng chung: mở/đóng card + fetch món lần đầu
function useExpandableItems() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingItemsId, setLoadingItemsId] = useState<string | null>(null);
  const [cachedItems, setCachedItems] = useState<Record<string, OrderItem[]>>({});

  const toggle = async (orderId: string) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (!cachedItems[orderId]) {
      setLoadingItemsId(orderId);
      try {
        const full = await orderService.getOrderWithItems(orderId);
        setCachedItems((prev) => ({ ...prev, [orderId]: full.items ?? [] }));
      } catch {
        // fail silently — items sẽ là rỗng
      } finally {
        setLoadingItemsId(null);
      }
    }
  };

  return { expandedId, loadingItemsId, cachedItems, toggle };
}

export default function SessionOrdersPage() {
  const { orderMode } = useAppStore();
  return orderMode === "takeaway" ? <TakeawayOrdersView /> : <DineInOrdersView />;
}

// ============================================================
// Chế độ tại quán — trang "Đơn gọi" theo Stitch m07
// ============================================================

// Một lượt gọi món ở dạng chung cho cả trả sau (bill cả phiên, đã có món) và trả trước
// (đơn của máy này, món tải khi mở thẻ).
type Round = {
  id: string;
  status: SessionOrder["status"];
  createdAt: string;
  total: number;
  source: string;
  items: TableSessionBillItem[] | null;
};

const TONE_BAR: Record<RoundTone, string> = {
  warning: "border-l-warning-dot",
  info: "border-l-info-dot",
  success: "border-l-success-dot",
  critical: "border-l-critical-dot",
  neutral: "border-l-neutral200",
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

function DineInOrdersView() {
  const navigate = useNavigate();
  const { zaloUserId, deviceId, tableId, tableNumber, paymentTiming, workflow, sessionState, entryContext } = useAppStore();
  const queryClient = useQueryClient();
  const isPostpay = paymentTiming === "postpay";
  const ctx: RoundContext = {
    paymentTiming: isPostpay ? "postpay" : "prepay",
    kitchenPolicy: workflow?.kitchenReleasePolicy ?? "automatic",
  };

  const { expandedId, loadingItemsId, cachedItems, toggle } = useExpandableItems();
  // Trả trước: đơn của CHÍNH máy này (get_session_orders lọc theo zalo_user_id).
  // Trả sau: bill CẢ PHIÊN — phải gồm cả đơn nhân viên đặt hộ, nếu không khách nhìn tab này
  // trống trơn trong khi đang nợ cả mâm.
  const personalQuery = useSessionOrders(zaloUserId, tableId, !isPostpay);
  const billQuery = useTableSessionBill(tableId, zaloUserId, deviceId, isPostpay);
  const personalOrders = personalQuery.data;
  const bill = billQuery.data;
  const activeQuery = isPostpay ? billQuery : personalQuery;

  const rounds: Round[] = isPostpay
    ? (bill && bill.found ? bill.orders : []).map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.created_at,
        total: o.total_amount,
        source: o.order_source,
        items: o.items,
      }))
    : (personalOrders ?? []).map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        total: o.totalAmount,
        source: "customer_zalo",
        items: null,
      }));
  const isLoading = activeQuery.isLoading;
  const loadFailed = activeQuery.isError && !activeQuery.data;
  // Important #5 — chỉ mời "Gọi thêm món" khi lối vào này thật sự gọi được món
  const canOrderHere =
    !!workflow && entryContext.kind === "table" && entryContext.tableId === tableId && canOrderInEntry(workflow, entryContext);

  // Realtime: tự cập nhật khi thu ngân xác nhận / nhân viên thêm món
  useEffect(() => {
    if (!tableId) return;
    const channel = supabase
      .channel(`session-orders-${tableId}`)
      .on(
        "postgres_changes",
        // Nghe cả INSERT chứ không chỉ UPDATE: ở trả sau, đơn nhân viên đặt hộ là dòng MỚI —
        // nghe thiếu thì khách không thấy món vừa được thêm vào bàn mình.
        { event: "*", schema: "public", table: "orders", filter: `table_id=eq.${tableId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: [GET_SESSION_ORDERS_KEY] });
          void queryClient.invalidateQueries({ queryKey: [GET_TABLE_SESSION_BILL_KEY] });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tableId, queryClient]);

  // Chưa quét QR. Ở trả sau chỉ cần MỘT trong hai chân định danh (PB5): khách không lấy được
  // Zalo UID vẫn phải xem được bill của bàn mình.
  if (!tableId || (!zaloUserId && !(isPostpay && deviceId))) {
    return (
      <CenterState icon={<ScanLineIcon className="size-10" />} title="Quét QR tại bàn trước" subtitle="Vui lòng dùng Zalo quét mã QR trên bàn để xem các món đã gọi." />
    );
  }

  const tableLabel =
    (sessionState?.mode === "postpay" && sessionState.state === "owner" && sessionState.is_open_ordering && sessionState.table_names) ||
    tableNumber ||
    "Bàn của bạn";
  const sums = reconcileRounds(rounds.map((r) => ({ status: r.status, total_amount: r.total, source: r.source })), ctx);
  // Trả sau: tổng lấy thẳng từ phiên (server tính) để không lệch với số thu ngân thu.
  const grandTotal = isPostpay && bill && bill.found ? bill.total : sums.total;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-4">
        {isLoading ? (
          <ListSkeleton />
        ) : loadFailed ? (
          <CenterState
            icon={<RotateCwIcon className="size-10" />}
            title="Chưa tải được các món đã gọi"
            subtitle="Kiểm tra mạng rồi thử lại. Món đã gọi vẫn được quán ghi nhận."
            action={{ label: activeQuery.isFetching ? "Đang tải…" : "Thử lại", onClick: () => void activeQuery.refetch() }}
          />
        ) : rounds.length === 0 ? (
          <CenterState
            icon={<ClipboardListIcon className="size-10" />}
            title="Bàn chưa gọi món nào"
            subtitle="Chọn món ở Thực đơn rồi bấm Gọi món, các lượt gọi sẽ hiện ở đây."
            action={{ label: "Xem thực đơn", onClick: () => navigate("/") }}
          />
        ) : (
          <>
            {/* Thẻ đầu: bàn / mâm + tổng tạm tính (trả sau). Trả trước mỗi đơn đã tự thanh toán. */}
            {isPostpay && (
            <SectionCard>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-normal-sb font-bold text-text-primary">
                    <span className="size-2 shrink-0 rounded-full bg-success-dot" aria-hidden />
                    <span className="truncate">{tableLabel}</span>
                  </p>
                  <p className="mt-0.5 text-xxsmall text-text-secondary">
                    {isPostpay && bill && bill.found ? `Giờ vào ${hhmm(bill.opened_at)} · ` : ""}
                    <span className="font-semibold text-success">Đang phục vụ</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xxsmall font-semibold uppercase tracking-wide text-text-secondary">Tổng tạm tính</p>
              <p className="mt-0.5 text-2xl font-extrabold text-primary">{formatCurrency(grandTotal)}đ</p>
            </SectionCard>
            )}

            <div className="flex items-baseline justify-between px-4 pb-1 pt-5">
              <h2 className="text-small-m font-bold uppercase tracking-wide text-text-primary">
                Các lượt gọi món ({rounds.length} lượt)
              </h2>
              <span className="text-xxsmall text-text-secondary">Mới nhất ở trên</span>
            </div>

            <div className="space-y-3">
              {rounds.map((round, idx) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  number={rounds.length - idx}
                  ctx={ctx}
                  // Trả trước: món tải khi mở thẻ (get_session_orders không kèm món)
                  lazy={
                    round.items === null
                      ? { expanded: expandedId === round.id, loading: loadingItemsId === round.id, items: cachedItems[round.id] ?? null, onToggle: () => void toggle(round.id) }
                      : null
                  }
                />
              ))}
            </div>

            {/* Đối soát tạm tính — chỉ trả sau */}
            {isPostpay && (
            <SectionCard title="Đối soát tạm tính" className="mt-4">
              <div className="space-y-1.5 text-small">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Đã vào bếp</span>
                  <span className="font-semibold text-text-primary">{formatCurrency(sums.inKitchen)}đ</span>
                </div>
                {sums.pending > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">{isPostpay ? "Đang chờ xác nhận" : "Chờ thanh toán"}</span>
                    <span className="font-semibold text-warning">{formatCurrency(sums.pending)}đ</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-neutral100 pt-3">
                <span className="text-normal-sb font-bold text-text-primary">Tổng cộng tạm tính</span>
                <span className="text-large-m font-extrabold text-primary">{formatCurrency(grandTotal)}đ</span>
              </div>
              {isPostpay && (
                <p className="mt-2 flex items-start gap-1.5 text-xxsmall text-text-secondary">
                  <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                  Quý khách thanh toán tại quầy thu ngân khi kết thúc bữa.
                </p>
              )}
            </SectionCard>
            )}
          </>
        )}
      </div>

      {/* Gọi thêm món — việc tiếp theo hiển nhiên của quán nhậu gọi nhiều lượt */}
      {canOrderHere && rounds.length > 0 && (
      <StickyActionBar variant="primary" aboveTabBar>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-normal-sb font-bold text-white shadow active:opacity-90"
        >
          <PlusIcon className="size-5" />
          Gọi thêm món
        </button>
      </StickyActionBar>
      )}
    </div>
  );
}

function RoundCard({
  round,
  number,
  ctx,
  lazy,
}: {
  round: Round;
  number: number;
  ctx: RoundContext;
  lazy: { expanded: boolean; loading: boolean; items: OrderItem[] | null; onToggle: () => void } | null;
}) {
  const status = roundStatus(round.status, ctx, round.source);
  const lines = (round.items ?? []).map((item) => {
    const toppings = item.toppings ?? [];
    const unit = item.price + toppings.reduce((s, t) => s + (t.price ?? 0), 0);
    return { item, toppings, line: lineLabel({ quantity: item.quantity, price: unit, void_type: item.void_type }) };
  });
  const discount = round.items ? roundDiscount(lines.reduce((s, l) => s + l.line.amount, 0), round.total) : 0;
  const source = roundSourceLabel(round.source);
  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-small-m font-bold text-text-primary">
          Lượt #{String(number).padStart(2, "0")} <span className="font-normal text-text-secondary">· {hhmm(round.createdAt)}</span>
        </p>
        {source && <p className="mt-0.5 text-xxsmall text-text-secondary">{source}</p>}
      </div>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
    </div>
  );

  return (
    <section className={cn("mx-3 rounded-2xl border-l-4 bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]", TONE_BAR[status.tone])}>
      {lazy ? (
        <button type="button" onClick={lazy.onToggle} className="block w-full text-left">
          {header}
        </button>
      ) : (
        header
      )}

      {lines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lines.map(({ item, toppings, line }) => {
            return (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-small font-medium text-text-primary">{item.name}</p>
                  {toppings.length > 0 && (
                    <p className="line-clamp-1 text-xxsmall text-text-secondary">{toppings.map((t) => `+ ${t.name}`).join(", ")}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xxsmall text-text-secondary">×{item.quantity}</p>
                  <p className={cn("whitespace-nowrap text-small font-semibold", line.gift ? "text-success" : "text-text-primary")}>
                    {line.gift ? "Đã tặng · 0đ" : `${formatCurrency(line.amount)}đ`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lazy?.expanded && <ItemsList isLoadingItems={lazy.loading} items={lazy.items} />}

      {discount > 0 && (
        <div className="mt-2 flex justify-between text-small">
          <span className="text-text-secondary">Giảm giá</span>
          <span className="font-semibold text-success">−{formatCurrency(discount)}đ</span>
        </div>
      )}
      <div className="mt-3 flex justify-between border-t border-dashed border-neutral200 pt-2.5 text-small">
        <span className="text-text-secondary">Tiểu kế lượt gọi</span>
        <span className="font-bold text-text-primary">{formatCurrency(round.total)}đ</span>
      </div>
    </section>
  );
}

function CenterState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary">{icon}</span>
      <p className="text-normal-sb font-bold text-text-primary">{title}</p>
      <p className="text-small text-text-secondary">{subtitle}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-1 rounded-full bg-primary px-5 py-2.5 text-small-m font-bold text-white">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Chế độ mang về — lịch sử 30 ngày + nút "Đã nhận"
// ============================================================
function TakeawayOrdersView() {
  const { zaloUserId, storeId } = useAppStore();
  const { openSnackbar } = useSnackbar();
  const { expandedId, loadingItemsId, cachedItems, toggle } = useExpandableItems();
  const { data: orders, isLoading } = useTakeawayOrders(zaloUserId, storeId);
  const { mutate: confirmReceived, isPending: isConfirming } = useConfirmReceived();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleReceive = (orderId: string) => {
    setConfirmingId(orderId);
    confirmReceived(
      { orderId, zaloUserId },
      {
        onSuccess: () => {
          openSnackbar({ text: "Đã xác nhận nhận hàng. Cảm ơn bạn!", type: "success" });
        },
        onError: () => {
          openSnackbar({ text: "Không xác nhận được, thử lại sau.", type: "error" });
        },
        onSettled: () => setConfirmingId(null),
      },
    );
  };

  // Chưa lấy được Zalo user id (chưa mở từ Zalo / chưa cấp quyền)
  if (!zaloUserId) {
    return (
      <CenterState
        icon={<PackageIcon className="size-10" />}
        title="Chưa có thông tin đơn"
        subtitle="Vui lòng mở Mini App trong Zalo để xem đơn mang về của bạn."
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <ListSkeleton />
        ) : !orders || orders.length === 0 ? (
          <CenterState
            icon={<ClipboardListIcon className="size-10" />}
            title="Chưa có đơn mang về nào"
            subtitle="Vào Trang chủ để đặt món mang về nhé!"
          />
        ) : (
          <>
            <div className="mx-3 mt-3 space-y-3">
              {orders.map((order) => (
                <TakeawayOrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedId === order.id}
                  isLoadingItems={loadingItemsId === order.id}
                  items={cachedItems[order.id] ?? null}
                  isConfirming={isConfirming && confirmingId === order.id}
                  onToggle={() => void toggle(order.id)}
                  onReceive={() => handleReceive(order.id)}
                />
              ))}
            </div>
            <p className="mt-3 text-center text-xxsmall text-text-secondary">
              Lịch sử 30 ngày gần đây
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components dùng chung
// ============================================================

function ListSkeleton() {
  return (
    <div className="mx-3 mt-3 space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}

function ItemsList({
  isLoadingItems,
  items,
}: {
  isLoadingItems: boolean;
  items: OrderItem[] | null;
}) {
  return (
    <div className="border-t border-neutral100 px-4 pb-3 pt-2">
      {isLoadingItems ? (
        <div className="space-y-2 py-2">
          {[1, 2].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-neutral100" />)}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {(items ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <span className="text-small text-text-primary">
                <span className="font-semibold">×{item.quantity}</span> {item.name}
              </span>
              <span className="text-small text-text-secondary">
                {formatCurrency(item.price * item.quantity)}đ
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chevron({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-neutral300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
      fill="none" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Suy ra badge trạng thái cho đơn mang về (mục 5.6 spec)
function getTakeawayStatus(order: TakeawayOrder): {
  label: string;
  tone: PillTone;
  showReceive: boolean;
} {
  if (order.completedAt) return { label: "Đã hoàn thành", tone: "success", showReceive: false };
  if (order.status === "ready") return { label: "Món xong — chờ nhận", tone: "warning", showReceive: true };
  if (order.status === "cooking") return { label: "Đang làm", tone: "info", showReceive: false };
  return { label: "Đang xử lý", tone: "neutral", showReceive: false };
}

function TakeawayOrderCard({
  order,
  isExpanded,
  isLoadingItems,
  items,
  isConfirming,
  onToggle,
  onReceive,
}: {
  order: TakeawayOrder;
  isExpanded: boolean;
  isLoadingItems: boolean;
  items: OrderItem[] | null;
  isConfirming: boolean;
  onToggle: () => void;
  onReceive: () => void;
}) {
  const time = new Date(order.createdAt).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
  const typeLabel = order.orderType === "delivery" ? "Ship" : "Tự lấy";
  const { label, tone, showReceive } = getTakeawayStatus(order);
  const isDone = !!order.completedAt;

  return (
    <div className="rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-small-m font-semibold text-text-primary">
            {typeLabel} · {time}
          </p>
          <div className="mt-1"><StatusPill tone={tone}>{label}</StatusPill></div>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-small font-semibold ${isDone ? "text-text-secondary" : "text-primary"}`}>
            {formatCurrency(order.totalAmount)}đ
          </p>
          <Chevron isExpanded={isExpanded} />
        </div>
      </button>

      {/* Nút "Đã nhận" cho đơn đã xong, chưa hoàn thành */}
      {showReceive && (
        <div className="px-4 pb-3">
          <button
            onClick={onReceive}
            disabled={isConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-success-dot py-2.5 text-small-m font-semibold text-white active:opacity-80 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isConfirming ? "Đang xác nhận..." : "Đã nhận"}
          </button>
          <p className="mt-1.5 text-center text-xxxsmall text-text-secondary">
            Tự hoàn thành sau 30 phút nếu không bấm
          </p>
        </div>
      )}

      {isExpanded && <ItemsList isLoadingItems={isLoadingItems} items={items} />}
    </div>
  );
}
