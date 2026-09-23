import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
beforeEach(() => { storage.clear(); vi.resetModules(); (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k), clear: () => storage.clear(), key: () => null, length: 0 }; });

describe("preorder cart", () => {
  it("tách giỏ theo booking và không đụng mevo_cart QR", async () => {
    const { usePreorderCartStore } = await import("./preorder-cart.store");
    const s = usePreorderCartStore.getState();
    s.add("store", "booking-a", { productId: "pho", productName: "Phở", basePrice: 80000, productImage: "", selectedVariants: [], quantity: 1 });
    s.add("store", "booking-b", { productId: "ga", productName: "Gà", basePrice: 120000, productImage: "", selectedVariants: [], quantity: 1 });
    expect(s.items("store", "booking-a")).toHaveLength(1);
    expect(s.items("store", "booking-b")).toHaveLength(1);
    expect(storage.has("mevo_cart")).toBe(false);
  });
});
