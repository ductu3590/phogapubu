'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type DebtsTab = 'customers' | 'suppliers'

// Hai tab của trang Công nợ: Khách hàng | Nhà cung cấp. suppliers = null (thu ngân) → chỉ nội dung khách, không có tab.
// Đổi tab ghi ?tab= bằng history.replaceState, KHÔNG điều hướng mềm: điều hướng mềm ở trang đầy đủ bị @modal/(.)debts bắt.
export default function DebtsTabs({ initialTab, customers, suppliers }: {
  initialTab: DebtsTab
  customers: ReactNode
  suppliers: ReactNode | null
}) {
  const [tab, setTab] = useState<DebtsTab>(suppliers === null ? 'customers' : initialTab)
  if (suppliers === null) return <>{customers}</>

  const pick = (next: DebtsTab) => {
    setTab(next)
    try {
      const url = new URL(window.location.href)
      if (next === 'suppliers') url.searchParams.set('tab', 'suppliers')
      else url.searchParams.delete('tab')
      window.history.replaceState(window.history.state, '', url)
    } catch {
      // Không ghi được URL (trình duyệt chặn) thì chỉ đổi tab trên màn.
    }
  }
  const TABS: { key: DebtsTab; label: string }[] = [
    { key: 'customers', label: 'Khách hàng' },
    { key: 'suppliers', label: 'Nhà cung cấp' },
  ]

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Loại công nợ" className="inline-flex rounded-xl border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)}
            className={cn(
              'min-h-10 cursor-pointer rounded-lg px-4 text-sm font-semibold transition-colors',
              tab === t.key ? 'bg-primary text-white' : 'text-foreground hover:bg-button-hover',
            )}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === 'customers' ? customers : suppliers}</div>
    </div>
  )
}
