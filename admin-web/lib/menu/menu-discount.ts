// Giảm giá theo món / danh mục (mig 115, spec docs/superpowers/specs/2026-11-09-menu-discount-design.md).
//
// SERVER là nguồn sự thật: create_order / staff_create_order / add_order_line tự trừ giảm giá lúc tạo đơn.
// File này chỉ để VẼ giá (giá gạch + giá giảm) và kiểm form cấu hình.
// ⚠️ Công thức tiền giảm phải khớp menu_discount_amount (mig 115) và mini-app/src/utils/menu-discount.ts:
// đổi một bên phải đổi cả ba.

import { parseVnd } from '@/lib/money'

export type DiscountType = 'percent' | 'amount'

// Một chương trình đang hiệu lực, dạng get_active_menu_discounts trả về (đã lọc cấp thắng: món > danh mục).
export type ActiveRule = {
  id: string
  discount_type: DiscountType
  value: number
  name: string | null
  time_to: string | null // 'HH:MM' nếu có khung giờ
  ends_on: string | null // 'YYYY-MM-DD' nếu có ngày kết thúc
}

// Một dòng bảng menu_discounts.
export type MenuDiscountRow = {
  id: string
  menu_item_id: string | null
  category_id: string | null
  name: string | null
  discount_type: DiscountType
  value: number
  starts_on: string | null
  ends_on: string | null
  time_from: string | null // Postgres trả 'HH:MM:SS'
  time_to: string | null
  days_of_week: number[] | null
  is_active: boolean
}

export const MAX_DISCOUNT_AMOUNT = 100_000_000

/** Tiền giảm của một giá: % làm tròn nửa lên tới đồng, VNĐ giữ nguyên; luôn ≤ giá, không âm. */
export function discountAmount(price: number, type: DiscountType, value: number): number {
  if (!(price > 0) || !(value > 0)) return 0
  const raw = type === 'percent' ? Math.round((price * value) / 100) : value
  return Math.min(price, raw)
}

/** Áp chương trình có lợi nhất cho khách (không cộng dồn). Không có chương trình → giá giữ nguyên. */
export function applyMenuDiscount(
  price: number,
  rules: ActiveRule[] | null | undefined,
): { price: number; originalPrice: number | null; rule: ActiveRule | null } {
  let best: ActiveRule | null = null
  let bestAmt = 0
  for (const r of rules ?? []) {
    const amt = discountAmount(price, r.discount_type, r.value)
    if (amt > bestAmt) {
      best = r
      bestAmt = amt
    }
  }
  if (!best) return { price, originalPrice: null, rule: null }
  return { price: price - bestAmt, originalPrice: price, rule: best }
}

/**
 * Giá món + giá từng lựa chọn sau giảm, cho màn đặt món (POS ghi tay, /staff/order).
 * originalPrice = null khi không giảm. badge = chip của chương trình áp cho giá món (giá "Từ …").
 */
export function discountMenuPrices<V extends { price: number }>(
  price: number,
  variants: V[],
  rules: ActiveRule[] | null | undefined,
): { price: number; originalPrice: number | null; badge: string | null; variants: (V & { originalPrice: number | null })[] } {
  const base = applyMenuDiscount(price, rules)
  return {
    price: base.price,
    originalPrice: base.originalPrice,
    badge: base.rule ? discountBadge(base.rule) : null,
    variants: variants.map((v) => {
      const d = applyMenuDiscount(v.price, rules)
      return { ...v, price: d.price, originalPrice: d.originalPrice }
    }),
  }
}

