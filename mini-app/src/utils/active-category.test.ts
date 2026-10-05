import { describe, expect, it } from "vitest";
import { activeCategoryAt } from "./active-category";

// Toạ độ tính so với ĐỈNH vùng cuộn danh sách, không phải màn hình: phía trên vùng cuộn còn
// thanh công cụ + ô tìm + chip + banner, cao khác nhau theo máy/banner.
describe("activeCategoryAt", () => {
  const headings = [
    { id: "a", top: 300 },
    { id: "b", top: 700 },
    { id: "c", top: 1100 },
  ];
  it("đang ở đầu danh sách (heading đầu nằm dưới mép vùng cuộn) → danh mục đầu", () => {
    expect(activeCategoryAt(headings, 300)).toBe("a");
  });
  it("heading vừa chạm mép trên vùng cuộn → chọn danh mục đó", () => {
    expect(activeCategoryAt([{ id: "a", top: 100 }, { id: "b", top: 302 }, { id: "c", top: 900 }], 300)).toBe("b");
  });
  it("bấm chip rồi cuộn tới đúng heading (heading = mép vùng cuộn) → không nhảy về danh mục trên", () => {
    expect(activeCategoryAt([{ id: "a", top: -500 }, { id: "b", top: 300 }, { id: "c", top: 700 }], 300)).toBe("b");
  });
  it("danh sách rỗng → chuỗi rỗng", () => {
    expect(activeCategoryAt([], 300)).toBe("");
  });
});
