import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore } from "@/stores/app.store";
import { useStoreMenu } from "@/services/category/category.queries";
import { useCallStaff } from "@/services/order/order.mutations";
import { CategoryWithProducts } from "@/types/category.types";
import { Product, Variant } from "@/types/product.types";
import OptionSheet from "@/components/menu/option-sheet";
import UnpaidOrderPrompt from "@/components/common/unpaid-order-prompt";
import { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";
import { scrollToId } from "@/utils/scroll-to";
import { useSnackbar } from "zmp-ui";
import { isStoreOpen, formatServingHours } from "@/utils/store-hours";
import { canOrderInEntry } from "@/utils/entry-context";
import mevoLogo from "@/static/mevo-logo.png";
import ProductCard from "@/components/ui/product-card";
import CategoryChips from "@/components/ui/category-chips";
import SectionHeading from "@/components/ui/section-heading";
import { pickProductLayout } from "@/utils/product-layout";
import { matchesQuery } from "@/utils/search-fold";
import { LockIcon, ArmchairIcon, BellIcon, MoonIcon, CircleAlertIcon, RotateCwIcon, SearchIcon } from "@/components/common/icons";

// Bàn đang có khách KHÁC gọi món (quán trả sau). Vẫn cho xem menu, chỉ chặn thêm món.
function TableLockedBanner({ openedAt, onCallStaff, calling }: {
  openedAt: string;
  onCallStaff: () => void;
  calling: boolean;
}) {
  const gio = new Date(openedAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="border-b border-warning-border bg-warning-bg px-4 py-2.5">
      <div className="flex items-start gap-2">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-small-m font-semibold text-warning">
            Bàn này đang có khách gọi món (từ {gio})
          </p>
          <p className="text-xxsmall text-text-primary">
            Nếu bạn vừa ngồi vào, nhờ nhân viên mở bàn giúp. Bạn vẫn xem được menu.
          </p>
        </div>
      </div>
      <button
        onClick={onCallStaff}
        disabled={calling}
        className="mt-2 w-full rounded-lg bg-surface py-2 text-small-m font-semibold text-primary active:opacity-70 disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-1.5"><BellIcon className="size-4" />Gọi nhân viên</span>
      </button>
    </div>
  );
}

function TableReservedBanner({ onCallStaff, calling }: { onCallStaff: () => void; calling: boolean }) {
  return (
    <div className="border-b border-warning-border bg-warning-bg px-4 py-2.5">
      <div className="flex items-start gap-2">
        <ArmchairIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <p className="text-small-m font-semibold text-warning">Bàn đã được đặt trước</p>
          <p className="text-xxsmall text-text-primary">Vui lòng báo chủ quán để mở bàn.</p>
        </div>
      </div>
      <button onClick={onCallStaff} disabled={calling} className="mt-2 w-full rounded-lg bg-surface py-2 text-small-m font-semibold text-primary active:opacity-70 disabled:opacity-50">
        <span className="inline-flex items-center justify-center gap-1.5"><BellIcon className="size-4" />Gọi nhân viên</span>
      </button>
    </div>
  );
}

// Máy này đang giữ bàn — cho khách thấy cả bàn đang nợ bao nhiêu, khỏi bất ngờ lúc tính tiền.
// Ở MÂM (nhiều bàn ghép, mig 040) thì hiện đủ tên các bàn để khách hiểu vì sao tổng lớn hơn
// những gì mình gọi: đó là tiền của cả mâm.
function SessionBar({ label, orderCount, total, isTray }: {
  label: string;
  orderCount: number;
  total: number;
  isTray: boolean;
}) {
  if (orderCount === 0) return null;
  return (
    <div className="flex items-center justify-between border-b border-neutral100 bg-primary/5 px-4 py-2.5">
      <p className="min-w-0 flex-1 truncate text-small text-text-secondary">
        {label || "Bàn của bạn"} · {orderCount} lần gọi
      </p>
      <p className="ml-2 flex-shrink-0 text-small-m font-bold text-primary">
        {formatCurrency(total)}đ
      </p>
    </div>
  );
}

function ClosedBanner({
  isAcceptingOrders,
  servingHours,
}: {
  isAcceptingOrders: boolean;
  servingHours: string;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-warning-border bg-warning-bg px-4 py-2.5">
      <MoonIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <p className="text-small-m font-semibold text-primary">
          {isAcceptingOrders ? "Ngoài giờ phục vụ" : "Quán đang tạm nghỉ"}
        </p>
        <p className="text-xxsmall text-primary">
          {isAcceptingOrders
            ? servingHours
              ? `Giờ phục vụ: ${servingHours}. Bạn vẫn xem được menu.`
              : "Quán chưa nhận đơn lúc này. Bạn vẫn xem được menu."
            : "Quán sẽ mở lại sớm. Bạn vẫn xem được menu."}
        </p>
      </div>
    </div>
  );
}

function TakeawayBannerCard({ url }: { url: string }) {
  return (
    <div className="mx-3.5 mt-2 overflow-hidden rounded-xl">
      <img
        src={url}
        alt="Banner quán"
        className="w-full object-cover"
        style={{ aspectRatio: "4/1" }}
        draggable={false}
      />
    </div>
  );
}

function OrderingUnavailableBanner({
  entryKind,
  loading,
  error,
  showReservation,
  onReserve,
}: {
  entryKind: "root" | "table";
  loading: boolean;
  error: string | null;
  showReservation: boolean;
  onReserve: () => void;
}) {
  const root = entryKind === "root";
  return (
    <div className="border-b border-primary/30 bg-primary/10 px-4 py-2.5">
      <p className="text-small-m font-semibold text-primary">
        {loading ? "Đang tải cấu hình quán" : root ? "Xem menu của quán" : "Quán chưa nhận gọi món qua QR"}
      </p>
      <p className="mt-0.5 text-xxsmall text-primary">
        {loading || error
          ? error ?? "Bạn vẫn có thể xem menu trong lúc hệ thống kiểm tra cấu hình."
          : root
            ? "Quét QR tại bàn để gọi món."
            : "Bạn vẫn có thể xem menu. Vui lòng hỏi chủ quán hoặc nhân viên để được hỗ trợ."}
      </p>
      {root && showReservation && !loading && !error && (
        <button
          type="button"
          onClick={onReserve}
          className="mt-2 rounded-lg bg-surface px-3 py-2 text-small-m font-semibold text-primary"
        >
          Đặt bàn trước
        </button>
      )}
    </div>
  );
}

export default function MenuPage() {
  const navigate = useNavigate();
  const { storeId, tableId, tableNumber, orderMode, takeawayBannerUrl, isAcceptingOrders, servingHours, sessionState, entryContext, workflow, workflowError } = useAppStore();
  const { data: menu, isLoading, error, refetch, isRefetching } = useStoreMenu(storeId);
  const { items: cartItems, addToCart, updateQuantity } = useCartStore();
  const { openSnackbar } = useSnackbar();
  const storeOpen = isStoreOpen({ isAcceptingOrders, servingHours });
  const { mutate: callStaff, isPending: isCallingStaff } = useCallStaff();

  // Bàn đang bị khách khác giữ (quán trả sau). Không hỏi được trạng thái (sessionState null)
  // thì KHÔNG khoá oan — create_order vẫn là chốt chặn thật.
  const tableLocked =
    sessionState?.mode === "postpay" && sessionState.state === "locked";
  const tableReserved =
    sessionState?.mode === "postpay" && sessionState.state === "reserved";
  const sessionOwner =
    sessionState?.mode === "postpay" && sessionState.state === "owner"
      ? sessionState
      : null;
  const hasVerifiedTable = entryContext.kind === "root" || tableId === entryContext.tableId;
  const workflowAllowsOrdering = workflow
    ? canOrderInEntry(workflow, entryContext) && hasVerifiedTable
    : false;
  const canOrder = storeOpen && !tableLocked && !tableReserved && workflowAllowsOrdering;

  const handleCallStaff = () => {
    if (!storeId || !tableId) return;
    callStaff(
      { tableId },
      {
        onSuccess: () =>
          openSnackbar({ text: "Đã gọi nhân viên! Vui lòng chờ.", type: "success" }),
        onError: () => openSnackbar({ text: "Gọi thất bại, thử lại sau.", type: "error" }),
      },
    );
  };
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu && menu.length > 0 && !activeCategoryId) {
      setActiveCategoryId(menu[0].id);
    }
  }, [menu, activeCategoryId]);

  const getItemCount = (productId: string) =>
    cartItems
      .filter((i) => i.productId === productId)
      .reduce((s, i) => s + i.quantity, 0);

  const handleAdd = (product: Product) => {
    if (!workflowAllowsOrdering) {
      openSnackbar({
        text: workflowError ?? "Quán chưa nhận gọi món từ lối vào này.",
        type: "warning",
      });
      return;
    }
    if (tableLocked) {
      openSnackbar({
        text: "Bàn này đang có khách khác gọi món. Nhờ nhân viên mở bàn giúp bạn.",
        type: "warning",
      });
      return;
    }
    if (tableReserved) {
      openSnackbar({ text: "Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.", type: "warning" });
      return;
    }
    if (!storeOpen) {
      openSnackbar({
        text: isAcceptingOrders
          ? "Quán đang ngoài giờ phục vụ, chưa nhận đơn."
          : "Quán đang tạm nghỉ, chưa nhận đơn.",
        type: "warning",
      });
      return;
    }
    if (product.variants.length > 0 || product.toppings.length > 0) {
      setOptionProduct(product);
      return;
    }
    const existing = cartItems.find((i) => i.id === product.id);
    if (existing) {
      updateQuantity(product.id, existing.quantity + 1);
    } else {
      addToCart({
        productId: product.id,
        productName: product.name,
        productImage: product.image ?? "",
        basePrice: product.price,
        selectedVariants: [],
        quantity: 1,
      });
    }
  };

  const handleConfirmOptions = (variant: Variant | null, toppings: SelectedVariant[]) => {
    if (!optionProduct) return;
    addToCart({
      productId: optionProduct.id,
      productName: optionProduct.name,
      productImage: optionProduct.image ?? "",
      // Có biến thể → giá dòng giỏ là giá biến thể
      basePrice: variant ? variant.price : optionProduct.price,
      variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
      selectedVariants: toppings,
      quantity: 1,
    });
    setOptionProduct(null);
  };

  const handleDecrease = (product: Product) => {
    const existing = cartItems.find((i) => i.id === product.id);
    if (existing) {
      updateQuantity(product.id, Math.max(0, existing.quantity - 1));
    }
  };

  if (isLoading) return <MenuSkeleton />;

  // Chưa có store context (cold start / chưa quét QR) — splash thương hiệu MEVO
  if (!storeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <img src={mevoLogo} alt="MEVO" className="h-24 w-24" draggable={false} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">
            MEVO<span className="text-text-primary">.VN</span>
          </h1>
          <p className="mt-2 text-small text-text-secondary">
            Giải pháp đặt bàn &amp; thanh toán cho nhà hàng, quán ăn, quán cà phê, trà sữa...
          </p>
        </div>
        <p className="mt-1 text-xxsmall text-text-secondary">
          Vui lòng dùng Zalo quét mã QR trên bàn để đặt món.
        </p>
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <CircleAlertIcon className="size-10 text-critical" />
        <p className="font-medium text-text-primary">Không thể tải menu</p>
        <p className="text-small text-text-secondary">
          Vui lòng thử lại hoặc hỏi nhân viên hỗ trợ.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-small-m font-semibold text-text-primary active:bg-neutral50 disabled:opacity-60"
        >
          <RotateCwIcon className={isRefetching ? "size-4 animate-spin" : "size-4"} />
          Thử lại
        </button>
      </div>
    );
  }

  // Lọc theo ô tìm (không dấu); danh mục không còn món nào thì ẩn luôn chip + nhóm.
  const visibleMenu = query.trim()
    ? menu
        .map((c) => ({ ...c, products: c.products.filter((p) => matchesQuery(p.name, query)) }))
        .filter((c) => c.products.length > 0)
    : menu;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Banner quán đóng cửa / ngoài giờ — chặn đặt món */}
      {!storeOpen && (
        <ClosedBanner
          isAcceptingOrders={isAcceptingOrders}
          servingHours={formatServingHours(servingHours)}
        />
      )}

      {!workflowAllowsOrdering && (
        <OrderingUnavailableBanner
          entryKind={entryContext.kind}
          loading={(!workflow || !hasVerifiedTable) && !workflowError}
          error={workflowError}
          showReservation={entryContext.kind === "root" && workflow?.reservationsEnabled === true}
          onReserve={() => navigate("/reservations/new")}
        />
      )}

      {/* Bàn đang có khách khác gọi món (quán trả sau) — chặn thêm món, vẫn xem được menu */}
      {tableLocked && (
        <TableLockedBanner
          openedAt={sessionState.opened_at}
          onCallStaff={handleCallStaff}
          calling={isCallingStaff}
        />
      )}
      {tableReserved && <TableReservedBanner onCallStaff={handleCallStaff} calling={isCallingStaff} />}

      {/* Máy này đang giữ bàn — hiện tổng cả bàn đang nợ */}
      {sessionOwner && (
        <SessionBar
          label={sessionOwner.table_names || tableNumber}
          orderCount={sessionOwner.order_count}
          total={sessionOwner.total}
          isTray={!!sessionOwner.is_open_ordering}
        />
      )}

      {/* Ô tìm + chip danh mục — đứng yên trên đầu, chỉ danh sách món bên dưới cuộn (Stitch m06) */}
      <div className="shrink-0 bg-background">
        <label className="mx-3 mt-2.5 flex h-10 items-center gap-2 rounded-full border border-neutral200 bg-surface px-3.5">
          <SearchIcon className="size-4 shrink-0 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm món…"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-small text-text-primary outline-none placeholder:text-text-secondary"
          />
        </label>
        <CategoryChips
          items={visibleMenu.map((c) => ({ id: c.id, name: c.name }))}
          activeId={activeCategoryId}
          onSelect={(id) => {
            setActiveCategoryId(id);
            scrollToId(id);
          }}
        />
      </div>

      {/* Danh sách món */}
      <div
        ref={contentRef}
        className="no-scrollbar flex-1 overflow-y-auto"
        onScroll={() => {
          if (!contentRef.current) return;
          for (const cat of [...visibleMenu].reverse()) {
            const el = document.getElementById(cat.id);
            if (el && el.getBoundingClientRect().top <= 200) {
              setActiveCategoryId(cat.id);
              break;
            }
          }
        }}
      >
        {/* Banner 4:1 trong takeaway mode */}
        {orderMode === "takeaway" && takeawayBannerUrl && (
          <TakeawayBannerCard url={takeawayBannerUrl} />
        )}

        {visibleMenu.length === 0 ? (
          <p className="px-6 py-10 text-center text-small text-text-secondary">
            Không tìm thấy món &ldquo;{query.trim()}&rdquo;
          </p>
        ) : (
          visibleMenu.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              canOrder={canOrder}
              getCount={getItemCount}
              onAdd={handleAdd}
              onDecrease={handleDecrease}
            />
          ))
        )}
        <div className="h-6" />
      </div>

      <OptionSheet
        product={optionProduct}
        visible={optionProduct !== null}
        onClose={() => setOptionProduct(null)}
        onConfirm={handleConfirmOptions}
      />

      {/* Nhắc đơn chưa thanh toán khi khách mở lại app — tự ẩn nếu không có đơn nào */}
      <UnpaidOrderPrompt />
    </div>
  );
}

