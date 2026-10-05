import { describe, expect, it } from "vitest";
import { dateChips } from "./date-chips";

describe("dateChips — chip chọn ngày đặt bàn (m02)", () => {
  it("ngày đầu là HÔM NAY theo localToday server trả (giờ VN), không theo đồng hồ máy", () => {
    const chips = dateChips("2026-10-05", "2026-10-07", "2026-10-05");
    expect(chips).toEqual([
      { value: "2026-10-05", top: "HÔM NAY", day: "05", month: "Th10" },
      { value: "2026-10-06", top: "T3", day: "06", month: "Th10" },
      { value: "2026-10-07", top: "T4", day: "07", month: "Th10" },
    ]);
  });
  it("Chủ nhật ghi CN; qua tháng / qua năm đúng", () => {
    const chips = dateChips("2026-12-31", "2027-01-03", "2026-12-30");
    expect(chips.map((c) => `${c.top} ${c.day}/${c.month}`)).toEqual(["T5 31/Th12", "T6 01/Th1", "T7 02/Th1", "CN 03/Th1"]);
  });
  it("tối đa 14 chip", () => {
    expect(dateChips("2026-10-01", "2026-12-31", "2026-10-01")).toHaveLength(14);
  });
  it("dữ liệu hỏng / min > max → rỗng", () => {
    expect(dateChips("", "2026-10-05", "2026-10-05")).toEqual([]);
    expect(dateChips("2026-10-09", "2026-10-05", "2026-10-05")).toEqual([]);
  });
});
