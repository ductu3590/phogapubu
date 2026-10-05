import { describe, expect, it } from "vitest";
import { matchesQuery } from "./search-fold";

describe("matchesQuery", () => {
  it("bỏ dấu và không phân biệt hoa thường", () => {
    expect(matchesQuery("Tháp bia tươi 3L", "bia")).toBe(true);
    expect(matchesQuery("Tháp bia tươi 3L", "THAP BIA")).toBe(true);
    expect(matchesQuery("Lẩu riêu cua", "lau rieu")).toBe(true);
  });
  it("đ/Đ khớp với d", () => {
    expect(matchesQuery("Đậu phụ rán", "dau")).toBe(true);
  });
  it("khoảng trắng thừa ở từ khoá bị bỏ; từ khoá rỗng khớp mọi món", () => {
    expect(matchesQuery("Lạc luộc", "  lac  ")).toBe(true);
    expect(matchesQuery("Lạc luộc", "   ")).toBe(true);
  });
  it("không khớp", () => {
    expect(matchesQuery("Lạc luộc", "bia")).toBe(false);
  });
});
