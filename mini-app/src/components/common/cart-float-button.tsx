import { CartIcon } from "./vectors";
import { useCartStore } from "@/stores/cart.store";
import { Button } from "zmp-ui";
import { formatCount } from "@/utils/format";
import { formatCurrency } from "@/utils/format";
import { calculateCartTotal } from "@/utils/cart";
import { useNavigate } from "react-router-dom";

interface CartFloatButtonProps {
  itemCount: number;
}

export default function CartFloatButton({ itemCount }: CartFloatButtonProps) {
  const navigate = useNavigate();
  const { items } = useCartStore();
  const totalAmount = calculateCartTotal(items);

  if (itemCount === 0) return null;

  return (
    <button
      onClick={() => navigate("/checkout")}
      className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between rounded-2xl bg-primary px-4 py-3 shadow-lg active:opacity-90"
    >
      <div className="flex items-center gap-2">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <CartIcon className="h-5 w-5 text-white" />
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-xxxsmall font-bold text-primary">
            {formatCount(itemCount)}
          </span>
        </div>
        <span className="text-small font-semibold text-white">
          {itemCount} món đã chọn
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-small-m font-bold text-white">
          {formatCurrency(totalAmount)}đ
        </span>
        <span className="text-white opacity-80">›</span>
      </div>
    </button>
  );
}
