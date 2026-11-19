import { describe, expect, it } from "vitest";
import { countBillItems, mergeBillLines, splitItemName, type BillLineOrder } from "./bill-lines";

const item = (o: Partial<BillLineOrder["items"][number]> & { name: string }) => ({ quantity: 1, price: 60000, ...o });

describe("splitItemName", () => {
  it("tách lựa chọn khỏi tên khi món có variant", () => {
    expect(splitItemName("Bia hơi Hà Nội (Ca 1 lít)", true)).toEqual({ name: "Bia hơi Hà Nội", detail: "Ca 1 lít" });
  });
  it("giữ nguyên tên có ngoặc khi món không có variant", () => {
    expect(splitItemName("Gà đồi nướng (1,6–1,8 kg)", false)).toEqual({ name: "Gà đồi nướng (1,6–1,8 kg)", detail: null });
  });
  it("lấy ngoặc CUỐI làm lựa chọn", () => {
    expect(splitItemName("Gà (đồi) (Nửa con)", true)).toEqual({ name: "Gà (đồi)", detail: "Nửa con" });
  });
});

describe("mergeBillLines / countBillItems", () => {
  const orders: BillLineOrder[] = [
    { status: "pending", created_at: "2026-11-19T14:10:00+07:00", items: [item({ menu_item_id: "bia", variant_id: "ca", name: "Bia hơi Hà Nội (Ca 1 lít)" })] },
    {
      status: "confirmed",
      created_at: "2026-11-19T12:43:00+07:00",
      items: [
        item({ menu_item_id: "bachi", name: "Ba chỉ nướng", price: 145000 }),
        item({ menu_item_id: "bia", variant_id: "ca", name: "Bia hơi Hà Nội (Ca 1 lít)", quantity: 2 }),
        item({ menu_item_id: "bia", variant_id: "ca", name: "Bia hơi Hà Nội (Ca 1 lít)", void_type: "gift" }),
        item({ menu_item_id: "lac", name: "Lạc rang", void_type: "cancelled" }),
      ],
    },
    { status: "cancelled", created_at: "2026-11-19T13:00:00+07:00", items: [item({ menu_item_id: "bia", variant_id: "ca", name: "Bia hơi Hà Nội (Ca 1 lít)", quantity: 5 })] },
  ];

  it("cộng dồn cùng món + cỡ qua các lượt, lượt cũ đứng trước, bỏ lượt từ chối và món huỷ", () => {
    expect(mergeBillLines(orders).map((l) => [l.name, l.detail, l.quantity, l.amount, l.gift])).toEqual([
      ["Ba chỉ nướng", null, 1, 145000, false],
      ["Bia hơi Hà Nội", "Ca 1 lít", 3, 180000, false],
      ["Bia hơi Hà Nội", "Ca 1 lít", 1, 0, true],
    ]);
  });

  it("đếm phần món bàn đã gọi", () => {
    expect(countBillItems(orders)).toBe(5);
  });

  it("khác topping thì không gộp", () => {
    const lines = mergeBillLines([
      { status: "confirmed", created_at: "a", items: [item({ menu_item_id: "x", name: "Lẩu", toppings: [{ name: "Thêm bò", price: 50000 }] }), item({ menu_item_id: "x", name: "Lẩu" })] },
    ]);
    expect(lines.map((l) => [l.toppings, l.amount])).toEqual([[["Thêm bò"], 110000], [[], 60000]]);
  });
});
