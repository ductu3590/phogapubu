'use server'

import { revalidatePath } from 'next/cache'
import { requirePosOperatorStoreId, requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { parseCashShiftCloseResult, type CashShiftCloseResult } from '@/lib/cash-shift'

// Ca thu ngân (mig 122). Gọi bằng phiên đăng nhập (không service key): RPC tự kiểm quyền theo auth.uid().
// Lỗi người dùng trả { ok: false, error } (Next prod giấu nội dung lỗi ném); bọc cả bước kiểm quyền.
// Trạng thái ca POS đọc thẳng từ trình duyệt (lib/pos-browser-reads.ts), không poll qua action.

type Fail = { ok: false; error: string }
const MAX_CASH = 2_000_000_000
const validCash = (v: number) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_CASH
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export async function openCashShift(input: { openingCash: number; note: string | null }): Promise<
  { ok: true; shiftId: string } | Fail
> {
  if (!validCash(input.openingCash)) return { ok: false, error: 'Số tiền không hợp lệ' }
  try {
    const storeId = await requirePosOperatorStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('open_cash_shift', {
      p_store_id: storeId, p_opening_cash: input.openingCash, p_note: input.note,
    })
    if (error) return { ok: false, error: error.message }
    const shiftId = (data as { shift_id?: unknown } | null)?.shift_id
    if (typeof shiftId !== 'string') return { ok: false, error: 'Không mở được ca, tải lại trang' }
    return { ok: true, shiftId }
  } catch (e) {
    return { ok: false, error: message(e, 'Không mở được ca') }
  }
}

export async function closeCashShift(input: { shiftId: string; countedCash: number; note: string | null }): Promise<
  { ok: true; result: CashShiftCloseResult } | Fail
> {
  if (!input.shiftId) return { ok: false, error: 'Không tìm thấy ca' }
  if (!validCash(input.countedCash)) return { ok: false, error: 'Số tiền không hợp lệ' }
  try {
    await requirePosOperatorStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('close_cash_shift', {
      p_shift_id: input.shiftId, p_counted_cash: input.countedCash, p_note: input.note,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, result: parseCashShiftCloseResult(data) }
  } catch (e) {
    return { ok: false, error: message(e, 'Không kết được ca') }
  }
}

export async function continueStaleShift(shiftId: string): Promise<{ ok: true; already: boolean } | Fail> {
  if (!shiftId) return { ok: false, error: 'Không tìm thấy ca' }
  try {
    await requirePosOperatorStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('continue_stale_shift', { p_shift_id: shiftId })
    if (error) return { ok: false, error: error.message }
    return { ok: true, already: (data as { already?: unknown } | null)?.already === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không gộp được ca') }
  }
}

// Công tắc "Bắt buộc mở ca trước khi thu tiền" — chỉ chủ quán.
export async function saveRequireCashShift(enabled: boolean): Promise<{ ok: true; requireCashShift: boolean } | Fail> {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'Giá trị không hợp lệ' }
  try {
    const storeId = await requireStoreOwnerStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('set_require_cash_shift', { p_store_id: storeId, p_enabled: enabled })
    if (error) return { ok: false, error: error.message }
    const saved = (data as { require_cash_shift?: unknown } | null)?.require_cash_shift
    revalidatePath('/admin', 'layout')
    return { ok: true, requireCashShift: typeof saved === 'boolean' ? saved : enabled }
  } catch (e) {
    return { ok: false, error: message(e, 'Không lưu được cài đặt ca') }
  }
}
