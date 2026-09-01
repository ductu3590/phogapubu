import { useState } from "react";
import { Sheet } from "zmp-ui";
import { Product, Variant } from "@/types/product.types";
import { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";

interface OptionSheetProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  // variant = lựa chọn quyết định giá (null nếu món không có);
  // toppings = phụ thu tích thêm
  onConfirm: (variant: Variant | null, toppings: SelectedVariant[]) => void;
}

export default function OptionSheet({ product, visible, onClose, onConfirm }: OptionSheetProps) {
  const [selectedToppings, setSelectedToppings] = useState<Set<string>>(new Set());
  // KHÔNG chọn sẵn lựa chọn đầu tiên: bắt khách nhìn giá rồi mới bấm,
  // tránh cảnh vô ý đặt tháp bia 200k.
  const [variantId, setVariantId] = useState<string | null>(null);

  const reset = () => {
    setSelectedToppings(new Set());
    setVariantId(null);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  if (!product) return null;

  const hasVariants = product.variants.length > 0;
  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const canConfirm = !hasVariants || variant !== null;

  const toggleTopping = (id: string) => {
    setSelectedToppings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toppingTotal = product.toppings
    .filter((t) => selectedToppings.has(t.id))
    .reduce((s, t) => s + t.price, 0);
  // Có biến thể thì giá gốc là giá biến thể, không phải product.price
  const unitPrice = (variant ? variant.price : product.price) + toppingTotal;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const toppings: SelectedVariant[] = product.toppings
      .filter((t) => selectedToppings.has(t.id))
      .map((t) => ({
        groupId: "topping",
        groupTitle: "Topping",
        optionId: t.id,
        optionName: t.name,
        extraPrice: t.price,
        quantity: 1,
      }));
    onConfirm(variant, toppings);
    reset();
  };

  return (
    <Sheet autoHeight visible={visible} onClose={handleClose}>
      <div className="flex max-h-[75vh] flex-col bg-white">
        <div className="flex items-center gap-3 border-b border-neutral100 px-4 py-3">
          {product.image ? (
            <img src={product.image} alt={product.name}
              className="h-12 w-12 rounded-lg object-cover" draggable={false} />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral100 text-2xl">🍽️</div>
          )}
          <div className="min-w-0">
            <p className="text-normal-sb font-semibold text-text-primary line-clamp-1">{product.name}</p>
            <p className="text-small text-text-secondary">
              {hasVariants ? "Từ " : ""}{formatCurrency(product.price)}đ
            </p>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-2">
          {hasVariants && (
            <>
              <p className="py-2 text-small-m font-semibold text-text-secondary">
                {product.variantGroupName ?? "Chọn loại"}{" "}
                <span className="font-normal text-primary">(bắt buộc)</span>
              </p>
              {product.variants.map((v) => (
                <button key={v.id} onClick={() => setVariantId(v.id)}
                  className="flex w-full items-center gap-3 border-b border-neutral100 py-3 text-left">
                  <span className={cn(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    variantId === v.id ? "border-primary" : "border-neutral300",
                  )}>
                    {variantId === v.id && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                  <span className="flex-1 text-normal text-text-primary">{v.name}</span>
                  <span className="text-normal-sb font-semibold text-text-primary">
                    {formatCurrency(v.price)}đ
                  </span>
                </button>
              ))}
            </>
          )}

          {product.toppings.length > 0 && (
            <>
              <p className="py-2 text-small-m font-semibold text-text-secondary">Chọn thêm topping</p>
              {product.toppings.map((t) => {
                const checked = selectedToppings.has(t.id);
                return (
                  <button key={t.id} onClick={() => toggleTopping(t.id)}
                    className="flex w-full items-center gap-3 border-b border-neutral100 py-3 text-left">
                    <span className={cn(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                      checked ? "border-primary bg-primary" : "border-neutral300",
                    )}>
                      {checked && <span className="text-xxsmall font-bold text-white">✓</span>}
                    </span>
                    <span className="flex-1 text-normal text-text-primary">{t.name}</span>
                    <span className="text-small text-text-secondary">+{formatCurrency(t.price)}đ</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="border-t border-neutral100 p-4">
          <button onClick={handleConfirm} disabled={!canConfirm}
            className={cn(
              "w-full rounded-xl py-3 text-normal-sb font-semibold text-white transition-opacity",
              canConfirm ? "bg-primary" : "bg-neutral300",
            )}>
            {canConfirm
              ? `Thêm vào giỏ — ${formatCurrency(unitPrice)}đ`
              : `Chọn ${(product.variantGroupName ?? "loại").toLowerCase()} để tiếp tục`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
