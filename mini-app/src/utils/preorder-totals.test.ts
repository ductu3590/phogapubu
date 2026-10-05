import { describe, expect, it } from "vitest";
import type { CartItem } from "@/types/cart.types";
import { preorderTotals } from "./preorder-totals";

const item = (over: Partial<CartItem>): CartItem => ({
  id: "x", productId: "p", productName: "Món", productImage: "", basePrice: 100000, selectedVariants: [], quantity: 1, ...over,
}) as CartItem;

describe("preorderTotals — tiền từng dòng KHỚP tổng (trước đây dòng bỏ topping)", () => {
  it("dòng = (giá + topping) × SL; tổng = cộng các dòng", () => {
    const r = preorderTotals([
      item({ id: "a", basePrice: 450000, quantity: 1 }),
      item({ id: "b", basePrice: 180000, quantity: 2, selectedVariants: [{ groupId: "topping", optionId: "t1", optionName: "Thêm rau", extraPrice: 20000 } as CartItem["selectedVariants"][number]] }),
    ]);
    expect(r.lines).toEqual({ a: 450000, b: 400000 });
    expect(r.total).toBe(850000);
    expect(r.count).toBe(3);
  });
  it("rỗng", () => expect(preorderTotals([])).toEqual({ lines: {}, total: 0, count: 0 }));
});
