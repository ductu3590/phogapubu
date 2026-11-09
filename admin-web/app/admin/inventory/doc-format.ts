import type { DocSummary } from '@/lib/inventory'

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

export function paidLabel(d: Pick<DocSummary, 'paidStatus' | 'paidMethod'>): string {
  if (d.paidStatus !== 'paid') return 'Chưa trả'
  return d.paidMethod === 'bank' ? 'Đã trả · Chuyển khoản' : 'Đã trả · Tiền mặt'
}

/** Khoảng ngày lọc theo đúng thứ tự (ngày đầu gõ sau ngày cuối thì đảo lại). */
export function orderedRange(from: string, to: string): { lo: string; hi: string; swapped: boolean } {
  return from > to ? { lo: to, hi: from, swapped: true } : { lo: from, hi: to, swapped: false }
}
