'use server'

import { createClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import type { FloorSnapshot } from '@/lib/area-layout'

export type FloorResult = { ok: true; snapshot: FloorSnapshot } | { ok: false; error: string }

export async function loadFloorLayout(): Promise<FloorResult> {
  try {
    await requireStoreOwnerStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('pos_get_floor_layout')
    if (error) return { ok: false, error: `Không tải được sơ đồ: ${error.message}` }
    if (!data) return { ok: false, error: 'Không tìm thấy sơ đồ của quán' }
    return { ok: true, snapshot: data as FloorSnapshot }
  } catch {
    return { ok: false, error: 'Không tải được sơ đồ. Kiểm tra kết nối và quyền chủ quán.' }
  }
}

export async function saveFloorLayout(snapshot: FloorSnapshot): Promise<FloorResult> {
  try {
    await requireStoreOwnerStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('pos_save_floor_layout', {
      p_version: snapshot.version,
      p_areas: snapshot.areas,
      p_tables: snapshot.tables.map(t => ({ id: t.id, area_id: t.area_id, pos_x: t.pos_x, pos_y: t.pos_y })),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, snapshot: data as FloorSnapshot }
  } catch {
    return { ok: false, error: 'Chưa xác nhận lưu thành công. Kiểm tra mạng và tải lại sơ đồ trước khi thử lại.' }
  }
}
