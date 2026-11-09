'use client'

import { useState, type ReactNode } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/feedback'
import { useToast } from '@/components/ui/toast'
import { loadInventoryStock } from '@/lib/actions/inventory'
import { DOC_KIND_LABEL, type DocKind, type StockRow } from '@/lib/inventory'
import DocumentsTab from './documents-tab'
import StockTab from './stock-tab'

type TabValue = 'stock' | DocKind

export type InventoryTabsProps = {
  /** Chủ quán + quản lý: thấy 3 tab phiếu và nút ghi. Thu ngân: chỉ tab Tồn kho, chỉ xem. */
  canEdit: boolean
  /** Ngày kinh doanh hôm nay của quán (YYYY-MM-DD) — mặc định ngày phiếu, mốc lọc danh sách phiếu. */
  today: string
  initialStock: StockRow[]
  /**
   * Thẻ kho của một hàng (Task 8). Là hàm nên chỉ truyền được từ client component; bỏ trống thì dòng tồn kho
   * không bấm được.
   */
  ledgerSlot?: (row: StockRow, onClose: () => void) => ReactNode
  /** Ghi đè nội dung một tab phiếu (Task 8 cắm kiểm kho). Nhập hàng / Xuất huỷ mặc định là DocumentsTab. */
  docSlots?: Partial<Record<DocKind, ReactNode>>
}

// Tab giữ bằng state client, KHÔNG đẩy lên URL: điều hướng mềm (?tab=) bị route chặn @modal/(.)inventory bắt
// lại (xem comment app/admin/bills/report-date-picker.tsx).
export default function InventoryTabs(props: InventoryTabsProps) {
  const { canEdit, today, initialStock, ledgerSlot, docSlots } = props
  const toast = useToast()
  const [tab, setTab] = useState<TabValue>('stock')
  const [ledgerRow, setLedgerRow] = useState<StockRow | null>(null)
  // Tồn kho dùng chung cho tab Tồn kho và ô chọn hàng của phiếu. Server tải lại trang (revalidate) → nhận mới.
  const [stock, setStock] = useState(initialStock)
  const [prevInitial, setPrevInitial] = useState(initialStock)
  if (initialStock !== prevInitial) {
    setPrevInitial(initialStock)
    setStock(initialStock)
  }

  // Lưu / huỷ phiếu xong: lấy lại tồn để tab Tồn kho đúng số ngay.
  async function refreshStock() {
    const res = await loadInventoryStock()
    if (res.ok) setStock(res.rows)
    else toast({ tone: 'error', title: 'Không tải lại được tồn kho', description: res.error })
  }

  const items: { value: TabValue; label: string }[] = [
    { value: 'stock', label: 'Tồn kho' },
    ...(canEdit
      ? (['receipt', 'count', 'writeoff'] as const).map((k) => ({ value: k as TabValue, label: DOC_KIND_LABEL[k] }))
      : []),
  ]
  // Mất quyền giữa chừng (không thể xảy ra trong một lần tải trang, phòng hờ) → về Tồn kho.
  const current: TabValue = items.some((i) => i.value === tab) ? tab : 'stock'

  const docContent = (kind: DocKind): ReactNode => {
    if (docSlots?.[kind]) return docSlots[kind]
    if (kind === 'receipt' || kind === 'writeoff') {
      return <DocumentsTab key={kind} kind={kind} today={today} items={stock} onChanged={refreshStock} />
    }
    return <EmptyState>Phần {DOC_KIND_LABEL[kind].toLowerCase()} đang được hoàn thiện.</EmptyState>
  }

  return (
    <div className="space-y-4">
      {items.length > 1 ? (
        <Tabs label="Mục kho" variant="underline" items={items} value={current} onValueChange={setTab} />
      ) : null}

      {current === 'stock' ? (
        <StockTab
          rows={stock}
          canEdit={canEdit}
          onOpenLedger={ledgerSlot ? (row) => setLedgerRow(row) : undefined}
        />
      ) : (
        docContent(current)
      )}

      {ledgerSlot && ledgerRow ? ledgerSlot(ledgerRow, () => setLedgerRow(null)) : null}
    </div>
  )
}
