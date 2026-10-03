'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { clock } from '@/lib/pos-timeline'
import { ReservationForm, type ReservationFormSubmit } from '../reservations/reservation-form'

// Đặt bàn mới từ POS: bấm khoảng trống trên Timeline (có sẵn bàn + giờ) hoặc nút "Đặt bàn" (chưa có bàn).
// Dùng nguyên form tạo tay của trang Đặt bàn; trang cha tạo đặt bàn rồi giữ đúng bàn đã bấm.
export default function NewReservationSheet({
  table,
  arrivalAt,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  table: { id: string; table_number: string } | null
  arrivalAt: string
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: ReservationFormSubmit) => void
}) {
  // Form tự giữ state; mount lại mỗi lần mở (component cha render có điều kiện) nên không lẫn dữ liệu cũ.
  const [open] = useState(true)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      placement="side"
      title="Đặt bàn mới"
      description={table
        ? `${table.table_number} · từ ${clock(new Date(arrivalAt).getTime())} — tạo xong giữ luôn bàn này`
        : 'Chưa chọn bàn — đặt bàn vào hàng "Chưa xếp bàn", xác nhận & chọn bàn sau'}
    >
      <ReservationForm
        mode="manual"
        initial={{ arrivalAt }}
        busy={busy}
        actionError={error}
        onCancel={onClose}
        onSubmit={onSubmit}
      />
    </Dialog>
  )
}
