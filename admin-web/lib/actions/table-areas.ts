'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { nextAreaColor, parseAreaColor } from '@/lib/area-colors'
import { revalidatePath } from 'next/cache'

// Quản lý KHU ở tab Sơ đồ bàn & QR (PA-3) — chỉ chủ quán. Dùng service key nên MỌI câu đọc/ghi lọc
// store_id lấy từ phiên đăng nhập (không tin id client gửi — bài học PA-2). Ghi bảng tables / table_areas
// làm tăng table_layout_version (trigger mig 048) → bản nháp "Sắp xếp bàn" đang mở ở POS hết hiệu lực,
// POS báo tải lại thay vì ghi đè ngầm.

type Result = { ok: true } | { ok: false; error: string }
type AreaRow = { id: string; name: string; color: string; sort_order: number }

async function owner(): Promise<{ storeId: string } | { error: string }> {
  try {
    return { storeId: await requireStoreOwnerStoreId() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không có quyền' }
  }
}

async function storeAreas(storeId: string): Promise<AreaRow[]> {
  const { data } = await createAdminClient().from('table_areas').select('id, name, color, sort_order').eq('store_id', storeId)
  return (data ?? []) as AreaRow[]
}

function checkName(raw: string, areas: AreaRow[], selfId: string | null): { name: string } | { error: string } {
  const name = (raw ?? '').trim()
  if (name.length < 1 || name.length > 60) return { error: 'Tên khu từ 1 đến 60 ký tự' }
  const dup = areas.find((a) => a.id !== selfId && a.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))
  return dup ? { error: `Đã có khu tên «${dup.name}»` } : { name }
}

function done(): Result {
  revalidatePath('/admin/tables')
  revalidatePath('/admin/pos')
  return { ok: true }
}

export async function createArea(name: string, color?: string): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const areas = await storeAreas(o.storeId)
  const checked = checkName(name, areas, null)
  if ('error' in checked) return { ok: false, error: checked.error }
  const { error } = await createAdminClient().from('table_areas').insert({
    store_id: o.storeId,
    name: checked.name,
    color: color ? parseAreaColor(color) : nextAreaColor(areas.map((a) => a.color)),
    sort_order: Math.max(0, ...areas.map((a) => a.sort_order)) + 1,
  })
  if (error) return { ok: false, error: `Không tạo được khu: ${error.message}` }
  return done()
}

export async function updateArea(areaId: string, patch: { name?: string; color?: string }): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const areas = await storeAreas(o.storeId)
  if (!areas.some((a) => a.id === areaId)) return { ok: false, error: 'Không tìm thấy khu' }
  const update: { name?: string; color?: string } = {}
  if (patch.name !== undefined) {
    const checked = checkName(patch.name, areas, areaId)
    if ('error' in checked) return { ok: false, error: checked.error }
    update.name = checked.name
  }
  if (patch.color !== undefined) update.color = parseAreaColor(patch.color)
  const { error } = await createAdminClient().from('table_areas').update(update).eq('id', areaId).eq('store_id', o.storeId)
  if (error) return { ok: false, error: `Không lưu được khu: ${error.message}` }
  return done()
}

export async function deleteArea(areaId: string): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const areas = await storeAreas(o.storeId)
  if (!areas.some((a) => a.id === areaId)) return { ok: false, error: 'Không tìm thấy khu' }
  const { data: inArea } = await createAdminClient().from('tables').select('id').eq('store_id', o.storeId).eq('area_id', areaId)
  const n = (inArea ?? []).length
  if (n > 0) return { ok: false, error: `Khu còn ${n} bàn — chuyển hết bàn sang khu khác trước` }
  const { error } = await createAdminClient().from('table_areas').delete().eq('id', areaId).eq('store_id', o.storeId)
  if (error) return { ok: false, error: `Không xoá được khu: ${error.message}` }
  return done()
}

export async function setTableArea(tableId: string, areaId: string | null): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const admin = createAdminClient()
  const { data: table } = await admin.from('tables').select('id').eq('id', tableId).eq('store_id', o.storeId).maybeSingle()
  if (!table) return { ok: false, error: 'Không tìm thấy bàn' }
  if (areaId && !(await storeAreas(o.storeId)).some((a) => a.id === areaId)) return { ok: false, error: 'Không tìm thấy khu' }
  const { error } = await admin.from('tables').update({ area_id: areaId }).eq('id', tableId).eq('store_id', o.storeId)
  if (error) return { ok: false, error: `Không chuyển được bàn: ${error.message}` }
  return done()
}
