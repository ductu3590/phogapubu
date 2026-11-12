import { describe, expect, it } from "vitest";
import { decodeThemeSeed, encodeThemeSeed, initialThemeSeed, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("chỉ nhận garden, mọi thứ khác về classic", () => {
    expect(resolveTheme("garden")).toBe("garden");
    expect(resolveTheme("classic")).toBe("classic");
    for (const raw of [null, undefined, "", "Garden", "dark", 1, {}]) expect(resolveTheme(raw)).toBe("classic");
  });
});

describe("theme seed", () => {
  it("ghi rồi đọc lại ra đúng", () => {
    const seed = { theme: "garden" as const, primary: "#3E4728" };
    expect(decodeThemeSeed(encodeThemeSeed(seed))).toEqual(seed);
  });

  it("chuỗi hỏng / rỗng → null, không ném lỗi", () => {
    for (const raw of [null, undefined, "", "{", "null", "5", '"x"']) expect(decodeThemeSeed(raw)).toBeNull();
  });

  it("màu sai định dạng bị bỏ, theme lạ về classic", () => {
    expect(decodeThemeSeed('{"t":"neon","p":"red"}')).toEqual({ theme: "classic", primary: null });
    expect(decodeThemeSeed('{"t":"garden","p":"#3e4"}')).toEqual({ theme: "garden", primary: null });
  });
});

describe("initialThemeSeed", () => {
  it("cache thắng gợi ý .env", () => {
    const cache = encodeThemeSeed({ theme: "classic", primary: "#C0341A" });
    expect(initialThemeSeed(cache, "garden", "#3E4728")).toEqual({ theme: "classic", primary: "#C0341A" });
  });

  it("chưa có cache thì lấy gợi ý .env", () => {
    expect(initialThemeSeed(null, "garden", "#3E4728")).toEqual({ theme: "garden", primary: "#3E4728" });
  });

  it("không có gì → classic, không màu (app dùng màu mặc định)", () => {
    expect(initialThemeSeed(null)).toEqual({ theme: "classic", primary: null });
    expect(initialThemeSeed("rác", "x", "y")).toEqual({ theme: "classic", primary: null });
  });
});
