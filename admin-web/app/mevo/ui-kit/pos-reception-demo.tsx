'use client'

import ReservationDetail from '@/app/admin/pos/reservation-detail'
import { useNow } from '@/app/admin/pos/use-now'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { ReservationPreorderRow } from '@/lib/actions/reservation-preorders'

// Panel "Tiếp nhận khách" của /admin/pos với dữ liệu minh hoạ — nút bấm không làm gì.
export default function PosReceptionDemo() {
  const now = useNow()
  if (now === null) return null
  const reservation = {
    reservationId: 'r1', status: 'confirmed', customerName: 'A. Đỗ Nam', customerPhone: '0912345882', partySize: 8,
    arrivalAt: new Date(now - 25 * 60_000).toISOString(), planningHoldMinutes: 120, tableIds: ['t3', 't4'],
    tableNumbers: ['T1-03', 'T1-04'], sessionId: null, note: 'Sinh nhật, chuẩn bị bánh', requestedArrivalAt: null, requestedPartySize: null, changeNote: null,
  } as unknown as ReservationRow
  const preorder = {
    reservationId: 'r1', totalAmount: 1_150_000,
    currentSnapshot: { revision: 1, total_amount: 1_150_000, note: null, items: [
      { name: 'Lẩu riêu cua bắp bò', quantity: 1, price: 450_000 }, { name: 'Bò tơ cuộn rau rừng', quantity: 2, price: 180_000 }, { name: 'Bia Tiger bạc (Tháp 3L)', quantity: 1, price: 340_000 },
    ] },
  } as unknown as ReservationPreorderRow
  const noop = () => undefined
  return (
    <div className="flex h-[720px] overflow-hidden rounded-xl border border-border [&>aside]:static [&>aside]:max-h-none [&>aside]:w-[400px] [&>aside]:rounded-none [&>aside]:shadow-none">
      <ReservationDetail
        reservation={reservation}
        bar={{ key: 'b', kind: 'reservation', start: 0, end: 0, clippedStart: false, state: 'late', lane: 0, lateMinutes: 25 }}
        preorder={preorder} busy={false} canSnooze
        onClose={noop} onConfirm={noop} onArrive={noop} onSnooze={noop} onNoShow={noop} onCancel={noop}
      />
    </div>
  )
}
