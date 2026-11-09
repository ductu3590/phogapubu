// Dùng chung cho ca thu ngân (lib/cash-shift.ts) và sổ thu chi (lib/cash-book.ts), để hai file không import lẫn
// nhau: giới hạn tiền, các loại phiếu, và bộ đọc JSON an toàn. Hàm thuần.

/** Trần mọi ô tiền của ca / phiếu thu chi — khớp CHECK và RPC của mig 122. */
export const MAX_CASH_AMOUNT = 2_000_000_000

export const KINDS = ['receipt', 'payment'] as const
export const METHODS = ['cash', 'bank'] as const
export const SOURCES = ['manual', 'pos_drawer', 'inventory_receipt'] as const

export type CashBookKind = (typeof KINDS)[number]
export type CashBookMethod = (typeof METHODS)[number]
export type CashBookSource = (typeof SOURCES)[number]

type Obj = Record<string, unknown>
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null

export const kindOf = (v: unknown) => oneOf(v, KINDS)
export const methodOf = (v: unknown) => oneOf(v, METHODS)
export const sourceOf = (v: unknown) => oneOf(v, SOURCES)
