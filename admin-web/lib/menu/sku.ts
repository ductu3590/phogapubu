// Mã món (SKU) + nhãn món (PA-4, 2026-10-08) — hàm THUẦN để test được.
// Tiền tố và số thứ tự do trigger DB sinh (mig 095/096); ở đây chỉ kiểm tra thứ người dùng gõ tay.

export function stripVietnamese(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

export function parseManualSku(raw: string): { ok: true; sku: string | null } | { ok: false; error: string } {
  const sku = (raw ?? '').trim().toUpperCase()
  if (!sku) return { ok: true, sku: null }
  return /^[A-Z0-9][A-Z0-9-]{0,19}$/.test(sku)
    ? { ok: true, sku }
    : { ok: false, error: 'Mã món chỉ gồm chữ không dấu, số, gạch ngang (tối đa 20 ký tự)' }
}

export function parsePrefix(raw: string): { ok: true; prefix: string | null } | { ok: false; error: string } {
  const prefix = (raw ?? '').trim().toUpperCase()
  if (!prefix) return { ok: true, prefix: null }
  return /^[A-Z0-9]{1,6}$/.test(prefix)
    ? { ok: true, prefix }
    : { ok: false, error: 'Tiền tố chỉ gồm chữ không dấu và số (1–6 ký tự)' }
}

export type MenuBadge = 'best_seller' | 'signature'

export const MENU_BADGES: ReadonlyArray<{ value: MenuBadge; label: string }> = [
  { value: 'best_seller', label: 'Best seller' },
  { value: 'signature', label: 'Món của quán' },
]

export function parseBadge(v: unknown): MenuBadge | null {
  return v === 'best_seller' || v === 'signature' ? v : null
}

export function badgeLabel(b: unknown): string | null {
  const v = parseBadge(b)
  return v ? MENU_BADGES.find((x) => x.value === v)!.label : null
}
