import { getAccessToken, getPhoneNumber } from "zmp-sdk";
import { normalizeVnPhone } from "@/utils/booking-validation";

// Lấy SĐT thật từ Zalo (spec 2026-10-09 §4.1): getPhoneNumber() → token (dùng 1 lần, hết hạn 2 phút)
// → edge function zalo-phone đổi ra số bằng secret của quán. Số chỉ trả về máy khách, server không lưu.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type ZaloPhoneError = "denied" | "not_configured" | "zalo_error" | "network";
export type ZaloPhoneOutcome = { ok: true; phone: string } | { ok: false; error: ZaloPhoneError };

export async function fetchZaloPhone(storeId: string): Promise<ZaloPhoneOutcome> {
  // Luôn xin token mới — token cũ đã dùng hoặc đã hết hạn.
  let token: string | undefined;
  try {
    ({ token } = await getPhoneNumber());
  } catch {
    return { ok: false, error: "denied" };
  }
  if (!token) return { ok: false, error: "denied" };

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return { ok: false, error: "zalo_error" };
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/zalo-phone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ storeId, token, accessToken }),
    });
  } catch {
    return { ok: false, error: "network" };
  }

  const body = (await res.json().catch(() => null)) as { phone?: unknown; error?: unknown } | null;
  if (typeof body?.phone === "string") {
    const normalized = normalizeVnPhone(body.phone);
    return normalized.ok ? { ok: true, phone: normalized.value } : { ok: false, error: "zalo_error" };
  }
  if (body?.error === "not_configured") return { ok: false, error: "not_configured" };
  return { ok: false, error: "zalo_error" };
}

export function zaloPhoneErrorMessage(error: ZaloPhoneError): string {
  switch (error) {
    case "denied":
      return "Bạn chưa cho phép lấy số điện thoại. Bạn có thể nhập tay bên dưới.";
    case "not_configured":
      return "Quán chưa hỗ trợ lấy số từ Zalo. Bạn nhập tay bên dưới nhé.";
    case "network":
      return "Mất kết nối mạng. Bạn thử lại hoặc nhập tay bên dưới.";
    default:
      return "Zalo chưa trả được số điện thoại. Bạn thử lại hoặc nhập tay bên dưới.";
  }
}
