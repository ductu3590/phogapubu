'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/field'
import { debtDateLabel } from '@/lib/debts'
import { filterSuppliers, type SupplierSummary } from '@/lib/suppliers'
import { formatVND } from '@/lib/utils'
import SupplierDrawer from './supplier-drawer'
import SupplierFormDialog from './supplier-form-dialog'

// Tab Nhà cung cấp của trang Công nợ (mig 145). Số nợ lấy nguyên từ supplier_list — ở đây chỉ lọc / sắp.
// Mở / đóng ngăn kéo KHÔNG đổi URL (điều hướng mềm bị @modal/(.)debts bắt — như tab Khách hàng).

const byDebt = (a: SupplierSummary, b: SupplierSummary) => b.outstanding - a.outstanding || a.name.localeCompare(b.name, 'vi')

export default function SuppliersView({ suppliers }: { suppliers: SupplierSummary[] }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const owing = suppliers.filter((s) => s.outstanding > 0)
  const total = owing.reduce((sum, s) => sum + s.outstanding, 0)
  const rows = filterSuppliers(suppliers, query, { onlyOpen }).sort(byDebt)
  const openSupplier = openId ? suppliers.find((s) => s.id === openId) ?? null : null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-muted">Tổng phải trả</p>
          <p className="tabular mt-1 text-xl font-bold text-orange-700">{formatVND(total)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-muted">NCC đang nợ</p>
          <p className="tabular mt-1 text-xl font-bold text-foreground">{owing.length} NCC</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56" htmlFor="suppliers-search">
          <span className="sr-only">Tìm nhà cung cấp</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="suppliers-search" autoComplete="off" placeholder="Tìm tên hoặc SĐT" value={query}
            onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium" htmlFor="suppliers-only-open">
          <input id="suppliers-only-open" type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)}
            className="size-4 accent-orange-600" />
          Chỉ NCC còn nợ
        </label>
        <Button variant="primary" onClick={() => setAdding(true)}>+ Thêm NCC</Button>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState className="rounded-xl border border-border bg-surface">
          Chưa có nhà cung cấp. Lập phiếu nhập Chưa trả ở trang Kho, hoặc bấm + Thêm NCC.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState className="rounded-xl border border-border bg-surface">
          {onlyOpen && !query ? 'Không còn nợ nhà cung cấp nào.' : 'Không có nhà cung cấp khớp tìm kiếm.'}
        </EmptyState>
      ) : (
        <>
          {/* Thẻ dưới 640px. */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpenId(s.id)}
                  className="w-full cursor-pointer rounded-xl border border-border bg-surface p-3 text-left hover:bg-button-hover">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block text-[13px] text-muted">{s.phone ?? '—'}</span>
                    </span>
                    <span className="tabular shrink-0 font-bold text-orange-700">{formatVND(s.outstanding)}</span>
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {s.openDocs > 0 ? `${s.openDocs} phiếu nợ · cũ nhất ${debtDateLabel(s.oldestOpenDate)}` : 'Hết nợ'}
                    {s.isActive ? '' : ' · Đã ngừng'}
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
                  <th className="px-3 py-2 text-right font-medium">Còn nợ</th>
                  <th className="px-3 py-2 font-medium">Phiếu nợ cũ nhất</th>
                  <th className="px-3 py-2 text-right font-medium">Số phiếu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => setOpenId(s.id)} className="cursor-pointer hover:bg-button-hover">
                    <td className="px-3 py-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(s.id) }}
                        className="cursor-pointer text-left font-semibold hover:underline">
                        {s.name}
                      </button>
                      {s.isActive ? null : <Badge className="ml-2">Đã ngừng</Badge>}
                    </td>
                    <td className="tabular px-3 py-2">{s.phone ?? '—'}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold whitespace-nowrap">{formatVND(s.outstanding)}</td>
                    <td className="tabular px-3 py-2">{debtDateLabel(s.oldestOpenDate) || '—'}</td>
                    <td className="tabular px-3 py-2 text-right">{s.openDocs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openSupplier ? <SupplierDrawer key={openSupplier.id} supplier={openSupplier} onClose={() => setOpenId(null)} /> : null}
      <SupplierFormDialog open={adding} supplier={null} onClose={() => setAdding(false)} onSaved={() => router.refresh()} />
    </div>
  )
}
