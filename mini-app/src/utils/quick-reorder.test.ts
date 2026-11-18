import { describe, expect, it } from "vitest";
import { orderedQuantity, pickQuickReorder } from "./quick-reorder";
import type { CategoryWithProducts } from "@/types/category.types";
import type { Product } from "@/types/product.types";

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id, name: id, description: null, price: 25000, image: null, isAvailable: true, categoryId: "c",
  sortOrder: 0, toppings: [], variants: [], hasVariantGroup: false, variantGroupName: null, badge: null, ...over,
});
const biaHoi = product("bia-hoi", {
  hasVariantGroup: true,
  variants: [{ id: "coc", name: "Cốc", price: 15000 }, { id: "ca", name: "Ca 1 lít", price: 60000 }],
});
const tiger = product("tiger");
const suon = product("suon");
const menu = (quick = true): CategoryWithProducts[] => [
  { id: "nuong", name: "Nướng", sortOrder: 1, quickReorder: false, products: [suon] },
  { id: "bia", name: "Bia", sortOrder: 2, quickReorder: quick, products: [biaHoi, tiger] },
];
const order = (created_at: string, items: Array<{ menu_item_id: string; variant_id?: string | null; quantity?: number; void_type?: string | null }>, over = {}) => ({
  status: "confirmed", created_at, items: items.map((i) => ({ quantity: 1, ...i })), ...over,
});

describe("pickQuickReorder", () => {
  it("gợi ý đúng món + đúng cỡ bàn đã gọi", () => {
    const pick = pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "suon" }, { menu_item_id: "bia-hoi", variant_id: "ca" }])], menu());
    expect(pick?.product.id).toBe("bia-hoi");
    expect(pick?.variant?.id).toBe("ca");
  });

  it("bàn đổi loại bia thì theo lượt gọi SAU CÙNG, không phụ thuộc thứ tự mảng", () => {
    const pick = pickQuickReorder([
      order("2026-11-12T11:00:00Z", [{ menu_item_id: "tiger", quantity: 4 }]),
      order("2026-11-12T10:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: "ca", quantity: 9 }]),
    ], menu());
    expect(pick?.product.id).toBe("tiger");
    expect(pick?.variant).toBeNull();
  });

  it("cùng một lượt gọi hai loại → loại gọi nhiều hơn", () => {
    const pick = pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger", quantity: 2 }, { menu_item_id: "bia-hoi", variant_id: "coc", quantity: 6 }])], menu());
    expect(pick?.product.id).toBe("bia-hoi");
    expect(pick?.variant?.id).toBe("coc");
  });

  it("lượt mới nhất không có đồ uống thì lùi về lượt trước", () => {
    const pick = pickQuickReorder([
      order("2026-11-12T11:00:00Z", [{ menu_item_id: "suon" }]),
      order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger" }]),
    ], menu());
    expect(pick?.product.id).toBe("tiger");
  });

  it("lượt bị từ chối / đã huỷ và dòng đã bỏ không tính là bàn đã gọi", () => {
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger" }], { status: "cancelled" })], menu())).toBeNull();
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger" }], { rejected_at: "2026-11-12T10:01:00Z" })], menu())).toBeNull();
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger", void_type: "cancelled" }])], menu())).toBeNull();
  });

  it("món được tặng vẫn tính là bàn đang uống loại đó", () => {
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger", void_type: "gift" }])], menu())?.product.id).toBe("tiger");
  });

  it("danh mục chưa tick, bàn chưa gọi, hoặc chưa có bill → không gợi ý", () => {
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger" }])], menu(false))).toBeNull();
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "suon" }])], menu())).toBeNull();
    expect(pickQuickReorder([], menu())).toBeNull();
  });

  it("món đã tắt bán hoặc cỡ đã gọi không còn bán → không gợi ý món đó", () => {
    const off: CategoryWithProducts[] = [{ id: "bia", name: "Bia", sortOrder: 1, quickReorder: true, products: [{ ...tiger, isAvailable: false }, biaHoi] }];
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger" }])], off)).toBeNull();
    // cỡ "tháp" không còn trong danh sách cỡ đang bán; đơn cũ thiếu variant_id cũng không đoán cỡ
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: "thap" }])], off)).toBeNull();
    expect(pickQuickReorder([order("2026-11-12T10:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: null }])], off)).toBeNull();
  });
});

describe("orderedQuantity", () => {
  const pick = { product: biaHoi, variant: biaHoi.variants[1] };
  it("cộng số phần đúng món + đúng cỡ qua mọi lượt", () => {
    expect(orderedQuantity([
      order("2026-11-12T10:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: "ca", quantity: 2 }, { menu_item_id: "suon" }]),
      order("2026-11-12T11:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: "ca", quantity: 1 }, { menu_item_id: "bia-hoi", variant_id: "coc", quantity: 5 }]),
    ], pick)).toBe(3);
  });

  it("không tính lượt bị huỷ / từ chối và món đã huỷ", () => {
    expect(orderedQuantity([
      order("2026-11-12T10:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: "ca", quantity: 2 }], { status: "cancelled" }),
      order("2026-11-12T10:30:00Z", [{ menu_item_id: "bia-hoi", variant_id: "ca", quantity: 4 }], { rejected_at: "2026-11-12T10:31:00Z" }),
      order("2026-11-12T11:00:00Z", [{ menu_item_id: "bia-hoi", variant_id: "ca", quantity: 1, void_type: "cancelled" }, { menu_item_id: "bia-hoi", variant_id: "ca", quantity: 1 }]),
    ], pick)).toBe(1);
  });

  it("món không có cỡ: chỉ so món", () => {
    expect(orderedQuantity([order("2026-11-12T10:00:00Z", [{ menu_item_id: "tiger", quantity: 3 }])], { product: tiger, variant: null })).toBe(3);
  });
});
