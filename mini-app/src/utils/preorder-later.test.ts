import { describe, expect, it } from "vitest";
import { isPreorderPostponed, postponePreorder } from "./preorder-later";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("Để sau chọn món đặt trước — nhớ theo từng lượt đặt", () => {
  it("bấm Để sau → lượt đó ẩn nút, lượt khác không bị ảnh hưởng", () => {
    const s = memory();
    expect(isPreorderPostponed("store", "r1", s)).toBe(false);
    postponePreorder("store", "r1", s);
    expect(isPreorderPostponed("store", "r1", s)).toBe(true);
    expect(isPreorderPostponed("store", "r2", s)).toBe(false);
    expect(isPreorderPostponed("other-store", "r1", s)).toBe(false);
  });
  it("bộ nhớ trình duyệt bị chặn → không lỗi, coi như chưa bấm", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(() => postponePreorder("store", "r1", broken)).not.toThrow();
    expect(isPreorderPostponed("store", "r1", broken)).toBe(false);
  });
});
