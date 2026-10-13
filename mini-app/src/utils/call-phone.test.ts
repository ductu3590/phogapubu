import { describe, expect, it, vi } from "vitest";
import { callPhone } from "./call-phone";

describe("callPhone — nút Gọi ngay", () => {
  it("trong Zalo → openPhone với số đã bỏ dấu cách, không dùng tel:", () => {
    const openInZalo = vi.fn(() => Promise.resolve());
    const fallback = vi.fn();
    callPhone("0912 345 678", { inZalo: true, openInZalo, fallback });
    expect(openInZalo).toHaveBeenCalledWith({ phoneNumber: "0912345678" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("ngoài Zalo (npm run dev) → tel:", () => {
    const openInZalo = vi.fn(() => Promise.resolve());
    const fallback = vi.fn();
    callPhone("0912.345.678", { inZalo: false, openInZalo, fallback });
    expect(fallback).toHaveBeenCalledWith("tel:0912345678");
    expect(openInZalo).not.toHaveBeenCalled();
  });

  it("openPhone báo lỗi → rơi về tel:", async () => {
    const openInZalo = vi.fn(() => Promise.reject(new Error("x")));
    const fallback = vi.fn();
    callPhone("0912345678", { inZalo: true, openInZalo, fallback });
    await Promise.resolve();
    await Promise.resolve();
    expect(fallback).toHaveBeenCalledWith("tel:0912345678");
  });

  it("openPhone ném đồng bộ → rơi về tel:", () => {
    const openInZalo = vi.fn(() => { throw new Error("x"); });
    const fallback = vi.fn();
    callPhone("0912345678", { inZalo: true, openInZalo, fallback });
    expect(fallback).toHaveBeenCalledWith("tel:0912345678");
  });

  it("giữ dấu + của mã quốc tế", () => {
    const openInZalo = vi.fn(() => Promise.resolve());
    callPhone("+84 912 345 678", { inZalo: true, openInZalo, fallback: vi.fn() });
    expect(openInZalo).toHaveBeenCalledWith({ phoneNumber: "+84912345678" });
  });
});
