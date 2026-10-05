import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openExternal } from "./open-external";

describe("openExternal — nút Chỉ đường", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("trong Zalo: openOutApp xong nhanh → KHÔNG mở thêm tab", async () => {
    const fallback = vi.fn();
    openExternal("https://maps.app.goo.gl/x", { openOutApp: () => Promise.resolve(), fallback, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("ngoài Zalo: openOutApp treo im (không xong, không lỗi) → sau 1,5s mở tab trình duyệt", async () => {
    const fallback = vi.fn();
    openExternal("https://maps.app.goo.gl/x", { openOutApp: () => new Promise<void>(() => {}), fallback, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(1499);
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fallback).toHaveBeenCalledWith("https://maps.app.goo.gl/x");
  });

  it("openOutApp báo lỗi → mở tab ngay, chỉ một lần", async () => {
    const fallback = vi.fn();
    openExternal("https://x", { openOutApp: () => Promise.reject(new Error("no bridge")), fallback, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fallback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("openOutApp ném lỗi đồng bộ → vẫn mở tab", async () => {
    const fallback = vi.fn();
    openExternal("https://x", { openOutApp: () => { throw new Error("sync"); }, fallback, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
