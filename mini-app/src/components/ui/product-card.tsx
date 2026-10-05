import { useState } from "react";
import { MinusIcon, PlusIcon, UtensilsIcon } from "@/components/common/icons";
import type { Product } from "@/types/product.types";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";

export default function ProductCard({ product, layout, canOrder, count, onAdd, onDecrease }: {
  product: Product; layout: "grid" | "list"; canOrder: boolean; count: number; onAdd: () => void; onDecrease: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasVariants = product.variants.length > 0;
  // Đếm THÔ (hasVariantGroup) — món tắt hết lựa chọn phải là "Tạm hết", không bán giá cũ (bẫy mig 042).
  const soldOutByVariants = product.hasVariantGroup && !hasVariants;
  const available = product.isAvailable && !soldOutByVariants;
  const hasOptions = hasVariants || product.toppings.length > 0;
  const price = `${hasVariants || soldOutByVariants ? "Từ " : ""}${formatCurrency(product.price)}đ`;
  const image = product.image && !imageFailed ? product.image : null;

  const control = available && canOrder ? (
    !hasOptions && count > 0 ? (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 p-0.5">
        <button type="button" aria-label="Giảm" onClick={onDecrease} className="grid size-7 place-items-center rounded-full bg-surface text-primary active:scale-90"><MinusIcon className="size-3.5" /></button>
        <span className="min-w-5 text-center text-small-m font-bold text-text-primary">{count}</span>
        <button type="button" aria-label="Thêm" onClick={onAdd} className="grid size-7 place-items-center rounded-full bg-primary text-white active:scale-90"><PlusIcon className="size-3.5" /></button>
      </span>
    ) : (
      <button type="button" aria-label={`Thêm ${product.name}`} onClick={onAdd} className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary text-white shadow-sm active:scale-90">
        <PlusIcon className="size-4" />
        {hasOptions && count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-neutral900 px-1 text-xxxsmall font-bold">{count}</span>}
      </button>
    )
  ) : !available ? <span className="shrink-0 rounded-full bg-neutral100 px-2 py-0.5 text-xxxsmall font-semibold text-text-secondary">Tạm hết</span> : null;

  if (layout === "grid") {
    return (
      <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]", !available && "opacity-60")}>
        <div className="aspect-[4/3] w-full bg-primary/5">
          {image ? <img src={image} alt={product.name} onError={() => setImageFailed(true)} className="h-full w-full object-cover" draggable={false} />
            : <div className="grid h-full place-items-center text-primary/40"><UtensilsIcon className="size-8" /></div>}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <p className="line-clamp-2 text-small-m font-semibold text-text-primary">{product.name}</p>
          <span className="mt-auto whitespace-nowrap text-small-m font-bold text-primary">{price}</span>
          {control && <div className="flex justify-end">{control}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", !available && "opacity-60")}>
      {image && <img src={image} alt={product.name} onError={() => setImageFailed(true)} className="size-16 shrink-0 rounded-xl object-cover" draggable={false} />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-normal-sb font-semibold text-text-primary">{product.name}</p>
        {product.description && <p className="mt-0.5 line-clamp-2 text-xxsmall text-text-secondary">{product.description}</p>}
        <p className="mt-1 whitespace-nowrap text-small-m font-bold text-primary">{price}</p>
      </div>
      {control}
    </div>
  );
}
