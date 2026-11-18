import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "zmp-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app.store";
import { useSessionOrders, useTableSessionBill, useTakeawayOrders } from "@/services/order/order.queries";
import { useConfirmReceived } from "@/services/order/order.mutations";
import { orderService } from "@/services/order/order.api";
import { realtime } from "@/services/supabase-realtime";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";
import { lineLabel, reconcileRounds, rejectionReasonLabel, roundDiscount, roundNumbers, roundSourceLabel, roundStatus, type RoundContext, type RoundTone } from "@/utils/round-status";
import { canOrderInEntry } from "@/utils/entry-context";
import { billTotals } from "@/utils/bill-total";
import { getBookingAccesses } from "@/services/reservation/reservation-storage";
import SectionCard from "@/components/ui/section-card";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import StickyActionBar from "@/components/ui/sticky-action-bar";
import { GET_SESSION_ORDERS_KEY, GET_TABLE_SESSION_BILL_KEY } from "@/constants/api";
import type { SessionOrder, TakeawayOrder, OrderItem, TableSessionBillItem } from "@/types/order.types";
import { ScanLineIcon, PackageIcon, ClipboardListIcon, CircleAlertIcon, PlusIcon, RotateCwIcon, ClockIcon, ChefHatIcon, CircleCheckIcon, CircleXIcon } from "@/components/common/icons";

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
  rejectedAt: string | null;
  rejectionReason: string | null;
};

const TONE_BAR: Record<RoundTone, string> = {
  warning: "border-l-warning-dot",
  info: "border-l-info-dot",
  success: "border-l-success-dot",
  critical: "border-l-critical-dot",
  neutral: "border-l-neutral200",
};

