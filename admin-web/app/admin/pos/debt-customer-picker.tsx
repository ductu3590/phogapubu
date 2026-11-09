'use client'

import { useState, type ReactNode } from 'react'
import { RotateCw, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { normalizeSearch } from '@/lib/bills-report'
import {
  debtChoiceError,
  debtKindLabel,
  filterDebtCustomers,
  type DebtCustomerChoice,
  type DebtCustomerKind,
  type DebtCustomerSummary,
} from '@/lib/debts'
import { cn } from '@/lib/utils'

// Chọn khách ghi nợ ở màn Thanh toán POS (mig 123). KHÔNG giữ state ngoài ô tìm: PaymentView giữ lựa chọn và
// danh sách (đọc một lần qua readDebtCustomers). Thu ngân tự thêm khách mới ngay tại đây; server tạo khách trong
// CÙNG giao dịch thu tiền (collect_table_bill), lỗi thì không có khách nào được tạo.

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const MAX_ROWS = 8
const KINDS: readonly DebtCustomerKind[] = ['company', 'person']

export default function DebtCustomerPicker({ customers, loading, error, value, onChange, onRetry }: {
  customers: DebtCustomerSummary[] | null
  loading: boolean
  error: string | null
  value: DebtCustomerChoice | null
  onChange: (v: DebtCustomerChoice | null) => void
  /** Tải lại danh sách sau lỗi; không truyền = không hiện nút Thử lại. */
  onRetry?: () => void
}) {
  const [query, setQuery] = useState('')

  if (value?.kind === 'existing') {
    return (
      <Wrap>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2">
          <span className="min-w-0 text-sm">
            <span className="block text-[12px] text-slate-500">Ghi nợ cho</span>
            <span className="block truncate font-bold text-slate-900">{value.name}</span>
          </span>
          <Button onClick={() => onChange(null)} className="min-h-9 font-semibold md:min-h-9">Đổi</Button>
        </div>
      </Wrap>
    )
  }

  if (value?.kind === 'new') {
    const c = value.customer
    const set = (patch: Partial<typeof c>) => onChange({ kind: 'new', customer: { ...c, ...patch } })
    // Gõ tên trùng đúng MỘT khách đang dùng → gợi ý chọn khách đó, tránh tạo bản thứ hai.
    const typed = normalizeSearch(c.name)
    const same = typed ? (customers ?? []).filter((x) => x.isActive && normalizeSearch(x.name) === typed) : []
    const err = debtChoiceError(value)
    return (
      <Wrap>
        <div className="space-y-2 rounded-lg border border-orange-200 bg-white p-3">
          <p className="text-[12px] font-bold tracking-wide text-slate-700 uppercase">Khách nợ mới</p>
          {/* Danh sách chưa tải được thì không dò được trùng tên → báo rõ và cho tải lại ngay tại form. */}
          {error && <LoadError error={error} onRetry={onRetry} />}
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="debt-new-name">
            Tên khách / cơ quan
            <Input id="debt-new-name" autoComplete="off" value={c.name} maxLength={120}
              onChange={(e) => set({ name: e.target.value })} className="mt-1" />
          </label>
          {same.length === 1 && (
            <button type="button" onClick={() => onChange({ kind: 'existing', id: same[0].id, name: same[0].name })}
              className="w-full cursor-pointer rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-left text-[13px] font-semibold text-amber-900 hover:bg-amber-100">
              Đã có khách này — chọn {same[0].name}
            </button>
          )}
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="debt-new-phone">
            SĐT (không bắt buộc)
            <Input id="debt-new-phone" inputMode="tel" autoComplete="off" value={c.phone ?? ''}
              onChange={(e) => set({ phone: e.target.value === '' ? null : e.target.value })} className="mt-1 tabular" />
          </label>
          <div role="group" aria-label="Loại khách" className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={c.kind === k} onClick={() => set({ kind: k })}
                className={cn(
                  'min-h-10 cursor-pointer rounded-lg border-2 text-sm font-bold transition-colors',
                  c.kind === k ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}>{debtKindLabel(k)}</button>
            ))}
          </div>
          {err && <p role="alert" className="text-[13px] font-semibold text-red-700">{err}</p>}
          <Button onClick={() => onChange(null)} className="min-h-9 w-full font-semibold md:min-h-9">Chọn khách có sẵn</Button>
        </div>
      </Wrap>
    )
  }

  const list = customers ? filterDebtCustomers(customers, query, { onlyOpen: false, activeOnly: true }).slice(0, MAX_ROWS) : []
  // Bấm "+ Khách mới" mang theo chữ đang tìm: toàn số → SĐT, còn lại → tên.
  const digitsOnly = /^[\d\s.+-]+$/.test(query.trim())
  const startNew = () => onChange({ kind: 'new', customer: {
    name: digitsOnly ? '' : query.trim(), phone: digitsOnly && query.trim() ? query.trim() : null, kind: 'company',
  } })

  return (
    <Wrap>
      <label className="block text-[13px] font-semibold text-slate-700" htmlFor="debt-search">
        Khách ghi nợ
        <Input id="debt-search" autoComplete="off" placeholder="Tìm tên hoặc SĐT" value={query}
          onChange={(e) => setQuery(e.target.value)} className="mt-1" />
      </label>
      {loading && <p className="mt-2 text-[13px] text-slate-500">Đang tải khách nợ…</p>}
      {error && <LoadError error={error} onRetry={onRetry} className="mt-2" />}
      {customers && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange({ kind: 'existing', id: c.id, name: c.name })}
                className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left hover:bg-orange-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{c.name}</span>
                  {c.phone && <span className="block text-[12px] text-slate-500 tabular">{c.phone}</span>}
                </span>
                {c.outstanding > 0 && <span className="shrink-0 text-[13px] font-semibold text-orange-700 tabular">đang nợ {dong(c.outstanding)}</span>}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-3 py-2 text-[13px] text-slate-500">Không tìm thấy khách. Thêm khách mới bên dưới.</li>}
        </ul>
      )}
      {/* Đang tải: chưa biết khách nào đã có → chưa cho thêm khách mới (tránh tạo trùng tên). */}
      <Button icon={<UserPlus />} onClick={startNew} disabled={loading} className="mt-2 min-h-10 w-full font-semibold">+ Khách mới</Button>
    </Wrap>
  )
}

function LoadError({ error, onRetry, className }: { error: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700', className)}>
      <span>{error}</span>
      {onRetry && <Button icon={<RotateCw />} onClick={onRetry} className="min-h-9 shrink-0 md:min-h-9">Thử lại</Button>}
    </div>
  )
}

function Wrap({ children }: { children: ReactNode }) {
  return <section className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">{children}</section>
}
