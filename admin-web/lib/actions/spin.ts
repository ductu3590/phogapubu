'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'

export type RewardInput = {
  id?: string
  label: string
  type: 'gift' | 'none' | 'voucher'
  weight: number
  is_active: boolean
  // Chỉ dùng khi type='voucher'
  discount_type?: 'fixed' | 'percent'
  discount_value?: number | null
  max_discount?: number | null
  voucher_days?: number | null
}

// Kết quả trả cho client. Next.js REDACT message của lỗi throw trong production,
// nên lỗi kiểm tra (validation) phải TRẢ VỀ dạng data để hiện đúng câu tiếng Việt.
export type ActionResult = { error?: string }

// Bật/tắt vòng quay. Bật thì phải có ≥1 quà đang bật (khớp điều kiện RPC).
export async function setSpinEnabled(enabled: boolean): Promise<ActionResult> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()

  if (enabled) {
    const { count } = await admin
      .from('spin_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('is_active', true)
    if (!count) {
      return { error: 'Hãy tạo và bấm "Lưu quà" ít nhất 1 ô (đang bật) TRƯỚC, rồi mới bật vòng quay.' }
    }
  }

  const { error } = await admin.from('stores').update({ spin_enabled: enabled }).eq('id', storeId)
  if (error) return { error: `Lỗi lưu trạng thái: ${error.message}` }
  revalidatePath('/admin/spin')
  return {}
}

// Lưu toàn bộ danh sách quà (replace theo id): xoá ô bị bỏ, thêm/sửa ô còn lại.
// sort_order = vị trí trong mảng gửi lên.
export async function saveRewards(rewards: RewardInput[]): Promise<ActionResult> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()

  const clean = rewards
    .map((r) => {
      const type = r.type === 'none' ? 'none' : r.type === 'voucher' ? 'voucher' : 'gift'
      const isVoucher = type === 'voucher'
      return {
        id: r.id,
        label: (r.label ?? '').trim(),
        type,
        weight: Math.max(1, Math.floor(Number(r.weight) || 1)),
        is_active: !!r.is_active,
        discount_type: isVoucher ? (r.discount_type === 'percent' ? 'percent' : 'fixed') : null,
        discount_value: isVoucher ? Math.max(1, Math.floor(Number(r.discount_value) || 0)) : null,
        max_discount:
          isVoucher && r.discount_type === 'percent' && r.max_discount
            ? Math.max(1, Math.floor(Number(r.max_discount)))
            : null,
        voucher_days: isVoucher ? Math.max(1, Math.floor(Number(r.voucher_days) || 30)) : null,
      }
    })
    .filter((r) => r.label.length > 0)

  // Ô voucher phải có mức giảm > 0 (spin_wheel sẽ không phát mã nếu value 0)
  const badVoucher = clean.find((r) => r.type === 'voucher' && (r.discount_value ?? 0) <= 0)
  if (badVoucher) return { error: `Ô "${badVoucher.label}": nhập mức giảm lớn hơn 0.` }
  const badPercent = clean.find(
    (r) => r.type === 'voucher' && r.discount_type === 'percent' && (r.discount_value ?? 0) > 100,
  )
  if (badPercent) return { error: `Ô "${badPercent.label}": phần trăm giảm tối đa 100.` }

  // Xoá các quà không còn trong danh sách (FK spin_results.reward_id ON DELETE SET NULL)
  const keepIds = clean.filter((r) => r.id).map((r) => r.id!)
  let del = admin.from('spin_rewards').delete().eq('store_id', storeId)
  if (keepIds.length > 0) del = del.not('id', 'in', `(${keepIds.join(',')})`)
  const { error: delErr } = await del
  if (delErr) return { error: `Lỗi xoá ô cũ: ${delErr.message}` }

  // Upsert (giữ id cũ để không mất liên kết; ô mới để DB tự sinh id)
  const rows = clean.map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    store_id: storeId,
    label: r.label,
    type: r.type,
    weight: r.weight,
    sort_order: i,
    is_active: r.is_active,
    discount_type: r.discount_type,
    discount_value: r.discount_value,
    max_discount: r.max_discount,
    voucher_days: r.voucher_days ?? 30,
  }))
  if (rows.length > 0) {
    const { error } = await admin.from('spin_rewards').upsert(rows)
    if (error) return { error: `Lỗi lưu quà: ${error.message}` }
  }
  revalidatePath('/admin/spin')
  return {}
}

// Đánh dấu đã đổi thưởng (scope theo store của operator — không đụng quán khác)
export async function redeemSpin(resultId: string) {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('spin_results')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', resultId)
    .eq('store_id', storeId)
    .eq('status', 'won')
  if (error) throw new Error(`redeemSpin: ${error.message}`)
  revalidatePath('/admin/orders')
}
