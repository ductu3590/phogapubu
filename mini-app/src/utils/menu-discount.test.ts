import { describe, expect, it } from "vitest";
import { applyMenuDiscount, discountAmount, discountBadge, parseActiveDiscounts, untilLabel, type ActiveRule } from "./menu-discount";

const rule = (over: Partial<ActiveRule>): ActiveRule => ({
  id: "r", discount_type: "percent", value: 10, name: null, time_to: null, ends_on: null, ...over,
});

describe("giảm giá món — khớp menu_discount_amount (mig 115)", () => {
  it("% làm tròn nửa lên, VNĐ không vượt giá", () => {
    expect(discountAmount(12_345, "percent", 15)).toBe(1_852);
    expect(discountAmount(1_250, "percent", 1)).toBe(13);
    expect(discountAmount(20_000, "amount", 99_999)).toBe(20_000);
    expect(discountAmount(0, "percent", 50)).toBe(0);
  });
  it("lấy mức cao nhất, không cộng dồn", () => {
    const a = rule({ id: "a", value: 10 });
    const b = rule({ id: "b", discount_type: "amount", value: 8_000 });
    expect(applyMenuDiscount(50_000, [a, b])).toEqual({ price: 42_000, originalPrice: 50_000, rule: b });
    expect(applyMenuDiscount(50_000, undefined)).toEqual({ price: 50_000, originalPrice: null, rule: null });
  });
  it("nhãn", () => {
    expect(discountBadge({ discount_type: "percent", value: 20 })).toBe("−20%");
    expect(discountBadge({ discount_type: "amount", value: 15_000 })).toBe("−15.000đ");
    expect(untilLabel({ time_to: "18:00", ends_on: null })).toBe("đến 18:00");
    expect(untilLabel({ time_to: null, ends_on: "2026-11-20" })).toBe("đến hết 20/11");
    expect(untilLabel({ time_to: null, ends_on: null })).toBeNull();
  });
  it("đọc RPC, bỏ dữ liệu lạ", () => {
    const m = parseActiveDiscounts({
      items: [
        { menu_item_id: "m1", rules: [{ id: "r1", discount_type: "amount", value: 5000, name: null, time_to: null, ends_on: null }] },
        { menu_item_id: "m2", rules: [{ id: "x", discount_type: "free", value: 1 }] },
      ],
    });
    expect(m.get("m1")?.[0].value).toBe(5000);
    expect(m.has("m2")).toBe(false);
    expect(parseActiveDiscounts("rác").size).toBe(0);
  });
});
