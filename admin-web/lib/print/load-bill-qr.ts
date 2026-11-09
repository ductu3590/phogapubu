import type { SupabaseClient } from '@supabase/supabase-js'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import { requireOperator } from '@/lib/auth/operator'
import { pickBillQr, type BillQr, type OpenBillSession } from '@/lib/bill-qr'
import { createClient } from '@/lib/supabase/server'

// Dựng mã VietQR cho tờ in bill. KHÔNG BAO GIỜ ném: lỗi QR không được làm hỏng việc in bill (chỉ mất QR).
// Số tiền lấy từ đúng nguồn POS dùng (list_open_table_sessions + billTotals), không lấy get_sessions_bill.grand_total.
const BANK_COLUMNS = 'bank_bin, bank_account_number, bank_account_name'

/** /print/bill: có cookie đăng nhập → đọc theo người đang đăng nhập. */
export async function loadBillQr(sessionIds: string[]): Promise<BillQr | null> {
  try {
    const operator = await requireOperator()
    const res = await listOpenTableSessions()
    if (!res.ok) return null
    const supabase = await createClient()
    const { data: bank, error } = await supabase.from('stores').select(BANK_COLUMNS).eq('id', operator.storeId).maybeSingle()
    if (error) return null
    return pickBillQr({ sessionIds, openSessions: res.sessions as unknown as OpenBillSession[], bank })
  } catch {
    return null
  }
}

/** /print/agent: không có cookie, đọc bằng client JWT của người tạo phiếu (RLS vẫn khoá theo quán). */
export async function loadBillQrWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  storeId: string,
  sessionIds: string[],
): Promise<BillQr | null> {
  try {
    const { data, error } = await client.rpc('list_open_table_sessions', { p_store_id: storeId })
    if (error) return null
    const { data: bank, error: bankErr } = await client.from('stores').select(BANK_COLUMNS).eq('id', storeId).maybeSingle()
    if (bankErr) return null
    return pickBillQr({ sessionIds, openSessions: (data ?? []) as unknown as OpenBillSession[], bank })
  } catch {
    return null
  }
}
