import type { CartItem } from "@/types/cart.types";
import { calculateCartItemPrice } from "@/utils/cart";

// Tiền món đặt trước: MỘT công thức cho từng dòng lẫn tổng (giá loại/món + topping) × số lượng.
// Trước đây dòng chỉ lấy giá món × SL nên món có topping làm các dòng cộng lại khác tổng.
export function preorderTotals(items: CartItem[]): { lines: Record<string, number>; total: number; count: number } {
  const lines: Record<string, number> = {};
  let total = 0;
  let count = 0;
  for (const item of items) {
    const amount = calculateCartItemPrice(item) * item.quantity;
    lines[item.id] = amount;
    total += amount;
    count += item.quantity;
  }
  return { lines, total, count };
}
