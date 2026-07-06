// Giờ phục vụ: quán có đang nhận đơn ngay lúc này không.
// Logic phải khớp hệt hàm SQL store_accepting_now (migration 017) — client dùng để
// hiện/ẩn UI, server (create_order) mới là chốt chặn thật.

export interface ServingShift {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

export interface StoreHoursConfig {
  isAcceptingOrders: boolean;
  servingHours: ServingShift[];
}

// "HH:mm" -> số phút trong ngày. Chuỗi hỏng -> null (bỏ qua ca đó).
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Giờ hiện tại theo Asia/Ho_Chi_Minh, tính bằng phút trong ngày.
function hcmMinutesNow(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const min = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // "24:00" ở một số môi trường -> quy về 0
  return (h % 24) * 60 + min;
}

function inShift(nowMin: number, shift: ServingShift): boolean {
  const open = toMinutes(shift.open);
  const close = toMinutes(shift.close);
  if (open === null || close === null) return false;
  if (open === close) return true; // ca 24h
  if (open < close) return nowMin >= open && nowMin < close;
  return nowMin >= open || nowMin < close; // ca qua đêm
}

// Quán có đang nhận đơn không.
export function isStoreOpen(config: StoreHoursConfig, now: Date = new Date()): boolean {
  if (!config.isAcceptingOrders) return false;
  const shifts = config.servingHours ?? [];
  if (shifts.length === 0) return true; // mở cả ngày
  const nowMin = hcmMinutesNow(now);
  return shifts.some((s) => inShift(nowMin, s));
}

// Chuỗi hiển thị khung giờ, VD "06:00–14:00 · 17:00–22:00". Rỗng -> "".
export function formatServingHours(shifts: ServingShift[]): string {
  return (shifts ?? [])
    .filter((s) => toMinutes(s.open) !== null && toMinutes(s.close) !== null)
    .map((s) => `${s.open}–${s.close}`)
    .join(" · ");
}
