'use client'

import { useMemo } from 'react'
import PosBillPanel from '@/app/admin/pos/bill-panel'
import { useNow } from '@/app/admin/pos/use-now'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { TRAY_COLORS, type TrayAssignment } from '@/lib/tray-colors'

// Bill /admin/pos với dữ liệu minh hoạ — không đọc/ghi database, nút bấm không làm gì.
const MIN = 60_000
const it = (id: string, name: string, quantity: number, price: number, extra: Record<string, unknown> = {}) =>
  ({ id, name, quantity, price, toppings: [], void_type: null, void_reason: null, voided_at: null, is_gift: false, ...extra })

export default function PosBillDemo({ withPending }: { withPending: boolean }) {
  const now = useNow()
  const session = useMemo(() => {
    if (now === null) return null
    const iso = (m: number) => new Date(now + m * MIN).toISOString()
    const orders = [
      { id: 'o1', status: 'confirmed', created_at: iso(-55), confirmed_at: iso(-54), order_source: 'customer', total_amount: 1_040_000, payment_received_at: null, items: [
        it('a', 'Lẩu riêu cua bắp bò (Nồi lớn)', 1, 450_000), it('b', 'Bò tơ cuộn rau rừng', 2, 180_000), it('c', 'Bia Tiger bạc (Tháp 3L)', 1, 340_000),
        it('d', 'Rau rừng cuốn thêm', 1, 50_000, { void_type: 'gift', is_gift: true, void_reason: 'Khách quen' }),
        it('e', 'Ngô chiên bơ', 1, 70_000, { void_type: 'cancelled', void_reason: 'Khách đổi ý' }),
      ] },
      { id: 'o2', status: 'confirmed', created_at: iso(-30), confirmed_at: null, order_source: 'pos', total_amount: 20_000, payment_received_at: null, items: [it('f', 'Khăn lạnh', 10, 2_000)] },
      ...(withPending ? [{ id: 'o3', status: 'pending', created_at: iso(-4), confirmed_at: null, order_source: 'customer', total_amount: 100_000, payment_received_at: null, items: [it('g', 'Bia Tiger bạc lon', 4, 25_000)] }] : []),
    ]
    return {
      session_id: 's9', table_id: 't9', table_number: 'Bàn 9, Bàn 10', tables: [{ id: 't9', table_number: 'Bàn 9' }, { id: 't10', table_number: 'Bàn 10' }],
      is_open_ordering: true, status: 'open', close_reason: null, opened_at: iso(-60), opened_by: 'staff', last_activity_at: iso(-4), has_host: false,
      needs_review: false, order_count: orders.length, total: orders.reduce((n, o) => n + o.total_amount, 0), unpaid_total: 0, cooking_count: 0,
      idle_timeout_minutes: null, orders,
    } as unknown as OpenTableSession
  }, [now, withPending])

  if (!session) return null
  const noop = () => undefined
  const trays = new Map<string, TrayAssignment>([['s9', { color: TRAY_COLORS[0], index: 1 }]])
  return (
    <div className="flex h-[720px] overflow-hidden rounded-xl border border-border [&>aside]:static [&>aside]:max-h-none [&>aside]:w-[400px] [&>aside]:rounded-none [&>aside]:shadow-none [&>button]:hidden">
      <PosBillPanel
        selected={session} picked={[]} freeTables={[]} otherSessions={[]} pickedFreeTables={0} trayColors={trays} busy={false}
        onPay={noop} onPrint={noop} onReset={noop} onCreateTray={noop} onAddTable={noop} onMergeInto={noop} onReleaseHost={noop}
        onConfirmOrder={noop} onRejectOrder={noop} onPrintOrder={noop} onOpenManualOrder={noop} onVoidOrderItem={noop}
        onRestoreOrderItem={noop} onClearPick={noop} onDismiss={noop}
      />
    </div>
  )
}
