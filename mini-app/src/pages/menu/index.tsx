import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore } from "@/stores/app.store";
import { useStoreMenu } from "@/services/category/category.queries";
import { CategoryWithProducts } from "@/types/category.types";
import { Product } from "@/types/product.types";
import { formatCurrency } from "@/utils/format";
import { PlusIcon, MinusIcon } from "@/components/common/vectors";
import { scrollToId } from "@/utils/scroll-to";
import { cn } from "@/utils/cn";

function TakeawayBanner({ storeName }: { storeName: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#E8C9B3] bg-[#FBF4EF] px-4 py-2">
      <span className="text-sm">🛵</span>
      <span className="text-xs font-medium text-primary">
        Mang về / Ship · {storeName}
      </span>
    </div>
  );
}

function PendingTakeawayBanner() {
  const navigate = useNavigate();
  const orderId = localStorage.getItem("mevo_last_takeaway_order");
  if (!orderId) return null;
  return (
    <button
      onClick={() => navigate(`/order-status/${orderId}`)}
      className="flex w-full items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-left"
    >
      <span className="text-sm">📦</span>
      <span className="flex-1 text-xs text-yellow-800">
        Bạn có đơn đang xử lý — Xem trạng thái
      </span>
      <span className="text-xs text-yellow-600">→</span>
    </button>
  );
}

function TakeawayBannerCard({ url }: { url: string }) {
  return (
    <div className="mx-3.5 mt-2 overflow-hidden rounded-xl">
      <img
        src={url}
        alt="Banner quán"
        className="w-full object-cover"
        style={{ aspectRatio: "2/1" }}
        draggable={false}
      />
    </div>
  );
}

