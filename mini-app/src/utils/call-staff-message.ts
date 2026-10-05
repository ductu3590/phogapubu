import { CallStaffCooldownError } from "@/services/service-request";

const COOLDOWN_MS = 3 * 60 * 1000; // khớp mig 087
const hhmm = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

export function callStaffMessage(result: { ok: true } | { ok: false; error: unknown }): { text: string; type: "success" | "warning" | "error" } {
  if (result.ok) return { text: "Đã gọi nhân viên, vui lòng chờ trong giây lát", type: "success" };
  if (result.error instanceof CallStaffCooldownError) {
    const retry = result.error.retryAt;
    if (!retry) return { text: "Bạn vừa gọi nhân viên, vui lòng chờ ít phút", type: "warning" };
    return { text: `Bạn vừa gọi lúc ${hhmm(new Date(retry.getTime() - COOLDOWN_MS))}, có thể gọi lại sau ${hhmm(retry)}`, type: "warning" };
  }
  return { text: "Chưa gọi được, kiểm tra mạng rồi thử lại", type: "error" };
}