// Theme garden: trạng thái lượt = icon + chữ (không viền màu, không viên nền). Màu chữ đo trên nền kem
// #EDE9DE: cam 5,2:1 · xanh dương 5,5:1 · ô-liu 6,0:1 · đỏ 5,3:1.
const GARDEN_TONE: Record<RoundTone, { text: string; Icon: typeof ClockIcon }> = {
  warning: { text: "text-[#8A5300]", Icon: ClockIcon },
  info: { text: "text-[#1D4ED8]", Icon: ChefHatIcon },
  success: { text: "text-[#3E5F22]", Icon: CircleCheckIcon },
  critical: { text: "text-[#B91C1C]", Icon: CircleXIcon },
  neutral: { text: "text-text-secondary", Icon: ClockIcon },
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

function DineInOrdersView() {
  const navigate = useNavigate();
  const { zaloUserId, deviceId, tableId, tableNumber, paymentTiming, workflow, sessionState, entryContext, theme } = useAppStore();
  const garden = theme === "garden";
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
        rejectedAt: o.rejected_at ?? null,
        rejectionReason: rejectionReasonLabel(o.rejection_reason_code, o.rejection_reason_note),
      }))
    : (personalOrders ?? []).map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        total: o.totalAmount,
        source: "customer_zalo",
        items: null,
        rejectedAt: null,
        rejectionReason: null,
      }));
  const isLoading = activeQuery.isLoading;
  const loadFailed = activeQuery.isError && !activeQuery.data;
  // Important #5 — chỉ mời "Gọi thêm món" khi lối vào này thật sự gọi được món
  const canOrderHere =
    !!workflow && entryContext.kind === "table" && entryContext.tableId === tableId && canOrderInEntry(workflow, entryContext);

  // Realtime: tự cập nhật khi thu ngân xác nhận / nhân viên thêm món
  useEffect(() => {
    if (!tableId) return;
    const channel = realtime()
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
    return () => { void realtime().removeChannel(channel); };
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
  const numbers = roundNumbers(rounds);
  const sums = reconcileRounds(rounds.map((r) => ({ status: r.status, total_amount: r.total, source: r.source })), ctx);
  // Trả sau: tổng lấy thẳng từ phiên (server tính) để không lệch với số thu ngân thu.
  const grandTotal = isPostpay && bill && bill.found ? bill.total : sums.total;
  // Giảm giá bill của thu ngân (mig 108): chỉ có ở trả sau, tính trên đúng tạm tính này.
  const totals = billTotals(grandTotal, isPostpay && bill && bill.found ? bill.bill_discount : undefined);

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
            {/* Theme garden (bản vẽ HIG 2026-11-18): số tạm tính lên đầu, không thẻ, không chữ in hoa. */}
            {isPostpay && garden && (
              <div className="px-5 pb-1 pt-3">
                <p className="text-normal text-text-secondary">Tạm tính</p>
                <p className="tabular text-[40px] font-bold leading-[1.1] tracking-tight text-text-primary">{formatCurrency(totals.subtotal)}đ</p>
                {totals.discount > 0 && (
                  <div className="mt-2 space-y-1 text-normal">
                    <p className="flex justify-between text-text-secondary"><span>Giảm giá</span><span className="tabular font-semibold text-[#3E5F22]">−{formatCurrency(totals.discount)}đ</span></p>
                    <p className="flex justify-between font-semibold text-text-primary"><span>Tạm tính sau giảm</span><span className="tabular">{formatCurrency(totals.payable)}đ</span></p>
                  </div>
                )}
                <p className="mt-1 text-normal text-text-secondary">
                  {tableLabel}{bill && bill.found ? ` · vào lúc ${hhmm(bill.opened_at)}` : ""} · {rounds.length} lượt gọi
                </p>
                <p className="text-xsmall text-text-secondary">Thanh toán tại quầy thu ngân khi kết thúc bữa.</p>
              </div>
            )}

            {/* Thẻ đầu: bàn / mâm + tổng tạm tính (trả sau). Trả trước mỗi đơn đã tự thanh toán. */}
            {isPostpay && !garden && (
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
              <p className="mt-0.5 text-2xl font-extrabold text-primary">{formatCurrency(totals.subtotal)}đ</p>
              {totals.discount > 0 && (
                <>
                  <p className="mt-2 flex items-center justify-between text-small text-text-secondary">
                    <span>Giảm giá</span>
                    <span className="font-semibold text-success">-{formatCurrency(totals.discount)}đ</span>
                  </p>
                  <p className="mt-2 text-xxsmall font-semibold uppercase tracking-wide text-text-secondary">Tạm tính sau giảm</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-primary">{formatCurrency(totals.payable)}đ</p>
                </>
              )}
              {/* Tổng tạm tính CHỈ hiện ở đây (anh Tú 2026-10-09): khối "Đối soát tạm tính" cuối trang đã bỏ —
                  một con số lặp 3 lần là thừa. */}
              <p className="mt-2 flex items-start gap-1.5 text-xxsmall text-text-secondary">
                <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                Quý khách thanh toán tại quầy thu ngân khi kết thúc bữa.
              </p>
            </SectionCard>
            )}

            {!garden && (
            <div className="flex items-baseline justify-between px-4 pb-1 pt-5">
              <h2 className="text-small-m font-bold uppercase tracking-wide text-text-primary">
                Các lượt gọi món ({rounds.length} lượt)
              </h2>
              <span className="text-xxsmall text-text-secondary">Mới nhất ở trên</span>
            </div>
            )}

            <div className={garden ? "pt-1" : "space-y-3"}>
              {rounds.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  number={numbers.get(round.id) ?? null}
                  ctx={ctx}
                  garden={garden}
                  // Trả trước: món tải khi mở thẻ (get_session_orders không kèm món)
                  lazy={
                    round.items === null
                      ? { expanded: expandedId === round.id, loading: loadingItemsId === round.id, items: cachedItems[round.id] ?? null, onToggle: () => void toggle(round.id) }
                      : null
                  }
                />
              ))}
            </div>

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
  garden = false,
}: {
  round: Round;
  number: number | null;
  ctx: RoundContext;
  lazy: { expanded: boolean; loading: boolean; items: OrderItem[] | null; onToggle: () => void } | null;
  garden?: boolean;
}) {
  const status = roundStatus(round.status, ctx, round.source);
  const lines = (round.items ?? []).map((item) => {
    const toppings = item.toppings ?? [];
    const unit = item.price + toppings.reduce((s, t) => s + (t.price ?? 0), 0);
    return { item, toppings, line: lineLabel({ quantity: item.quantity, price: unit, void_type: item.void_type }) };
  });
  const rejected = round.status === "cancelled";
  const discount = round.items && !rejected ? roundDiscount(lines.reduce((s, l) => s + l.line.amount, 0), round.total) : 0;
  // Cùng tiêu đề với tab Lịch sử trên POS (orderLabel) để khách và thu ngân đối chứng một chữ.
  const title =
    number !== null ? `Lượt #${String(number).padStart(2, "0")}` : round.source === "pos" ? "Ghi tay" : "Món đặt trước";
  const source = number !== null ? roundSourceLabel(round.source) : null;
  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-small-m font-bold text-text-primary">
          {title} <span className="font-normal text-text-secondary">· {hhmm(round.createdAt)}</span>
        </p>
        {source && <p className="mt-0.5 text-xxsmall text-text-secondary">{source}</p>}
      </div>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
    </div>
  );

  // Theme garden: tiêu đề lượt nằm ngoài, món là một nhóm hàng nền kem sáng; số lượng "2×" đứng đầu
  // dòng cho thẳng cột, giá căn phải. Cùng dữ liệu, cùng luật tiền với thẻ classic bên dưới.
  if (garden) {
    const tone = GARDEN_TONE[status.tone];
    const gardenHeader = (
      <div className="flex items-start justify-between gap-3 px-1 pb-2 pt-4">
        <div className="min-w-0">
          <p className="text-normal-sb font-bold text-text-primary">
            {title} <span className="tabular">· {hhmm(round.createdAt)}</span>
          </p>
          {source && <p className="text-xsmall text-text-secondary">{source}</p>}
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-normal-sb font-semibold", tone.text)}>
          <tone.Icon className="size-[18px]" />
          {status.label}
        </span>
      </div>
    );
    return (
      <section className="px-4">
        {lazy ? (
          <button type="button" onClick={lazy.onToggle} className="block w-full text-left">{gardenHeader}</button>
        ) : gardenHeader}
        {lines.length > 0 && (
          <ul className={cn("divide-y divide-neutral100 rounded-2xl bg-surface", rejected && "opacity-70")}>
            {lines.map(({ item, toppings, line }) => (
              <li key={item.id} className="flex items-baseline gap-3 px-4 py-3">
                <span className="tabular w-8 shrink-0 text-normal-sb font-semibold text-text-secondary">{item.quantity}×</span>
                <div className="min-w-0 flex-1">
                  <p className={cn("line-clamp-2 text-large text-text-primary", rejected && "line-through")}>{item.name}</p>
                  {toppings.length > 0 && (
                    <p className="line-clamp-1 text-xsmall text-text-secondary">{toppings.map((t) => `+ ${t.name}`).join(", ")}</p>
                  )}
                </div>
                <span className={cn("tabular shrink-0 whitespace-nowrap text-large font-semibold", line.gift ? "text-[#3E5F22]" : rejected ? "text-text-secondary line-through" : "text-text-primary")}>
                  {line.gift ? "Đã tặng 0đ" : `${formatCurrency(line.amount)}đ`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {lazy?.expanded && <div className="rounded-2xl bg-surface px-4 py-1"><ItemsList isLoadingItems={lazy.loading} items={lazy.items} /></div>}
        {discount > 0 && (
          <div className="mt-1.5 flex justify-between px-1 text-small">
            <span className="text-text-secondary">Giảm giá</span>
            <span className="tabular font-semibold text-[#3E5F22]">−{formatCurrency(discount)}đ</span>
          </div>
        )}
        {rejected && (
          <p className="mt-2 rounded-xl bg-critical-bg px-3 py-2 text-xsmall text-critical">
            Quán không nhận lượt này{round.rejectionReason ? ` · Lý do: ${round.rejectionReason}` : ""}
            {round.rejectedAt ? ` · lúc ${hhmm(round.rejectedAt)}` : ""}. Không tính tiền.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={cn("mx-3 rounded-2xl border-l-4 bg-surface p-4 shadow-card", TONE_BAR[status.tone], rejected && "bg-critical-bg/40")}>
      {lazy ? (
        <button type="button" onClick={lazy.onToggle} className="block w-full text-left">
          {header}
        </button>
      ) : (
        header
      )}

      {lines.length > 0 && (
        <ul className={cn("mt-2.5 space-y-1.5", rejected && "opacity-70")}>
          {lines.map(({ item, toppings, line }) => (
            // Tên co giãn (tối đa 2 dòng); "×SL · giá" luôn nằm trọn một dòng bên phải.
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={cn("line-clamp-2 text-xsmall text-text-primary", rejected && "line-through")}>{item.name}</p>
                {toppings.length > 0 && (
                  <p className="line-clamp-1 text-xxsmall text-text-secondary">{toppings.map((t) => `+ ${t.name}`).join(", ")}</p>
                )}
              </div>
              <p className="shrink-0 whitespace-nowrap text-xsmall">
                <span className="text-text-secondary">×{item.quantity}</span>
                <span className="mx-1 text-text-disabled">·</span>
                <span className={cn("font-semibold", line.gift ? "text-success" : rejected ? "text-text-secondary line-through" : "text-text-primary")}>
                  {line.gift ? "Đã tặng 0đ" : `${formatCurrency(line.amount)}đ`}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {lazy?.expanded && <ItemsList isLoadingItems={lazy.loading} items={lazy.items} />}

      {discount > 0 && (
        <div className="mt-1.5 flex justify-between text-xsmall">
          <span className="text-text-secondary">Giảm giá</span>
          <span className="font-semibold text-success">−{formatCurrency(discount)}đ</span>
        </div>
      )}
      {rejected && (
        // Giữ lượt bị từ chối để đối chứng khi có xung đột ("tôi gọi rồi mà không thấy món").
        <p className="mt-2.5 rounded-lg bg-critical-bg px-3 py-2 text-xxsmall text-critical">
          Quán không nhận lượt này{round.rejectionReason ? ` · Lý do: ${round.rejectionReason}` : ""}
          {round.rejectedAt ? ` · lúc ${hhmm(round.rejectedAt)}` : ""}. Không tính tiền.
        </p>
      )}
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
  const navigate = useNavigate();
  const hasBookings = getBookingAccesses(storeId).length > 0;
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
        {/* Quán vừa mang về vừa đặt bàn: tab "Đơn của tôi" là đơn mang về → chừa lối sang đặt bàn */}
        {hasBookings && (
          <button type="button" onClick={() => navigate("/reservations")} className="mx-3 mt-3 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-left">
            <span className="text-small-m font-semibold text-text-primary">Xem đặt bàn của tôi</span>
            <span className="text-small font-bold text-primary">›</span>
          </button>
        )}
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
    <div className="rounded-2xl bg-surface shadow-card">
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
