import { supabase } from "../supabase";

// Vòng quay may mắn (Sprint v2.3). Kết quả do SERVER quyết định (RPC).
export type SpinReward = { id: string; label: string; type: "gift" | "none" };

export type SpinResult = {
  result_id: string;
  reward_id: string | null;
  label: string;
  type: "gift" | "none";
  code: string;
  redeem_status: "won" | "redeemed";
};

export type SpinState =
  | { status: "not_eligible" | "disabled" }
  | { status: "available"; rewards: SpinReward[] }
  | { status: "done"; already: boolean; rewards: SpinReward[]; result: SpinResult };

export const spinService = {
  // Trạng thái vòng quay của đơn (read-only, KHÔNG tạo lượt quay)
  getState: async (orderId: string): Promise<SpinState> => {
    const { data, error } = await supabase.rpc("get_spin_state", {
      p_order_id: orderId,
    });
    if (error) throw error;
    return data as unknown as SpinState;
  },

  // Quay (idempotent 1 lượt/đơn) — server chốt kết quả
  spin: async (orderId: string): Promise<SpinState> => {
    const { data, error } = await supabase.rpc("spin_wheel", {
      p_order_id: orderId,
    });
    if (error) throw error;
    return data as unknown as SpinState;
  },
};
