import { useState } from "react";
import { Sheet } from "zmp-ui";
import { Product } from "@/types/product.types";
import { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";

interface ToppingSheetProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  // Trả về tổ hợp topping đã chọn (dưới dạng SelectedVariant) để thêm 1 suất vào giỏ
  onConfirm: (variants: SelectedVariant[]) => void;
}

export default function ToppingSheet({ product, visible, onClose, onConfirm }: ToppingSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset lựa chọn mỗi lần mở sheet cho 1 món
  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  if (!product) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toppingTotal = product.toppings
    .filter((t) => selected.has(t.id))
    .reduce((s, t) => s + t.price, 0);
  const unitPrice = product.price + toppingTotal;

  const handleConfirm = () => {
    const variants: SelectedVariant[] = product.toppings
      .filter((t) => selected.has(t.id))
      .map((t) => ({
        groupId: "topping",
        groupTitle: "Topping",
        optionId: t.id,
        optionName: t.name,
        extraPrice: t.price,
        quantity: 1,
      }));
    onConfirm(variants);
    setSelected(new Set());
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
            <p className="text-small text-text-secondary">{formatCurrency(product.price)}đ</p>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-2">
          <p className="py-2 text-small-m font-semibold text-text-secondary">Chọn thêm topping</p>
          {product.toppings.map((t) => {
            const checked = selected.has(t.id);
            return (
              <button key={t.id} onClick={() => toggle(t.id)}
                className="flex w-full items-center gap-3 border-b border-neutral100 py-3 text-left">
                <span className={cn(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                  checked ? "border-primary bg-primary text-white" : "border-neutral400",
                )}>
                  {checked && <span className="text-xs">✓</span>}
                </span>
                <span className="flex-1 text-normal text-text-primary">{t.name}</span>
                <span className="text-small font-medium text-text-secondary">+{formatCurrency(t.price)}đ</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-neutral100 px-4 py-4">
          <button onClick={handleConfirm}
            className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 font-semibold text-white active:bg-primary">
            <span>Thêm vào giỏ</span>
            <span>{formatCurrency(unitPrice)}đ</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
