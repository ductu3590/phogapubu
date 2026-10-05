import { getOrCreateDeviceId } from "@/services/device-id";
import { supabase } from "@/services/supabase";

// Câu server ném khi đang trong khoảng chặn (mig 087). Nhận diện theo câu chữ vì
// bản server cũ (trước 087) cũng ném đúng câu này nhưng không có DETAIL.
const COOLDOWN_MESSAGE = "Vui lòng chờ trước khi gọi nhân viên lần nữa";

export class CallStaffCooldownError extends Error {
  constructor(readonly retryAt: Date | null) {
    super(COOLDOWN_MESSAGE);
    this.name = "CallStaffCooldownError";
  }
}

/** Khách chỉ ping qua RPC; server tự suy quán/mâm và chống spam 3 phút (mig 087). */
export async function pingCallStaff(tableId: string): Promise<void> {
  const { error } = await supabase.rpc("ping_service_request", {
    p_table_id: tableId,
    p_type: "call_staff",
    p_device_id: getOrCreateDeviceId(),
  });
  if (!error) return;
  if (error.message === COOLDOWN_MESSAGE) {
    const at = typeof error.details === "string" ? new Date(error.details) : null;
    throw new CallStaffCooldownError(at && !Number.isNaN(at.getTime()) ? at : null);
  }
  throw error;
}
