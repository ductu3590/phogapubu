import { createClient } from '@/lib/supabase/server'
import {
  CASH_BOOK_CATEGORY_COLUMNS,
  filtersToRpc,
  parseCashBookCategories,
  parseCashBookList,
  type CashBookCategory,
  type CashBookEntry,
  type CashBookTotals,
  type CashbookFilters,
} from '@/lib/cash-book'

// Đọc sổ thu chi cho server component (/admin/cashbook, Excel). KHÔNG 'use server'. Gọi bằng phiên đăng nhập:
// cash_book_list tự lọc (thu ngân chỉ phiếu mình ghi), danh mục đọc qua RLS (ai có quyền POS của đúng quán).

export async function loadCashBookList(storeId: string, filters: CashbookFilters): Promise<
  { ok: true; entries: CashBookEntry[]; totals: CashBookTotals; truncated: boolean } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cash_book_list', {
    p_store_id: storeId, p_from: filters.from, p_to: filters.to, p_filters: filtersToRpc(filters),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, ...parseCashBookList(data) }
}

/** Mọi danh mục của quán, kể cả đang ẩn (trang quản lý danh mục). Lỗi → rỗng. */
export async function loadCashBookCategories(storeId: string): Promise<CashBookCategory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cash_book_categories')
    .select(CASH_BOOK_CATEGORY_COLUMNS)
    .eq('store_id', storeId)
    .order('kind')
    .order('sort_order')
  if (error) return []
  return parseCashBookCategories(data)
}
