import { getOrCreateDeviceId } from "@/services/device-id";
import { supabase } from "@/services/supabase";

/** Khách chỉ ping qua RPC; server tự suy quán/mâm và chống spam độc lập. */
export async function pingCallStaff(tableId: string): Promise<void> {
  const { error } = await supabase.rpc("ping_service_request", {
    p_table_id: tableId,
    p_type: "call_staff",
    p_device_id: getOrCreateDeviceId(),
  });

  if (error) throw error;
}
