// Mã món (SKU) + nhãn món (PA-4, 2026-10-08) — hàm THUẦN để test được.
// ⚠️ skuPrefixFromName PHẢI cho cùng kết quả với hàm SQL public.menu_sku_prefix (mig 095) — DB tự sinh
// tiền tố khi danh mục được tạo từ đường khác (wizard, import). Đổi một bên thì đổi cả bên kia.

export function stripVietnamese(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

export function skuPrefixFromName(name: string): string {
  const words = stripVietnamese(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const prefix = words.map((w) => w[0]).join('').toUpperCase().slice(0, 4)
  return prefix || 'MON'
}

export function uniquePrefix(base: string, used: string[]): string {
  if (!used.includes(base)) return base
  for (let n = 2; ; n++) {
    const suffix = String(n)
    const candidate = base.slice(0, 6 - suffix.length) + suffix
    if (!used.includes(candidate)) return candidate
  }
}

export function formatSku(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`
}

export function nextSkuNumber(prefix: string, existing: string[]): number {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  return 1 + existing.reduce((max, s) => {
    const m = re.exec(s)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
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
