import { describe, expect, it } from "vitest";
import { parseBootstrap } from "./bootstrap";

const store = { id: "s1", slug: "yen-garden", name: "Yên Garden", primary_color: "#3E4728", mini_app_theme: "garden" };

describe("parseBootstrap", () => {
  it("đủ quán + bàn + workflow + giảm giá", () => {
    const out = parseBootstrap({
      store,
      table: { id: "t1", table_number: "A1" },
      workflow: { table_ordering_enabled: true },
      discounts: { items: [] },
    });
    expect(out?.store.id).toBe("s1");
    expect(out?.table).toEqual({ id: "t1", table_number: "A1" });
    expect(out?.workflow).toEqual({ table_ordering_enabled: true });
    expect(out?.discounts).toEqual({ items: [] });
  });

  it("lối vào thường: không có bàn, workflow thiếu → null từng phần, vẫn có quán", () => {
    const out = parseBootstrap({ store, table: null, workflow: null });
    expect(out?.table).toBeNull();
    expect(out?.workflow).toBeNull();
    expect(out?.discounts).toBeNull();
  });

  it("bàn sai hình dạng coi như không có bàn", () => {
    expect(parseBootstrap({ store, table: { id: 5 } })?.table).toBeNull();
    expect(parseBootstrap({ store, table: "A1" })?.table).toBeNull();
  });

  it("không có quán / quán thiếu id → null", () => {
    for (const data of [null, undefined, "x", [], {}, { store: null }, { store: { slug: "a", name: "b" } }, { store: { id: "", slug: "a", name: "b" } }]) {
      expect(parseBootstrap(data)).toBeNull();
    }
  });
});
