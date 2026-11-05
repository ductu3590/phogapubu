'use client'

import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import type { FloorSnapshot } from '@/lib/area-layout'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ReservationRow } from '@/lib/actions/reservations'
import { ReservationForm, type ReservationFormSubmit } from '../reservations/reservation-form'
import ReservationTablePicker, {
  buildReservationTableGroups,
  heldTableIdsForReservationWindow,
} from '../reservations/reservation-table-picker'

/** Lý do ghi vào nhật ký đặt bàn — POS không bắt thu ngân gõ lý do (RPC vẫn cần một lý do). */
export const POS_RESERVATION_REASON = 'Thu ngân tạo tại POS'

export type NewReservationSubmit = ReservationFormSubmit & { tableIds: string[] }

// Đặt bàn mới từ POS: nút "+ Đặt lúc" trên Timeline (chọn sẵn bàn + giờ) hoặc nút "Đặt bàn mới".
// Chọn bàn ngay trong form → tạo xong giữ luôn các bàn đó; không chọn bàn → vào hàng "Chưa xếp bàn".
export default function NewReservationSheet({
  table,
  arrivalAt,
  floor,
  sessions,
  reservations,
  planningHoldMinutes,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  table: { id: string; table_number: string } | null
  arrivalAt: string
  floor: FloorSnapshot
  sessions: OpenTableSession[]
  reservations: ReservationRow[]
  planningHoldMinutes: number
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: NewReservationSubmit) => void
}) {
  // Form tự giữ state; mount lại mỗi lần mở (component cha render có điều kiện) nên không lẫn dữ liệu cũ.
  const [open] = useState(true)
  const [arrival, setArrival] = useState<string | null>(arrivalAt)
  const [tableIds, setTableIds] = useState<Set<string>>(() => new Set(table ? [table.id] : []))
  const [pickError, setPickError] = useState<string | null>(null)

  // Bàn đã giữ cho đặt bàn khác trùng khung giờ — server cũng chặn, khoá trước cho đỡ bấm nhầm.
  const heldElsewhere = useMemo(() => arrival
    ? heldTableIdsForReservationWindow(reservations, '', arrival, planningHoldMinutes)
    : new Set<string>(), [reservations, arrival, planningHoldMinutes])

  const toggle = (tableId: string) => {
    setPickError(null)
    setTableIds((current) => {
      const next = new Set(current)
      if (next.has(tableId)) next.delete(tableId)
      else next.add(tableId)
      return next
    })
  }

  // Đổi giờ đến có thể làm bàn đã chọn bị khoá (trùng đặt bàn khác / khách đang ngồi sát giờ hẹn).
  // Chặn ngay ở đây: để server từ chối thì đặt bàn đã tạo sẽ rơi về "Chưa xếp bàn", phải xác nhận lại.
  const submit = (values: ReservationFormSubmit) => {
    const blocked = buildReservationTableGroups({
      floor, sessions, selectedTableIds: tableIds, currentReservationTableIds: new Set(),
      otherReservationTableIds: heldElsewhere, arrivalAt: values.arrivalAt,
    }).flatMap((group) => group.tables).filter((t) => t.selected && t.disabled)
    if (blocked.length > 0) {
      setPickError(`${blocked.map((t) => t.tableNumber).join(', ')} không giữ được vào giờ này (${blocked[0].reason?.toLowerCase()}). Bỏ chọn hoặc đổi giờ.`)
      return
    }
    onSubmit({ ...values, tableIds: [...tableIds] })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      placement="side"
      title="Đặt bàn mới"
      description={'Chọn bàn để giữ luôn; chưa chọn bàn thì đặt bàn vào hàng "Chưa xếp bàn"'}
    >
      <ReservationForm
        mode="manual"
        initial={{ arrivalAt }}
        fixedReason={POS_RESERVATION_REASON}
        onArrivalChange={setArrival}
        busy={busy}
        actionError={pickError ?? error}
        onCancel={onClose}
        onSubmit={submit}
      >
        <div className="text-sm font-semibold text-foreground/80">
          Chọn bàn (không bắt buộc)
          <div className="mt-2">
            <ReservationTablePicker
              floor={floor}
              sessions={sessions}
              selectedTableIds={tableIds}
              currentReservationTableIds={new Set()}
              otherReservationTableIds={heldElsewhere}
              arrivalAt={arrival}
              onToggle={toggle}
            />
          </div>
        </div>
      </ReservationForm>
    </Dialog>
  )
}
