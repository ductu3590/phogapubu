import { describe, expect, it } from "vitest";
import { movedTableNotice } from "./session-moved";
import type { TableSessionState } from "@/types/order.types";

describe("movedTableNotice — thu ngân chuyển bàn của khách", () => {
  it("state moved → trả bàn mới + lời báo", () => {
    const st: TableSessionState = {
      mode: "postpay", state: "moved", session_id: "s1", table_id: "t12", table_number: "Bàn 12",
    };
    expect(movedTableNotice("Bàn 4", st)).toEqual({
      tableId: "t12",
      tableNumber: "Bàn 12",
      message: "Bàn của bạn đã chuyển sang Bàn 12",
      entryContext: { kind: "table", tableId: "t12", tableNumber: "Bàn 12" },
    });
  });
  it("owner / free / prepay → null", () => {
    expect(movedTableNotice("Bàn 4", { mode: "postpay", state: "free" })).toBeNull();
    expect(movedTableNotice("Bàn 4", { mode: "prepay" })).toBeNull();
    expect(movedTableNotice("Bàn 4", {
      mode: "postpay", state: "owner", session_id: "s1", opened_at: "x", order_count: 1, total: 1000,
    })).toBeNull();
  });
});