/** Kết quả RPC get_active_menu_discounts → tra theo món. Dữ liệu lạ thì bỏ qua, không vỡ trang. */
export function parseActiveDiscounts(data: unknown): { byItem: Map<string, ActiveRule[]>; activeIds: Set<string> } {
  const byItem = new Map<string, ActiveRule[]>()
  const activeIds = new Set<string>()
  if (!data || typeof data !== 'object') return { byItem, activeIds }
  const obj = data as { items?: unknown; active_ids?: unknown }
  if (Array.isArray(obj.active_ids)) for (const id of obj.active_ids) if (typeof id === 'string') activeIds.add(id)
  if (Array.isArray(obj.items)) {
    for (const row of obj.items as { menu_item_id?: unknown; rules?: unknown }[]) {
      if (typeof row?.menu_item_id !== 'string' || !Array.isArray(row.rules)) continue
      const rules = (row.rules as Record<string, unknown>[])
        .filter((r) => typeof r?.id === 'string' && (r.discount_type === 'percent' || r.discount_type === 'amount') && typeof r.value === 'number')
        .map((r) => ({
          id: r.id as string,
          discount_type: r.discount_type as DiscountType,
          value: r.value as number,
          name: typeof r.name === 'string' ? r.name : null,
          time_to: typeof r.time_to === 'string' ? r.time_to : null,
          ends_on: typeof r.ends_on === 'string' ? r.ends_on : null,
        }))
      if (rules.length > 0) byItem.set(row.menu_item_id, rules)
    }
  }
  return { byItem, activeIds }
}

function dotted(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Chip mức giảm: '−20%' hoặc '−5.000đ'. */
export function discountBadge(rule: { discount_type: DiscountType; value: number }): string {
  return rule.discount_type === 'percent' ? `−${rule.value}%` : `−${dotted(rule.value)}đ`
}

function ddmm(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

/** 'đến 18:00' (có khung giờ) · 'đến hết 20/11' (có ngày kết thúc) · null. */
export function untilLabel(rule: { time_to: string | null; ends_on: string | null }): string | null {
  if (rule.time_to) return `đến ${rule.time_to.slice(0, 5)}`
  if (rule.ends_on) return `đến hết ${ddmm(rule.ends_on)}`
  return null
}

const DAY_SHORT: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' }
export const WEEKDAYS: { value: number; label: string }[] = [1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: DAY_SHORT[value] }))

/** [1,2,3,4,5] → 'T2–T6' · [6,7] → 'T7, CN' · [1,3,5] → 'T2, T4, T6' · đủ 7 ngày / rỗng → null. */
export function daysLabel(days: number[] | null | undefined): string | null {
  const sorted = [...new Set(days ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (sorted.length === 0 || sorted.length === 7) return null
  const runs: number[][] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last && d === last[last.length - 1] + 1) last.push(d)
    else runs.push([d])
  }
  return runs
    .flatMap((run) => (run.length >= 3 ? [`${DAY_SHORT[run[0]]}–${DAY_SHORT[run[run.length - 1]]}`] : run.map((d) => DAY_SHORT[d])))
    .join(', ')
}

/** Lịch dạng chữ: 'Luôn áp dụng' hoặc '16:00–18:00 · T2–T6 · 10/11–20/11'. */
export function describeSchedule(row: Pick<MenuDiscountRow, 'starts_on' | 'ends_on' | 'time_from' | 'time_to' | 'days_of_week'>): string {
  const parts: string[] = []
  if (row.time_from && row.time_to) parts.push(`${row.time_from.slice(0, 5)}–${row.time_to.slice(0, 5)}`)
  const days = daysLabel(row.days_of_week)
  if (days) parts.push(days)
  if (row.starts_on && row.ends_on) parts.push(row.starts_on === row.ends_on ? `ngày ${ddmm(row.starts_on)}` : `${ddmm(row.starts_on)}–${ddmm(row.ends_on)}`)
  else if (row.starts_on) parts.push(`từ ${ddmm(row.starts_on)}`)
  else if (row.ends_on) parts.push(`đến hết ${ddmm(row.ends_on)}`)
  return parts.length ? parts.join(' · ') : 'Luôn áp dụng'
}

export type RuleStatus = 'active' | 'off' | 'expired' | 'upcoming' | 'outside'

export const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  active: 'Đang áp dụng',
  off: 'Đã tắt',
  expired: 'Đã hết hạn',
  upcoming: 'Chưa bắt đầu',
  outside: 'Ngoài khung giờ',
}

