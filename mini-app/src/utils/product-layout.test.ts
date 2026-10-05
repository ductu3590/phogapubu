import { describe, expect, it } from "vitest";
import { pickProductLayout } from "./product-layout";

describe("pickProductLayout", () => {
  const img = { image: "https://x/a.jpg" };
  const none = { image: null };
  it("≥60% món có ảnh → lưới", () => {
    expect(pickProductLayout([img, img, img, none, none])).toBe("grid"); // 60%
  });
  it("dưới 60% → danh sách", () => {
    expect(pickProductLayout([img, none, none])).toBe("list");
  });
  it("danh mục rỗng hoặc 1 món → danh sách, không chia cho 0", () => {
    expect(pickProductLayout([])).toBe("list");
    expect(pickProductLayout([img])).toBe("list");
  });
  it("chuỗi ảnh rỗng coi như không có ảnh", () => {
    expect(pickProductLayout([{ image: "" }, { image: "  " }, img])).toBe("list");
  });
});
