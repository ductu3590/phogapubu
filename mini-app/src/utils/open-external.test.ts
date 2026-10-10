import { describe, expect, it, vi } from "vitest";
import { isZaloWebview, openExternal } from "./open-external";

describe("isZaloWebview", () => {
  it("user agent trình duyệt trong Zalo có chữ Zalo", () => {
    expect(isZaloWebview("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo android/12100634 ZaloTheme/light")).toBe(true);
    expect(isZaloWebview("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148 Zalo iOS/641")).toBe(true);
  });
  it("Chrome / Safari thường → không phải Zalo", () => {
    expect(isZaloWebview("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141 Safari/537.36")).toBe(false);
  });
});

// Ngoài Zalo, openOutApp / openWebview của zmp-sdk BÁO XONG NGAY mà không mở gì (đã đo 2026-10-05)
// → không thể dựa vào kết quả lệnh; phải phân nhánh theo môi trường.
describe("openExternal — nút Chỉ đường", () => {
  // 2026-10-09: openOutApp KHÔNG có trong danh sách API công khai của Zalo Mini App → trên Zalo thật bấm
  // không mở gì, cũng không báo lỗi. Trong Zalo dùng openWebview (API chính thức) — truyền vào qua openInZalo.
  it("trong Zalo → gọi openInZalo (openWebview), không mở tab", () => {
    const openInZalo = vi.fn(() => Promise.resolve());
    const fallback = vi.fn();
    openExternal("https://maps.app.goo.gl/x", { inZalo: true, openInZalo, fallback });
    expect(openInZalo).toHaveBeenCalledWith({ url: "https://maps.app.goo.gl/x" });
    expect(fallback).not.toHaveBeenCalled();
  });
  it("ngoài Zalo → mở tab NGAY (đồng bộ trong lúc bấm, trình duyệt không chặn), không gọi SDK", () => {
    const openInZalo = vi.fn(() => Promise.resolve());
    const fallback = vi.fn();
    openExternal("https://maps.app.goo.gl/x", { inZalo: false, openInZalo, fallback });
    expect(fallback).toHaveBeenCalledWith("https://maps.app.goo.gl/x");
    expect(openInZalo).not.toHaveBeenCalled();
  });
  it("trong Zalo mà openInZalo lỗi → vẫn thử mở bằng trình duyệt", async () => {
    const fallback = vi.fn();
    openExternal("https://x", { inZalo: true, openInZalo: () => Promise.reject(new Error("deny")), fallback });
    await Promise.resolve(); await Promise.resolve();
    expect(fallback).toHaveBeenCalledWith("https://x");
  });
});
