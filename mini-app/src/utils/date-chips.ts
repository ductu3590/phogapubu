// Chip chọn ngày đặt bàn (Stitch m02). Tính hoàn toàn trên chuỗi "YYYY-MM-DD" theo lịch (UTC thuần),
// KHÔNG dùng đồng hồ máy khách — "Hôm nay" lấy từ localToday server trả (giờ Asia/Ho_Chi_Minh).
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MAX_CHIPS = 14;

export type DateChip = { value: string; top: string; day: string; month: string };

const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function dateChips(minimumDate: string, maximumDate: string, localToday: string): DateChip[] {
  const start = parse(minimumDate);
  const end = parse(maximumDate);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [];
  const chips: DateChip[] = [];
  for (let t = start; t <= end && chips.length < MAX_CHIPS; t += 86_400_000) {
    const d = new Date(t);
    const value = iso(t);
    chips.push({
      value,
      top: value === localToday ? "HÔM NAY" : WEEKDAY[d.getUTCDay()],
      day: String(d.getUTCDate()).padStart(2, "0"),
      month: `Th${d.getUTCMonth() + 1}`,
    });
  }
  return chips;
}
