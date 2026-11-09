// Kho (mig 118): bộ đọc phía server cho trang /admin/inventory và trang Món. KHÔNG 'use server' — đây là hàm
// thường gọi từ Server Component sau khi trang đã qua guard; storeId luôn lấy từ guard của trang.
// Đọc bằng createClient (phiên người dùng): RPC tự kiểm quyền theo store_id, DB là khoá thật.
import { loadBusinessDayStart } from '@/lib/actions/bills-report'
import { businessToday } from '@/lib/daily-report'
import { parseMenuStock, parseStockLevels, withoutCost, type MenuStockData, type StockRow } from '@/lib/inventory'
import { createClient } from '@/lib/supabase/server'

type Fail = { ok: false; error: string }

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

/**
 * Tồn kho của quán. `withCost: false` (thu ngân) gỡ giá vốn + giá trị tồn ngay tại server: RPC vẫn trả cho phiên thu
 * ngân (để thẻ hàng đủ trường), nhưng số giá không được tới trình duyệt của vai không phải hậu cần.
 */
export async function readStockLevels(
  storeId: string,
  opts: { withCost?: boolean } = {},
): Promise<{ ok: true; rows: StockRow[] } | Fail> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('inventory_stock_levels', { p_store_id: storeId })
    if (error) return { ok: false, error: error.message }
    const rows = parseStockLevels(data)
    return { ok: true, rows: opts.withCost === false ? withoutCost(rows) : rows }
  } catch (e) {
    return { ok: false, error: message(e, 'Không đọc được tồn kho') }
  }
}

/** Dữ liệu ô "Trừ kho" ở trang Món. RPC lỗi (vd. mig 118 chưa áp, không có quyền) → null: trang Món ẩn ô, không hỏng. */
export async function readMenuStock(storeId: string): Promise<MenuStockData | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('inventory_menu_links', { p_store_id: storeId })
    if (error) return null
    return parseMenuStock(data)
  } catch {
    return null
  }
}

/** Ngày kinh doanh hôm nay của quán (YYYY-MM-DD) — mặc định ngày phiếu, mốc lọc danh sách. */
// storeId PHẢI lấy từ guard (requireAdminPageOrRedirect / require*StoreId): loadBusinessDayStart đọc bằng admin client.
export async function inventoryToday(storeId: string): Promise<string> {
  return businessToday(await loadBusinessDayStart(storeId))
}
