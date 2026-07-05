'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'

export type RewardInput = {
  id?: string
  label: string
  type: 'gift' | 'none'
  weight: number
  is_active: boolean
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
    .map((r) => ({
      id: r.id,
      label: (r.label ?? '').trim(),
      type: r.type === 'none' ? 'none' : 'gift',
      weight: Math.max(1, Math.floor(Number(r.weight) || 1)),
      is_active: !!r.is_active,
    }))
    .filter((r) => r.label.length > 0)

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
