import type { DocSummary } from '@/lib/inventory'
import { formatVND } from '@/lib/utils'

/** 2026-11-09 → 09/11/2026 */
export function formatDocDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/**
 * Nhãn trả tiền của phiếu nhập. Chưa trả (mig 144): số còn nợ do server tính; phiếu cũ còn hiệu lực thiếu NCC thì báo
 * thiếu (không trả được ở Công nợ); phiếu đã huỷ chỉ ghi "Chưa trả".
 */
export function paidLabel(
  d: Pick<DocSummary, 'paidStatus' | 'paidMethod'> & Partial<Pick<DocSummary, 'supplierId' | 'outstanding' | 'totalAmount' | 'status'>>,
): string {
  if (d.paidStatus === 'paid') return d.paidMethod === 'bank' ? 'Đã trả · Chuyển khoản' : 'Đã trả · Tiền mặt'
  if (d.status === 'voided') return 'Chưa trả'
  if (d.supplierId === null && d.paidStatus === 'unpaid') return 'Chưa trả · Thiếu nhà cung cấp'
  if (typeof d.outstanding === 'number' && d.outstanding > 0) return `Còn nợ ${formatVND(d.outstanding)}`
  if (d.outstanding === 0 && (d.totalAmount ?? 0) > 0) return 'Đã trả hết qua công nợ'
  return 'Chưa trả'
}

/** Nhãn trả tiền tô xanh (đã xong tiền) hay vàng (còn việc). */
export function paidSettled(d: Pick<DocSummary, 'paidStatus'> & Partial<Pick<DocSummary, 'outstanding' | 'totalAmount'>>): boolean {
  return d.paidStatus === 'paid' || (d.outstanding === 0 && (d.totalAmount ?? 0) > 0)
}

/** Khoảng ngày lọc theo đúng thứ tự (ngày đầu gõ sau ngày cuối thì đảo lại). */
export function orderedRange(from: string, to: string): { lo: string; hi: string; swapped: boolean } {
  return from > to ? { lo: to, hi: from, swapped: true } : { lo: from, hi: to, swapped: false }
}
