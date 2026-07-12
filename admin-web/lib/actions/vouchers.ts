'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { generateShipperCode } from '@/lib/voucher-code'

export type ActionResult = { error?: string }

export type ShipperVoucherInput = {
  label: string                       // tên shipper, VD "Shipper Tuấn Anh"
  discount_type: 'fixed' | 'percent'
  discount_value: number
  max_discount: number | null         // chỉ dùng khi percent
  daily_limit: number | null          // NULL = không giới hạn/ngày
}

// Tạo mã shipper. Code TỰ SINH khó đoán (SHIP-XXXXXX), retry nếu trùng (unique per store).
export async function createShipperVoucher(input: ShipperVoucherInput): Promise<ActionResult> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()

  const label = (input.label ?? '').trim()
  if (!label) return { error: 'Nhập tên shipper (để nhớ mã của ai).' }
  const value = Math.floor(Number(input.discount_value) || 0)
  if (value <= 0) return { error: 'Mức giảm phải lớn hơn 0.' }
  if (input.discount_type === 'percent' && value > 100) {
    return { error: 'Phần trăm giảm tối đa 100.' }
  }
  const dailyLimit =
    input.daily_limit == null ? null : Math.max(1, Math.floor(Number(input.daily_limit)))
  const maxDiscount =
    input.discount_type === 'percent' && input.max_discount != null
      ? Math.max(1, Math.floor(Number(input.max_discount)))
      : null

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShipperCode()
    const { error } = await admin.from('vouchers').insert({
      store_id: storeId,
      code,
      kind: 'shipper',
      label,
      discount_type: input.discount_type,
      discount_value: value,
      max_discount: maxDiscount,
      daily_limit: dailyLimit,
    })
    if (!error) {
      revalidatePath('/admin/vouchers')
      return {}
    }
    if (error.code !== '23505') return { error: `Lỗi tạo mã: ${error.message}` } // không phải trùng code
  }
  return { error: 'Không sinh được code (trùng nhiều lần), thử lại.' }
}

// Bật/tắt mã (thu hồi = tắt — chặn ngay từ đơn sau, lịch sử giữ nguyên)
export async function setVoucherActive(id: string, active: boolean): Promise<ActionResult> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('vouchers')
    .update({ is_active: active })
    .eq('id', id)
    .eq('store_id', storeId)
  if (error) return { error: `Lỗi cập nhật: ${error.message}` }
  revalidatePath('/admin/vouchers')
  return {}
}
