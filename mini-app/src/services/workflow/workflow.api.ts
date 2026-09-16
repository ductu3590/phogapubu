import { supabase } from "@/services/supabase";
import type { PublicWorkflow } from "@/types/workflow.types";

type PublicWorkflowPayload = {
  table_ordering_enabled: boolean;
  takeaway_enabled: boolean;
  shipping_enabled: boolean;
  reservations_enabled: boolean;
};

export async function getPublicWorkflow(storeId: string): Promise<PublicWorkflow> {
  const { data, error } = await supabase.rpc("get_public_store_workflow", {
    p_store_id: storeId,
  });

  if (error) throw error;
  if (!data) throw new Error("Không tải được cấu hình quán");

  const workflow = data as unknown as PublicWorkflowPayload;
  return {
    tableOrderingEnabled: workflow.table_ordering_enabled,
    takeawayEnabled: workflow.takeaway_enabled,
    shippingEnabled: workflow.shipping_enabled,
    reservationsEnabled: workflow.reservations_enabled,
  };
}
