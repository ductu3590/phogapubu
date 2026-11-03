import { describe, expect, it } from "vitest";
import { billTotals } from "./bill-total";

describe("billTotals", () => {
  it("trừ giảm giá bill khỏi tạm tính", () => {
    expect(billTotals(155000, 15500)).toEqual({ subtotal: 155000, discount: 15500, payable: 139500 });
  });

  it("server cũ không trả bill_discount → coi như 0", () => {
    expect(billTotals(155000, undefined)).toEqual({ subtotal: 155000, discount: 0, payable: 155000 });
  });

  it("giá trị rác (âm, NaN, null) → 0", () => {
    expect(billTotals(100000, -5).discount).toBe(0);
    expect(billTotals(100000, Number.NaN).discount).toBe(0);
    expect(billTotals(100000, null as unknown as undefined).discount).toBe(0);
  });

  it("giảm vượt tạm tính thì kẹp về tạm tính, không ra số âm", () => {
    expect(billTotals(50000, 80000)).toEqual({ subtotal: 50000, discount: 50000, payable: 0 });
  });
});
