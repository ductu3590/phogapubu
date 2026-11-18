// Gợi ý "gọi thêm nhanh" (mig 136). Quán nhậu: bàn đã uống loại bia / rượu nào thì gọi tiếp
// đúng loại đó suốt bữa → chỉ gợi ý MỘT món: đúng món + đúng cỡ bàn gọi gần nhất, trong các
// danh mục chủ quán đã tick "Gợi ý gọi thêm nhanh". Hàm thuần — dữ liệu vào là bill phiên bàn
// (get_table_session_bill) và menu đang hiển thị.
import type { CategoryWithProducts } from "@/types/category.types";
import type { Product, Variant } from "@/types/product.types";

export interface QuickReorderPick {
  product: Product;
  /** Cỡ / loại bàn đã chọn (Ca 1 lít…); null = món không có lựa chọn. */
  variant: Variant | null;
}

type BillItem = { menu_item_id?: string | null; variant_id?: string | null; quantity: number; void_type?: string | null };
type BillOrder = { status: string; created_at: string; rejected_at?: string | null; items: BillItem[] };

export function pickQuickReorder(orders: BillOrder[], menu: CategoryWithProducts[]): QuickReorderPick | null {
  const byId = new Map<string, Product>();
  for (const cat of menu) {
    if (!cat.quickReorder) continue;
    for (const p of cat.products) byId.set(p.id, p);
  }
  if (byId.size === 0) return null;

  // Lượt mới nhất trước. Lượt bị thu ngân từ chối / đã huỷ không tính là "bàn đã gọi".
  const rounds = orders
    .filter((o) => o.status !== "cancelled" && !o.rejected_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  for (const round of rounds) {
    let best: (QuickReorderPick & { quantity: number }) | null = null;
    for (const item of round.items) {
      if (item.void_type === "cancelled" || !item.menu_item_id) continue;
      const product = byId.get(item.menu_item_id);
      // Món đã tắt bán thì không gợi ý — bấm vào sẽ bị server từ chối.
      if (!product || !product.isAvailable) continue;
      let variant: Variant | null = null;
      if (product.hasVariantGroup) {
        // Món có cỡ: phải biết bàn đã gọi cỡ nào VÀ cỡ đó còn bán (product.variants chỉ chứa cỡ còn bán).
        variant = product.variants.find((v) => v.id === item.variant_id) ?? null;
        if (!variant) continue;
      }
      // Cùng một lượt gọi nhiều loại: lấy loại gọi nhiều nhất; bằng nhau thì giữ loại đứng trước.
      if (!best || item.quantity > best.quantity) best = { product, variant, quantity: item.quantity };
    }
    if (best) return { product: best.product, variant: best.variant };
  }
  return null;
}

/** Bàn đã gọi bao nhiêu phần đúng món + đúng cỡ gợi ý (dòng "Bàn đã gọi N" của theme garden).
 *  Bỏ lượt bị huỷ / thu ngân từ chối và món đã huỷ — cùng luật với pickQuickReorder. Chỉ để hiển thị,
 *  không dính tới tiền. */
export function orderedQuantity(orders: BillOrder[], pick: QuickReorderPick): number {
  let total = 0;
  for (const round of orders) {
    if (round.status === "cancelled" || round.rejected_at) continue;
    for (const item of round.items) {
      if (item.void_type === "cancelled" || item.menu_item_id !== pick.product.id) continue;
      if (pick.variant && item.variant_id !== pick.variant.id) continue;
      total += item.quantity;
    }
  }
  return total;
}
