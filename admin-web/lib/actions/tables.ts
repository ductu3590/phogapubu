'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { previewBulkTables } from '@/lib/bulk-tables'
import { DELETE_TABLE_HAS_ORDERS_ERROR } from '@/lib/table-close'

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

// Xoá bàn — trả về { error } thay vì throw để không làm crash trang.
export async function deleteTable(tableId: string): Promise<{ error?: string }> {
  const storeId = await getStoreId() // xác thực user + lấy đúng quán
  const admin = createAdminClient()

  // Bàn đã có đơn hàng thì KHÔNG xoá cứng: orders.table_id là khoá ngoại RESTRICT,
  // xoá sẽ vỡ và làm mất liên kết lịch sử đơn/doanh thu. Hướng dẫn "Đóng bàn" thay vì xoá —
  // chữ trong câu phải khớp đúng nhãn nút trên thẻ bàn (lib/table-close.ts).
  const { count } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('table_id', tableId)
  if (count && count > 0) {
    return { error: DELETE_TABLE_HAS_ORDERS_ERROR }
  }

  const { error } = await admin
    .from('tables')
    .delete()
    .eq('id', tableId)
    .eq('store_id', storeId) // chỉ xoá bàn của đúng quán mình
  if (error) return { error: `Không xoá được bàn: ${error.message}` }
  revalidatePath('/admin/tables')
  return {}
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
