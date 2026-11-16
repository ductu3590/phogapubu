'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { previewBulkTables } from '@/lib/bulk-tables'
import { pickHistoryTarget, type DeletableTable } from '@/lib/table-delete'

async function getStoreId(): Promise<string> {
  return requireStoreOwnerStoreId()
}

// Thêm bàn mới — kèm khu (PA-3). Khu phải thuộc quán mình: id khu do client gửi nên kiểm lại theo store_id.
export async function addTable(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const areaId = (formData.get('area_id') as string | null) || null
  if (areaId) {
    const { data: area } = await admin.from('table_areas').select('id').eq('id', areaId).eq('store_id', storeId).maybeSingle()
    if (!area) throw new Error('Không tìm thấy khu')
  }
  const { error } = await admin.from('tables').insert({
    store_id: storeId,
    table_number: formData.get('table_number') as string,
    is_active: true,
    area_id: areaId,
  })
  if (error) throw new Error(`addTable: ${error.message}`)
  revalidatePath('/admin/tables')
  revalidatePath('/admin/pos')
}

// Đóng bàn (is_active=false) / Mở lại bàn (true). Bàn đóng biến khỏi sơ đồ POS, màn nhân viên, in QR
// hàng loạt; khách quét QR bàn đóng không gọi món được. Tên bàn vẫn còn trên hoá đơn / báo cáo cũ.
// Bàn đang có khách hoặc đang giữ cho lượt đặt bàn thì DB từ chối (trigger mig 138) — câu báo lỗi
// của trigger trả thẳng ra giao diện. Lỗi trả {ok:false}, không ném.
export async function setTableActive(
  tableId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let storeId: string
  try {
    storeId = await getStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }
  if (typeof tableId !== 'string' || !tableId || typeof isActive !== 'boolean') {
    return { ok: false, error: 'Dữ liệu không hợp lệ' }
  }
  const admin = createAdminClient()
  // Lọc store_id (vá 2026-10-08): biết id bàn quán khác cũng không đổi được.
  const { data, error } = await admin
    .from('tables')
    .update({ is_active: isActive })
    .eq('id', tableId)
    .eq('store_id', storeId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Không tìm thấy bàn' }
  revalidatePath('/admin/tables')
  revalidatePath('/admin/pos')
  return { ok: true }
}

// Xoá một hoặc nhiều bàn — KỂ CẢ bàn đã từng có đơn (anh Tú 2026-11-16). Đơn, phiên, đặt bàn cũ… của bàn bị xoá
// dồn sang "bàn nhận" (pickHistoryTarget: bàn đầu tiên theo tên tự nhiên trong số bàn còn lại — cùng bàn mà câu xác
// nhận ở giao diện đã nêu) để báo cáo không mất doanh thu. Mọi việc chạy trong MỘT giao dịch ở RPC
// delete_tables_keep_history (mig 142, chỉ service_role); RPC tự chặn bàn đang có khách / đang giữ cho đặt bàn.
// Lỗi người dùng trả {ok:false}, không ném.
export async function deleteTables(tableIds: string[]): Promise<
  { ok: true; deleted: number; movedOrders: number; targetName: string | null } | { ok: false; error: string }
> {
  let storeId: string
  try {
    storeId = await getStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }
  if (!Array.isArray(tableIds) || tableIds.length === 0 || !tableIds.every((x) => typeof x === 'string' && x)) {
    return { ok: false, error: 'Chưa chọn bàn nào để xoá' }
  }
  const ids = [...new Set(tableIds)]
  const admin = createAdminClient()
  const { data, error: readErr } = await admin.from('tables').select('id, table_number, is_active').eq('store_id', storeId)
  if (readErr) return { ok: false, error: `Không đọc được danh sách bàn: ${readErr.message}` }
  const tables = (data ?? []) as DeletableTable[]
  if (!ids.every((x) => tables.some((t) => t.id === x))) {
    return { ok: false, error: 'Có bàn không thuộc quán hoặc đã bị xoá. Tải lại trang rồi chọn lại.' }
  }
  const target = pickHistoryTarget(tables, ids)

  const { data: res, error } = await admin.rpc('delete_tables_keep_history', {
    p_store_id: storeId,
    p_table_ids: ids,
    p_target_table_id: target?.id ?? null,
  })
  if (error) return { ok: false, error: error.message }
  const r = (res ?? {}) as { deleted?: number; moved_orders?: number; target_table_id?: string | null }
  revalidatePath('/admin/tables')
  revalidatePath('/admin/pos')
  return {
    ok: true,
    deleted: r.deleted ?? 0,
    movedOrders: r.moved_orders ?? 0,
    targetName: r.target_table_id ? (tables.find((t) => t.id === r.target_table_id)?.table_number ?? null) : null,
  }
}

// Tạo nhiều bàn một lần ("A" + 1→20), vào một khu. Tên trùng bàn đang có (kể cả bàn đã Đóng) bị bỏ qua.
// Lỗi người dùng trả {ok:false}, không ném (Next production giấu nội dung lỗi ném).
export async function addTablesBulk(input: { areaId: string | null; prefix: string; from: number; to: number }): Promise<
  { ok: true; created: string[]; skipped: string[] } | { ok: false; error: string }
> {
  let storeId: string
  try {
    storeId = await getStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }
  // Đầu vào đến từ client: sai kiểu thì trả lỗi, không ném
  if (typeof input?.prefix !== 'string' || typeof input.from !== 'number' || typeof input.to !== 'number') {
    return { ok: false, error: 'Dữ liệu tạo bàn không hợp lệ' }
  }
  // Kiểm cỡ lô trước khi chạm DB (tên trùng chưa biết nên so với danh sách rỗng)
  const shape = previewBulkTables(input, [])
  if (!shape.ok) return shape

  const admin = createAdminClient()
  const areaId = input.areaId || null
  if (areaId) {
    const { data: area } = await admin.from('table_areas').select('id').eq('id', areaId).eq('store_id', storeId).maybeSingle()
    if (!area) return { ok: false, error: 'Không tìm thấy khu' }
  }
  const { data: existing, error: readErr } = await admin.from('tables').select('table_number').eq('store_id', storeId)
  if (readErr) return { ok: false, error: `Không đọc được danh sách bàn: ${readErr.message}` }
  const names = ((existing ?? []) as Array<{ table_number: string }>).map((r) => r.table_number)
  const plan = previewBulkTables(input, names)
  if (!plan.ok) return plan
  if (plan.create.length === 0) return { ok: true, created: [], skipped: plan.skipped }

  // Không đặt pos_x/pos_y: POS tự xếp lưới như bàn thêm lẻ
  const { error } = await admin.from('tables').insert(
    plan.create.map((table_number) => ({ store_id: storeId, table_number, is_active: true, area_id: areaId })),
  )
  if (error) return { ok: false, error: `Không tạo được bàn: ${error.message}` }
  revalidatePath('/admin/tables')
  revalidatePath('/admin/pos')
  return { ok: true, created: plan.create, skipped: plan.skipped }
}
