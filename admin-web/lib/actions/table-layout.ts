'use server'

import { createClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import type { PositionPatch } from '@/lib/table-layout'

export type SaveLayoutResult = { ok: true } | { ok: false; error: string }

/**
 * Lưu vị trí các bàn vừa kéo. Chỉ chủ quán (requireStoreOwnerStoreId fail-closed).
 *
 * Dùng createClient() — phiên đăng nhập thật — chứ KHÔNG createAdminClient(): policy
 * auth_update_tables (mig 006b) đã giới hạn theo đúng quán, để RLS làm việc của nó thay vì
 * cầm service role đi vòng qua. Mỗi bàn một câu update kèm .eq('store_id') làm chốt chặn thứ hai.
 */
export async function saveTableLayout(patches: PositionPatch[]): Promise<SaveLayoutResult> {
  if (patches.length === 0) return { ok: true }

  let storeId: string
  try {
    storeId = await requireStoreOwnerStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }

  const supabase = await createClient()
  for (const p of patches) {
    const { error } = await supabase
      .from('tables')
      .update({ pos_x: p.pos_x, pos_y: p.pos_y })
      .eq('id', p.id)
      .eq('store_id', storeId)
    if (error) return { ok: false, error: `Không lưu được vị trí bàn: ${error.message}` }
  }
  return { ok: true }
}
