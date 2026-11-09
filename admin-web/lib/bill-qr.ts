// Chọn số tiền + nội dung cho mã VietQR của một bill. Hàm thuần, dùng được ở client (bill-panel)
// lẫn trang in — KHÔNG import lib/actions/* để khỏi kéo code server vào bundle.
import { billTotals, type DiscountedSession } from '@/lib/bill-discount'
import { isReviewableOrder } from '@/lib/pos-work-queue'
import { billCode } from '@/lib/bills-report'
import { billTransferMemo, buildVietQrPayload, hasBankAccount, type BankAccountFields } from '@/lib/vietqr'
import { bankName } from '@/lib/vietqr-banks'

export type BillQr = {
  payload: string
  amount: number
  memo: string
  bankName: string
  accountNumber: string
  accountName: string
}

/** Một phiên bàn còn mở (list_open_table_sessions) kèm tiền tổng để billTotals tính phần đã thu trước. */
export type OpenBillSession = DiscountedSession & {
  session_id: string
  table_number: string
  total: number
  /** Các đơn của phiên (RPC đã trả sẵn): đơn còn chờ thu ngân duyệt thì chưa in QR. */
  orders?: { status: string; order_source: string }[]
}

/**
 * Dựng mã VietQR cho bill. Trả null khi không có QR hợp lệ: chưa khai tài khoản, không có phiên,
 * hoặc số tiền không phải số nguyên dương (EMVCo không nhận 0đ).
 * Mã bill lấy theo phiên nhỏ nhất (cùng quy tắc A04) nên không phụ thuộc thứ tự đầu vào.
 */
export function buildBillQr(input: {
  bank: BankAccountFields | null | undefined
  amount: number
  sessions: { sessionId: string; tableLabel: string }[]
}): BillQr | null {
  const { bank, amount, sessions } = input
  if (!hasBankAccount(bank)) return null
  if (sessions.length === 0) return null
  if (!Number.isInteger(amount) || amount <= 0) return null

  const sorted = [...sessions].sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0))
  const memo = billTransferMemo({
    tableLabel: sorted.map((s) => s.tableLabel).join(', '),
    billCode: billCode(sorted.map((s) => s.sessionId), []),
  })
  return {
    payload: buildVietQrPayload({ bin: bank.bank_bin, accountNumber: bank.bank_account_number, amount, memo }),
    amount,
    memo,
    bankName: bankName(bank.bank_bin),
    accountNumber: bank.bank_account_number,
    accountName: bank.bank_account_name,
  }
}

/**
 * Số tiền đưa vào QR theo cách thu: tiền mặt không cần QR (0), chuyển khoản = cả số cần thu,
 * kết hợp = phần chuyển khoản. Phần chuyển khoản trống hoặc vượt số cần thu → 0 (không có QR).
 */
export function paymentQrAmount(input: { method: 'cash' | 'bank' | 'mixed'; total: number; bankPart: number }): number {
  if (input.method === 'cash') return 0
  if (input.method === 'bank') return input.total
  return input.bankPart > 0 && input.bankPart <= input.total ? input.bankPart : 0
}

/**
 * QR in trên bill: số tiền = phần CHƯA thu sau giảm giá, tính bằng đúng dữ liệu + hàm POS đang dùng
 * (không dùng get_sessions_bill.grand_total vì số đó cộng cả đơn đã thu trước).
 * Thiếu phiên nào so với sessionIds (đã thu / đóng rồi) → null, tức bill đã thu không in QR.
 */
export function pickBillQr(input: {
  sessionIds: string[]
  openSessions: OpenBillSession[]
  bank: BankAccountFields | null | undefined
}): BillQr | null {
  const wanted = new Set(input.sessionIds)
  const found = input.openSessions.filter((s) => wanted.has(s.session_id))
  if (found.length === 0 || found.length !== wanted.size) return null
  // Tờ in đưa tận tay khách: đơn chờ duyệt có thể bị từ chối sau khi khách đã chuyển khoản → chưa in QR.
  if (found.some((s) => (s.orders ?? []).some(isReviewableOrder))) return null
  const totals = billTotals(found)
  if (totals.error) return null
  return buildBillQr({
    bank: input.bank,
    amount: totals.payable,
    sessions: found.map((s) => ({ sessionId: s.session_id, tableLabel: s.table_number })),
  })
}