/**
 * Trạng thái để hiện ở danh sách. "Đang áp dụng" lấy từ SERVER (active_ids của get_active_menu_discounts),
 * không tự tính lịch ở đây — tránh lệch với hàm SQL. Còn lại chỉ so ngày (todayVN = 'YYYY-MM-DD' giờ VN).
 * Khung qua nửa đêm: 01:00 sáng ngày sau ngày kết thúc vẫn có thể "Đang áp dụng" nhờ server, đúng ý.
 */
export function ruleStatus(row: Pick<MenuDiscountRow, 'id' | 'is_active' | 'starts_on' | 'ends_on'>, activeIds: Set<string>, todayVN: string): RuleStatus {
  if (!row.is_active) return 'off'
  if (activeIds.has(row.id)) return 'active'
  if (row.ends_on && row.ends_on < todayVN) return 'expired'
  if (row.starts_on && row.starts_on > todayVN) return 'upcoming'
  return 'outside'
}

/** Ngày hôm nay theo giờ Việt Nam, 'YYYY-MM-DD'. */
export function vnToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// ─── Kiểm form ────────────────────────────────────────────────────────────────

export type DiscountInput = {
  discount_type: string
  value: string
  name: string
  schedule: string // 'always' | 'scheduled'
  starts_on: string
  ends_on: string
  time_from: string
  time_to: string
  days: string[]
}

export type DiscountValues = {
  discount_type: DiscountType
  value: number
  name: string | null
  starts_on: string | null
  ends_on: string | null
  time_from: string | null
  time_to: string | null
  days_of_week: number[] | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function parseDiscountInput(input: DiscountInput): { ok: true; values: DiscountValues } | { ok: false; error: string } {
  const type = input.discount_type
  if (type !== 'percent' && type !== 'amount') return { ok: false, error: 'Chọn kiểu giảm: % hoặc VNĐ' }
  const value = parseVnd(input.value.trim())
  if (value === null || value <= 0) return { ok: false, error: type === 'percent' ? 'Nhập phần trăm giảm, ví dụ 10' : 'Nhập số tiền giảm, ví dụ 5.000' }
  if (type === 'percent' && value > 100) return { ok: false, error: 'Phần trăm giảm tối đa là 100' }
  if (type === 'amount' && value > MAX_DISCOUNT_AMOUNT) return { ok: false, error: 'Số tiền giảm quá lớn' }

  const name = input.name.trim()
  if (name.length > 60) return { ok: false, error: 'Tên chương trình tối đa 60 ký tự' }

  const values: DiscountValues = {
    discount_type: type,
    value,
    name: name || null,
    starts_on: null,
    ends_on: null,
    time_from: null,
    time_to: null,
    days_of_week: null,
  }
  if (input.schedule !== 'scheduled') return { ok: true, values }

  const startsOn = input.starts_on.trim()
  const endsOn = input.ends_on.trim()
  if (startsOn && !validDate(startsOn)) return { ok: false, error: 'Ngày bắt đầu không hợp lệ' }
  if (endsOn && !validDate(endsOn)) return { ok: false, error: 'Ngày kết thúc không hợp lệ' }
  if (startsOn && endsOn && startsOn > endsOn) return { ok: false, error: 'Ngày kết thúc phải từ ngày bắt đầu trở đi' }

  const from = input.time_from.trim().slice(0, 5)
  const to = input.time_to.trim().slice(0, 5)
  if (Boolean(from) !== Boolean(to)) return { ok: false, error: 'Khung giờ cần cả giờ bắt đầu và giờ kết thúc' }
  if (from && (!TIME_RE.test(from) || !TIME_RE.test(to))) return { ok: false, error: 'Giờ không hợp lệ' }
  if (from && from === to) return { ok: false, error: 'Giờ bắt đầu và kết thúc phải khác nhau' }

  const days = [...new Set(input.days.map((d) => Number(d)))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b)

  values.starts_on = startsOn || null
  values.ends_on = endsOn || null
  values.time_from = from || null
  values.time_to = to || null
  values.days_of_week = days.length === 0 || days.length === 7 ? null : days
  return { ok: true, values }
}