export default function MenuPage() {
  const { storeId, storeName, storeLogoUrl, tableNumber, orderMode, takeawayBannerUrl } = useAppStore();
  const { data: menu, isLoading, error } = useStoreMenu(storeId);
  const { items: cartItems, addToCart, updateQuantity } = useCartStore();
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu && menu.length > 0 && !activeCategoryId) {
      setActiveCategoryId(menu[0].id);
    }
  }, [menu, activeCategoryId]);

  const getItemCount = (productId: string) =>
    cartItems.find((i) => i.id === productId)?.quantity ?? 0;

  const handleAdd = (product: Product) => {
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

  const handleDecrease = (product: Product) => {
    const existing = cartItems.find((i) => i.id === product.id);
    if (existing) {
      updateQuantity(product.id, Math.max(0, existing.quantity - 1));
    }
  };

  if (isLoading) return <MenuSkeleton />;

  // Chưa quét QR đúng bàn — không có storeId
  if (!storeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-5xl">📷</div>
        <p className="font-semibold text-text-primary">Quét QR tại bàn</p>
        <p className="text-small text-text-secondary">
          Vui lòng dùng Zalo quét mã QR trên bàn để xem menu và đặt món.
        </p>
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">😕</div>
        <p className="font-medium text-text-primary">Không thể tải menu</p>
        <p className="text-small text-text-secondary">
          Vui lòng thử lại hoặc hỏi nhân viên hỗ trợ.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      {orderMode === "takeaway" && <TakeawayBanner storeName={storeName} />}
      {orderMode === "takeaway" && <PendingTakeawayBanner />}
      {/* Header quán + bàn — chừa safe-area trên (Dynamic Island/notch iPhone) */}
      <div
        className="flex-shrink-0 bg-white px-4 pb-3 shadow-sm"
        style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="flex items-center gap-2.5">
          {storeLogoUrl && (
            <img
              src={storeLogoUrl}
              alt={storeName}
              className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              draggable={false}
            />
          )}
          <div className="min-w-0">
            <p className="text-xlarge-sb font-bold text-text-primary">
              {storeName || "MEVO"}
            </p>
            {tableNumber && (
              <p className="text-small text-text-secondary">{tableNumber}</p>
            )}
          </div>
        </div>
      </div>

      {/* Banner 2:1 trong takeaway mode */}
      {orderMode === "takeaway" && takeawayBannerUrl && (
        <TakeawayBannerCard url={takeawayBannerUrl} />
      )}

      {/* Category tabs — cuộn ngang */}
      <div className="flex-shrink-0 bg-white border-b border-neutral100">
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
          {menu.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategoryId(cat.id);
                scrollToId(cat.id);
              }}
              className={cn(
                "flex-shrink-0 rounded-full px-4 py-1.5 text-small font-medium transition-colors",
                activeCategoryId === cat.id
                  ? "bg-primary text-white"
                  : "bg-neutral100 text-text-secondary",
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách sản phẩm */}
      <div
        ref={contentRef}
        className="no-scrollbar flex-1 overflow-y-auto"
        onScroll={() => {
          if (!menu || !contentRef.current) return;
          for (const cat of [...menu].reverse()) {
            const el = document.getElementById(cat.id);
            if (el && el.getBoundingClientRect().top <= 120) {
              setActiveCategoryId(cat.id);
              break;
            }
          }
        }}
      >
        {menu.map((cat) => (
          <CategorySection
            key={cat.id}
            category={cat}
            getCount={getItemCount}
            onAdd={handleAdd}
            onDecrease={handleDecrease}
          />
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}

function CategorySection({
  category,
  getCount,
  onAdd,
  onDecrease,
}: {
  category: CategoryWithProducts;
  getCount: (productId: string) => number;
  onAdd: (product: Product) => void;
  onDecrease: (product: Product) => void;
}) {
  return (
    <div id={category.id} className="mt-3 bg-white">
      <div className="border-b border-neutral100 px-4 pb-2 pt-4">
        <p className="text-large-m font-semibold text-text-primary">
          {category.name}
        </p>
      </div>
      <div className="divide-y divide-neutral100">
        {category.products.map((product) => (
          <MenuItemRow
            key={product.id}
            product={product}
            count={getCount(product.id)}
            onAdd={() => onAdd(product)}
            onDecrease={() => onDecrease(product)}
          />
        ))}
        {category.products.length === 0 && (
          <p className="px-4 py-6 text-center text-small text-text-secondary">
            Chưa có món trong danh mục này
          </p>
        )}
      </div>
    </div>
  );
}

function MenuItemRow({
  product,
  count,
  onAdd,
  onDecrease,
}: {
  product: Product;
  count: number;
  onAdd: () => void;
  onDecrease: () => void;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 transition-opacity",
        !product.isAvailable && "opacity-50",
      )}
    >
      {/* Ảnh */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-neutral100">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">
            🍽️
          </div>
        )}
        {!product.isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-xxxsmall font-medium text-text-primary">
              Tạm hết
            </span>
          </div>
        )}
      </div>

      {/* Thông tin + nút */}
      <div className="flex flex-1 flex-col justify-between gap-1">
        <p className="text-normal-sb font-medium text-text-primary line-clamp-2">
          {product.name}
        </p>
        {product.description && (
          <p className="text-xxsmall text-text-secondary line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="font-semibold text-primary">
            {formatCurrency(product.price)}đ
          </span>

          {product.isAvailable && (
            <div className="flex items-center gap-2">
              {count > 0 && (
                <>
                  <button
                    onClick={onDecrease}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-primary text-primary transition-all active:scale-90"
                    aria-label="Giảm"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[20px] text-center text-small-m font-bold text-text-primary">
                    {count}
                  </span>
                </>
              )}
              <button
                onClick={onAdd}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white transition-all active:scale-90"
                aria-label="Thêm vào giỏ"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="bg-white px-4 pb-3 pt-4">
        <div className="h-6 w-40 animate-pulse rounded bg-neutral100" />
        <div className="mt-1 h-4 w-20 animate-pulse rounded bg-neutral100" />
      </div>
      <div className="flex gap-2 bg-white px-3 py-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-neutral100"
          />
        ))}
      </div>
      <div className="mt-3 bg-white">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex gap-3 border-b border-neutral100 px-4 py-3"
          >
            <div className="h-20 w-20 animate-pulse rounded-xl bg-neutral100" />
            <div className="flex flex-1 flex-col gap-2 py-1">
              <div className="h-4 w-3/4 animate-pulse rounded bg-neutral100" />
              <div className="h-3 w-full animate-pulse rounded bg-neutral100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-neutral100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
