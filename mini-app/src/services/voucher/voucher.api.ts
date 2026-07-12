import { supabase } from "../supabase";

// Mã giảm giá (spec 2026-07-11). Server là nơi CHỐT quyền dùng + số tiền giảm
// (create_order). estimateDiscount chỉ để client hiển thị/chọn mã tốt nhất.
export type MyVoucher = {
  id: string;
  code: string;
  label: string;
  kind: "spin" | "shipper";
  discount_type: "fixed" | "percent";
  discount_value: number;
  max_discount: number | null;
  expires_at: string | null;
};

export type VoucherCheck =
  | { valid: true; code: string; label: string; discount_amount: number;
      discount_type: "fixed" | "percent"; discount_value: number; max_discount: number | null }
  | { valid: false; reason: string };

// Cùng công thức với SQL voucher_discount() — chỉ dùng để HIỂN THỊ,
// server tính lại khi tạo đơn.
export function estimateDiscount(
  v: Pick<MyVoucher, "discount_type" | "discount_value" | "max_discount">,
  subtotal: number,
): number {
  if (v.discount_type === "fixed") return Math.min(v.discount_value, subtotal);
  return Math.min(
    Math.round((subtotal * v.discount_value) / 100),
    v.max_discount ?? subtotal,
    subtotal,
  );
}

export const voucherService = {
  getMyVouchers: async (storeId: string, zaloUserId: string): Promise<MyVoucher[]> => {
    const { data, error } = await supabase.rpc("get_my_vouchers", {
      p_store_id: storeId,
      p_zalo_user_id: zaloUserId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as MyVoucher[];
  },

  check: async (
    storeId: string,
    code: string,
    zaloUserId: string,
    subtotal: number,
  ): Promise<VoucherCheck> => {
    const { data, error } = await supabase.rpc("check_voucher", {
      p_store_id: storeId,
      p_code: code,
      p_zalo_user_id: zaloUserId,
      p_subtotal: subtotal,
    });
    if (error) throw error;
    return data as unknown as VoucherCheck;
  },
};
