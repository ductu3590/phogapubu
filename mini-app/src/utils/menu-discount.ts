// Giảm giá theo món / danh mục (mig 115). SERVER (create_order) tự trừ giá lúc tạo đơn — file này chỉ để
// VẼ giá gạch + giá giảm và để giỏ hàng cộng đúng số khách sắp trả.
// ⚠️ Công thức tiền giảm phải khớp menu_discount_amount (mig 115) và admin-web/lib/menu/menu-discount.ts.

export type DiscountType = "percent" | "amount";

// Chương trình đang hiệu lực, dạng RPC get_active_menu_discounts trả (đã lọc cấp thắng: món > danh mục).
export interface ActiveRule {
  id: string;
  discount_type: DiscountType;
  value: number;
  name: string | null;
  time_to: string | null; // 'HH:MM'
  ends_on: string | null; // 'YYYY-MM-DD'
}

/** % làm tròn nửa lên tới đồng; VNĐ giữ nguyên; luôn ≤ giá, không âm. */
export function discountAmount(price: number, type: DiscountType, value: number): number {
  if (!(price > 0) || !(value > 0)) return 0;
  const raw = type === "percent" ? Math.round((price * value) / 100) : value;
  return Math.min(price, raw);
}

/** Mức giảm cao nhất cho khách, không cộng dồn. */
export function applyMenuDiscount(
  price: number,
  rules: ActiveRule[] | null | undefined,
): { price: number; originalPrice: number | null; rule: ActiveRule | null } {
  let best: ActiveRule | null = null;
  let bestAmt = 0;
  for (const r of rules ?? []) {
    const amt = discountAmount(price, r.discount_type, r.value);
    if (amt > bestAmt) {
      best = r;
      bestAmt = amt;
    }
  }
  if (!best) return { price, originalPrice: null, rule: null };
  return { price: price - bestAmt, originalPrice: price, rule: best };
}

function dotted(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** '−20%' · '−5.000đ' */
export function discountBadge(rule: { discount_type: DiscountType; value: number }): string {
  return rule.discount_type === "percent" ? `−${rule.value}%` : `−${dotted(rule.value)}đ`;
}

/** 'đến 18:00' · 'đến hết 20/11' · null */
export function untilLabel(rule: { time_to: string | null; ends_on: string | null }): string | null {
  if (rule.time_to) return `đến ${rule.time_to.slice(0, 5)}`;
  if (rule.ends_on) {
    const [, m, d] = rule.ends_on.split("-");
    return `đến hết ${d}/${m}`;
  }
  return null;
}

/** RPC → Map theo món. Dữ liệu lạ thì bỏ qua, không vỡ menu. */
export function parseActiveDiscounts(data: unknown): Map<string, ActiveRule[]> {
  const byItem = new Map<string, ActiveRule[]>();
  const items = data && typeof data === "object" ? (data as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return byItem;
  for (const row of items as { menu_item_id?: unknown; rules?: unknown }[]) {
    if (typeof row?.menu_item_id !== "string" || !Array.isArray(row.rules)) continue;
    const rules = (row.rules as Record<string, unknown>[])
      .filter((r) => typeof r?.id === "string" && (r.discount_type === "percent" || r.discount_type === "amount") && typeof r.value === "number")
      .map((r) => ({
        id: r.id as string,
        discount_type: r.discount_type as DiscountType,
        value: r.value as number,
        name: typeof r.name === "string" ? r.name : null,
        time_to: typeof r.time_to === "string" ? r.time_to : null,
        ends_on: typeof r.ends_on === "string" ? r.ends_on : null,
      }));
    if (rules.length > 0) byItem.set(row.menu_item_id, rules);
  }
  return byItem;
}
