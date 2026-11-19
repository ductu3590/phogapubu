// Dòng món trên trang Đơn gọi (theme garden, bản vẽ docs/design/yen-garden/apple-hig). Hàm thuần.
import { lineLabel } from "@/utils/round-status";

type Topping = { name: string; price?: number | null };
export type BillLineItem = {
  menu_item_id?: string | null;
  variant_id?: string | null;
  name: string;
  quantity: number;
  price: number;
  toppings?: Topping[] | null;
  void_type?: string | null;
};
export type BillLineOrder = { status: string; created_at: string; rejected_at?: string | null; items: BillLineItem[] };

/**
 * Server chụp tên món có lựa chọn thành "Tên (Lựa chọn)" (create_order mig 043, add_order_line mig 046).
 * Tách lại để lựa chọn nằm dòng phụ. Món không có variant_id giữ nguyên tên (kể cả tên có ngoặc).
 */
export function splitItemName(name: string, hasVariant: boolean): { name: string; detail: string | null } {
  if (!hasVariant || !name.endsWith(")")) return { name, detail: null };
  const open = name.lastIndexOf(" (");
  if (open <= 0) return { name, detail: null };
  return { name: name.slice(0, open), detail: name.slice(open + 2, -1) };
}

// Lượt bị thu ngân từ chối / đã huỷ và món đã huỷ không phải là món bàn đã gọi.
function liveItems(orders: BillLineOrder[]): BillLineItem[] {
  const out: BillLineItem[] = [];
  [...orders]
    .filter((o) => o.status !== "cancelled" && !o.rejected_at)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .forEach((o) => out.push(...o.items.filter((i) => i.void_type !== "cancelled")));
  return out;
}

/** Tổng số phần món bàn đã gọi ("4 món"). */
export function countBillItems(orders: BillLineOrder[]): number {
  return liveItems(orders).reduce((s, i) => s + i.quantity, 0);
}

export type MergedLine = {
  key: string;
  name: string;
  detail: string | null;
  toppings: string[];
  quantity: number;
  amount: number;
  gift: boolean;
};

/**
 * "Gộp món": cộng dồn cùng món + cùng lựa chọn + cùng topping + cùng đơn giá qua mọi lượt, để khách
 * soát trước khi ra quầy. Món tặng tách dòng riêng. Thứ tự = lần đầu gọi (lượt cũ trước).
 * Tiền mỗi dòng theo cùng luật lineLabel với chế độ "Theo lượt" (giảm giá lượt không chia vào dòng).
 */
export function mergeBillLines(orders: BillLineOrder[]): MergedLine[] {
  const out = new Map<string, MergedLine>();
  for (const item of liveItems(orders)) {
    const toppings = (item.toppings ?? []).map((t) => t.name);
    const unit = item.price + (item.toppings ?? []).reduce((s, t) => s + (t.price ?? 0), 0);
    const line = lineLabel({ quantity: item.quantity, price: unit, void_type: item.void_type });
    const key = [item.menu_item_id ?? item.name, item.variant_id ?? "", item.name, toppings.join("|"), unit, line.gift ? "gift" : ""].join("¦");
    const found = out.get(key);
    if (found) {
      found.quantity += item.quantity;
      found.amount += line.amount;
      continue;
    }
    const { name, detail } = splitItemName(item.name, !!item.variant_id);
    out.set(key, { key, name, detail, toppings, quantity: item.quantity, amount: line.amount, gift: line.gift });
  }
  return [...out.values()];
}
