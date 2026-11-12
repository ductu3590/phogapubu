import { BeerIcon, MinusIcon, PlusIcon } from "@/components/common/icons";
import { useCartStore } from "@/stores/cart.store";
import { buildCartItemId } from "@/utils/cart-key";
import { formatCurrency } from "@/utils/format";
import type { QuickReorderPick } from "@/utils/quick-reorder";

// Nút gọi thêm nhanh (mig 136): một hàng dính ngay trên thanh giỏ, gợi ý đúng món + đúng cỡ bàn
// đã gọi gần nhất (bia, rượu). Bấm là thêm 1 vào giỏ, không mở bảng chọn; khách vẫn gửi đơn như
// mọi lượt khác. Layout quyết định có hiện hay không — component này chỉ vẽ và sửa giỏ.
export default function QuickReorderBar({ pick }: { pick: QuickReorderPick }) {
  const { product, variant } = pick;
  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  // Cùng khoá dòng giỏ với món thêm từ menu (không topping) → cộng dồn chung một dòng.
  const lineId = buildCartItemId({
    productId: product.id,
    selectedVariants: [],
    variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
  });
  const inCart = items.find((i) => i.id === lineId)?.quantity ?? 0;
  const price = variant ? variant.price : product.price;

  const add = () => {
    if (inCart > 0) {
      updateQuantity(lineId, inCart + 1);
      return;
    }
    addToCart({
      productId: product.id,
      productName: product.name,
      productImage: product.image ?? "",
      basePrice: price,
      variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
      selectedVariants: [],
      quantity: 1,
    });
  };

  return (
    <div className="shrink-0 px-3 pt-2 garden:px-4">
      <div className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-neutral100 bg-surface pl-2.5 pr-2 shadow-card garden:rounded-full garden:border-0">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <BeerIcon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small-m font-bold leading-tight text-text-primary">{product.name}</p>
          <p className="tabular truncate text-xxsmall leading-tight text-text-secondary">
            {variant ? `${variant.name} · ` : ""}{formatCurrency(price)}đ
          </p>
        </div>
        {inCart > 0 ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-1 text-white">
            <button type="button" aria-label={`Bớt một ${product.name}`} onClick={() => updateQuantity(lineId, inCart - 1)} className="grid size-7 place-items-center rounded-full bg-white/15 active:scale-90"><MinusIcon className="size-3.5" /></button>
            <span className="tabular min-w-4 text-center text-small-m font-bold">{inCart}</span>
            <button type="button" aria-label={`Thêm một ${product.name}`} onClick={add} className="grid size-7 place-items-center rounded-full bg-white/15 active:scale-90"><PlusIcon className="size-3.5" /></button>
          </span>
        ) : (
          <button type="button" onClick={add} aria-label={`Gọi thêm 1 ${product.name}${variant ? ` ${variant.name}` : ""}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary pl-2.5 pr-3.5 text-small-m font-bold text-white active:opacity-80">
            <PlusIcon className="size-4" />
            Thêm 1
          </button>
        )}
      </div>
    </div>
  );
}
