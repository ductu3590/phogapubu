import { describe, expect, it } from "vitest";
import { canOrderInEntry, parseEntryContext, rootCapabilities } from "./entry-context";

const PUBU_PUBLIC_WORKFLOW = {
  tableOrderingEnabled: true,
  takeawayEnabled: true,
  shippingEnabled: true,
  reservationsEnabled: false,
};

const BAO_LUONG_PUBLIC_WORKFLOW = {
  tableOrderingEnabled: true,
  takeawayEnabled: false,
  shippingEnabled: false,
  reservationsEnabled: true,
};

describe("entry context", () => {
  it("coi QR thiếu table là lối vào root, không suy thành mang về", () => {
    expect(parseEntryContext(new URLSearchParams("store=pho-ga-pubu"))).toEqual({ kind: "root" });
  });

  it("giữ ngữ cảnh gọi món khi QR có đủ table id và table number", () => {
    expect(
      parseEntryContext(new URLSearchParams("table=t1&tableNumber=B%C3%A0n%201")),
    ).toEqual({ kind: "table", tableId: "t1", tableNumber: "Bàn 1" });
  });

  it("giữ tương thích QR bàn cũ chỉ có table id", () => {
    expect(parseEntryContext(new URLSearchParams("table=t1"))).toEqual({
      kind: "table",
      tableId: "t1",
      tableNumber: "",
    });
  });
});

describe("root capabilities", () => {
  it("giữ mang về và ship cho Pubu ở root", () => {
    expect(rootCapabilities(PUBU_PUBLIC_WORKFLOW)).toEqual({
      readOnlyMenu: false,
      pickup: true,
      delivery: true,
      reservation: false,
    });
  });

  it("khoá đặt món root của Bảo Lương nhưng vẫn cho đặt bàn", () => {
    expect(rootCapabilities(BAO_LUONG_PUBLIC_WORKFLOW)).toEqual({
      readOnlyMenu: true,
      pickup: false,
      delivery: false,
      reservation: true,
    });
  });
});

describe("quyền gọi món theo lối vào", () => {
  it("không cho root Bảo Lương tạo đơn nhưng QR bàn vẫn gọi món", () => {
    expect(canOrderInEntry(BAO_LUONG_PUBLIC_WORKFLOW, { kind: "root" })).toBe(false);
    expect(
      canOrderInEntry(BAO_LUONG_PUBLIC_WORKFLOW, {
        kind: "table",
        tableId: "table-1",
        tableNumber: "Bàn 1",
      }),
    ).toBe(true);
  });

  it("chặn gọi món QR khi quán tắt table ordering", () => {
    expect(
      canOrderInEntry(
        { ...PUBU_PUBLIC_WORKFLOW, tableOrderingEnabled: false },
        { kind: "table", tableId: "table-1", tableNumber: "Bàn 1" },
      ),
    ).toBe(false);
  });
});
