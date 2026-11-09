'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/field'
import { debtDayMonth, debtKindLabel, filterDebtCustomers, type DebtCustomerSummary } from '@/lib/debts'
import { cn, formatVND } from '@/lib/utils'
import CustomerFormDialog from './customer-form-dialog'
import DebtCustomerDrawer from './debt-customer-drawer'

// Danh sách công nợ (mig 123). Số nợ lấy nguyên từ debt_list (server đã bỏ lần trả đã huỷ) — ở đây chỉ lọc / sắp.
// Mở / đóng ngăn kéo KHÔNG đổi URL: điều hướng mềm ở trang đầy đủ bị @modal/(.)debts bắt (ghi chú report-date-picker).

/**
 * Trạng thái ban đầu theo ?customer=<id>: id có trong danh sách → mở sẵn ngăn kéo; khách đó hết nợ thì tắt công tắc
 * "Chỉ khách còn nợ" để dòng của họ vẫn hiện. Id lạ / sai dạng → không mở gì.
 */
export function initialDebtsState(customers: DebtCustomerSummary[], id: string | null): { openId: string | null; onlyOpen: boolean } {
  const c = id ? customers.find((x) => x.id === id) : undefined
  if (!c) return { openId: null, onlyOpen: true }
  return { openId: c.id, onlyOpen: c.outstanding > 0 }
}

const byDebt = (a: DebtCustomerSummary, b: DebtCustomerSummary) =>
  b.outstanding - a.outstanding || a.name.localeCompare(b.name, 'vi')

export default function DebtsView({ customers, canManage, initialCustomerId }: {
  customers: DebtCustomerSummary[]
  canManage: boolean
  initialCustomerId: string | null
}) {
  const router = useRouter()
  const [init] = useState(() => initialDebtsState(customers, initialCustomerId))
  const [openId, setOpenId] = useState<string | null>(init.openId)
  const [onlyOpen, setOnlyOpen] = useState(init.onlyOpen)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const owing = customers.filter((c) => c.outstanding > 0)
  const total = owing.reduce((s, c) => s + c.outstanding, 0)
  const rows = filterDebtCustomers(customers, query, { onlyOpen, activeOnly: false }).sort(byDebt)
  const openCustomer = openId ? customers.find((c) => c.id === openId) ?? null : null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-muted">Tổng đang nợ</p>
          <p className="tabular mt-1 text-xl font-bold text-orange-700">{formatVND(total)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-muted">Khách đang nợ</p>
          <p className="tabular mt-1 text-xl font-bold text-foreground">{owing.length} khách</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56" htmlFor="debts-search">
          <span className="sr-only">Tìm khách</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="debts-search" autoComplete="off" placeholder="Tìm tên hoặc SĐT" value={query}
            onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium" htmlFor="debts-only-open">
          <input id="debts-only-open" type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)}
            className="size-4 accent-orange-600" />
          Chỉ khách còn nợ
        </label>
        {canManage ? <Button variant="primary" onClick={() => setAdding(true)}>+ Thêm khách</Button> : null}
        <a href={onlyOpen ? '/admin/debts/export?open=1' : '/admin/debts/export'} className={cn(getButtonClasses('outline'), 'whitespace-nowrap')}>
          <Download className="size-4" aria-hidden /> Xuất Excel
        </a>
      </div>

      {customers.length === 0 ? (
        <EmptyState className="rounded-xl border border-border bg-surface">Chưa có khách nợ. Ghi nợ ở màn Thanh toán POS.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState className="rounded-xl border border-border bg-surface">
          {onlyOpen && !query ? 'Không còn khách nào đang nợ.' : 'Không có khách khớp tìm kiếm.'}
        </EmptyState>
      ) : (
        <>
          {/* Thẻ dưới 640px. */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)}
                  className="w-full cursor-pointer rounded-xl border border-border bg-surface p-3 text-left hover:bg-button-hover">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="block text-[13px] text-muted">
                        {[c.phone, debtKindLabel(c.kind)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-bold text-orange-700">{formatVND(c.outstanding)}</span>
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {c.openBills > 0 ? `${c.openBills} bill nợ · cũ nhất ${debtDayMonth(c.oldestOpenAt)}` : 'Hết nợ'}
                    {c.isActive ? '' : ' · Đã ngừng'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Bảng từ 640px. */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface sm:block">
            <table className="w-full text-sm">
              <thead className="bg-background text-left text-[13px] text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Tên</th>
                  <th className="px-3 py-2 font-medium">SĐT</th>
                  <th className="px-3 py-2 font-medium">Loại</th>
                  <th className="px-3 py-2 text-right font-medium">Tổng nợ</th>
                  <th className="px-3 py-2 font-medium">Bill nợ cũ nhất</th>
                  <th className="px-3 py-2 text-right font-medium">Số bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-button-hover">
                    <td className="px-3 py-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(c.id) }} className="cursor-pointer text-left font-semibold hover:underline">
                        {c.name}
                      </button>
                      {c.isActive ? null : <Badge className="ml-2">Đã ngừng</Badge>}
                    </td>
                    <td className="tabular px-3 py-2">{c.phone ?? '—'}</td>
                    <td className="px-3 py-2">{debtKindLabel(c.kind)}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold whitespace-nowrap">{formatVND(c.outstanding)}</td>
                    <td className="tabular px-3 py-2">{debtDayMonth(c.oldestOpenAt) || '—'}</td>
                    <td className="tabular px-3 py-2 text-right">{c.openBills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openCustomer ? (
        <DebtCustomerDrawer key={openCustomer.id} customer={openCustomer} canManage={canManage} onClose={() => setOpenId(null)} />
      ) : null}
      {canManage ? (
        <CustomerFormDialog open={adding} customer={null} onClose={() => setAdding(false)} onSaved={() => router.refresh()} />
      ) : null}
    </div>
  )
}
