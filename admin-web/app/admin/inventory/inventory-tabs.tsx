'use client'

import { useState, type ReactNode } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/feedback'
import { DOC_KIND_LABEL, type DocKind, type StockRow } from '@/lib/inventory'
import StockTab from './stock-tab'

type TabValue = 'stock' | DocKind

export type InventoryTabsProps = {
  /** Chủ quán + quản lý: thấy 3 tab phiếu và nút ghi. Thu ngân: chỉ tab Tồn kho, chỉ xem. */
  canEdit: boolean
  /** Ngày kinh doanh hôm nay của quán (YYYY-MM-DD) — mặc định ngày phiếu, mốc lọc danh sách phiếu (Task 7, 8). */
  today: string
  initialStock: StockRow[]
  /**
   * Thẻ kho của một hàng (Task 8). Là hàm nên chỉ truyền được từ client component; bỏ trống thì dòng tồn kho
   * không bấm được.
   */
  ledgerSlot?: (row: StockRow, onClose: () => void) => ReactNode
  /** Nội dung 3 tab phiếu (Task 7, 8). */
  docSlots?: Partial<Record<DocKind, ReactNode>>
}

// Tab giữ bằng state client, KHÔNG đẩy lên URL: điều hướng mềm (?tab=) bị route chặn @modal/(.)inventory bắt
// lại (xem comment app/admin/bills/report-date-picker.tsx).
export default function InventoryTabs(props: InventoryTabsProps) {
  const { canEdit, initialStock, ledgerSlot, docSlots } = props
  const [tab, setTab] = useState<TabValue>('stock')
  const [ledgerRow, setLedgerRow] = useState<StockRow | null>(null)

  const items: { value: TabValue; label: string }[] = [
    { value: 'stock', label: 'Tồn kho' },
    ...(canEdit
      ? (['receipt', 'count', 'writeoff'] as const).map((k) => ({ value: k as TabValue, label: DOC_KIND_LABEL[k] }))
      : []),
  ]
  // Mất quyền giữa chừng (không thể xảy ra trong một lần tải trang, phòng hờ) → về Tồn kho.
  const current: TabValue = items.some((i) => i.value === tab) ? tab : 'stock'

  return (
    <div className="space-y-4">
      {items.length > 1 ? (
        <Tabs label="Mục kho" variant="underline" items={items} value={current} onValueChange={setTab} />
      ) : null}

      {current === 'stock' ? (
        <StockTab
          rows={initialStock}
          canEdit={canEdit}
          onOpenLedger={ledgerSlot ? (row) => setLedgerRow(row) : undefined}
        />
      ) : (
        docSlots?.[current] ?? <EmptyState>Phần {DOC_KIND_LABEL[current].toLowerCase()} đang được hoàn thiện.</EmptyState>
      )}

      {ledgerSlot && ledgerRow ? ledgerSlot(ledgerRow, () => setLedgerRow(null)) : null}
    </div>
  )
}