function CategorySection({
  category,
  canOrder,
  getCount,
  onAdd,
  onDecrease,
}: {
  category: CategoryWithProducts;
  canOrder: boolean;
  getCount: (productId: string) => number;
  onAdd: (product: Product) => void;
  onDecrease: (product: Product) => void;
}) {
  // Danh mục nhiều ảnh → lưới 2 cột; ít/không ảnh → danh sách gọn (spec Q4).
  const layout = pickProductLayout(category.products);
  const card = (product: Product) => (
    <ProductCard
      key={product.id}
      product={product}
      layout={layout}
      canOrder={canOrder}
      count={getCount(product.id)}
      onAdd={() => onAdd(product)}
      onDecrease={() => onDecrease(product)}
    />
  );
  return (
    <section>
      <SectionHeading id={category.id} title={category.name} count={category.products.length} />
      {category.products.length === 0 ? (
        <p className="px-4 py-6 text-center text-small text-text-secondary">Chưa có món trong danh mục này</p>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-3 px-3">{category.products.map(card)}</div>
      ) : (
        <div className="mx-3 divide-y divide-neutral100 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          {category.products.map(card)}
        </div>
      )}
    </section>
  );
}

function MenuSkeleton() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="mx-3 mt-2.5 h-10 animate-pulse rounded-full bg-neutral100" />
      <div className="flex gap-2 px-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-neutral100" />
        ))}
      </div>
      <div className="mx-3 mt-3 overflow-hidden rounded-2xl bg-surface">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-neutral100 px-4 py-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral100" />
            <div className="h-3 w-full animate-pulse rounded bg-neutral100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-neutral100" />
          </div>
        ))}
      </div>
    </div>
  );
}
