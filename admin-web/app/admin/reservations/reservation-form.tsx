'use client'

import { useState } from 'react'

const fieldClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100'

export type ReservationFormErrors = Partial<Record<
  'customerName' | 'customerPhone' | 'partySize' | 'arrivalLocal' | 'reason' | 'tableIds',
  string
>>

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

function vietnamParts(date: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function vietnamLocalInputToReservationIso(value: string): string | null {
  if (!LOCAL_DATETIME.test(value)) return null
  const parsed = new Date(`${value}:00+07:00`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export function reservationIsoToVietnamLocalInput(value: string): string | null {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = vietnamParts(date)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function phoneValid(value: string): boolean {
  return value.replace(/\D/g, '').length >= 8
}

function partySizeValid(value: string): boolean {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
}

export function validateManualReservation({
  customerName, customerPhone, partySize, arrivalLocal, reason,
}: {
  customerName: string
  customerPhone: string
  partySize: string
  arrivalLocal: string
  reason: string
}): ReservationFormErrors {
  const errors: ReservationFormErrors = {}
  if (!customerName.trim()) errors.customerName = 'Nhập tên khách'
  if (!phoneValid(customerPhone)) errors.customerPhone = 'Nhập số điện thoại hợp lệ'
  if (!partySizeValid(partySize)) errors.partySize = 'Số khách phải lớn hơn 0'
  if (!vietnamLocalInputToReservationIso(arrivalLocal)) errors.arrivalLocal = 'Chọn giờ đến'
  if (!reason.trim()) errors.reason = 'Nhập lý do tạo tay'
  return errors
}

export function validateRescheduleReservation({
  arrivalLocal, partySize, reason, selectedTableIds, requiresTable,
}: {
  arrivalLocal: string
  partySize: string
  reason: string
  selectedTableIds: Set<string>
  requiresTable: boolean
}): ReservationFormErrors {
  const errors: ReservationFormErrors = {}
  if (!vietnamLocalInputToReservationIso(arrivalLocal)) errors.arrivalLocal = 'Chọn giờ đến'
  if (!partySizeValid(partySize)) errors.partySize = 'Số khách phải lớn hơn 0'
  if (!reason.trim()) errors.reason = 'Nhập lý do đổi lịch/bàn'
  if (requiresTable && selectedTableIds.size === 0) errors.tableIds = 'Chọn ít nhất một bàn'
  return errors
}

export type ReservationFormSubmit = {
  customerName: string
  customerPhone: string
  partySize: number
  arrivalAt: string
  note: string | null
  reason: string
}

export function ReservationForm({
  mode,
  initial,
  selectedTableIds = new Set<string>(),
  requiresTable = false,
  children,
  onSubmit,
  onCancel,
  busy,
  actionError,
}: {
  mode: 'manual' | 'reschedule'
  initial?: Partial<{
    customerName: string
    customerPhone: string
    partySize: number
    arrivalAt: string
    note: string | null
  }>
  selectedTableIds?: Set<string>
  requiresTable?: boolean
  children?: React.ReactNode
  onSubmit: (values: ReservationFormSubmit) => void
  onCancel: () => void
  busy: boolean
  actionError: string | null
}) {
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? '')
  const [partySize, setPartySize] = useState(initial?.partySize ? String(initial.partySize) : '')
  const [arrivalLocal, setArrivalLocal] = useState(
    initial?.arrivalAt ? reservationIsoToVietnamLocalInput(initial.arrivalAt) ?? '' : '',
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<ReservationFormErrors>({})
  const manual = mode === 'manual'

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = manual
      ? validateManualReservation({ customerName, customerPhone, partySize, arrivalLocal, reason })
      : validateRescheduleReservation({ arrivalLocal, partySize, reason, selectedTableIds, requiresTable })
    setErrors(nextErrors)
    const arrivalAt = vietnamLocalInputToReservationIso(arrivalLocal)
    if (Object.keys(nextErrors).length || !arrivalAt) return
    onSubmit({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      partySize: Number(partySize),
      arrivalAt,
      note: note.trim() || null,
      reason: reason.trim(),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {manual && (
        <>
          <Field label="Tên khách" error={errors.customerName}>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Số điện thoại" error={errors.customerPhone}>
            <input inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className={fieldClass} />
          </Field>
        </>
      )}
      <Field label="Số khách" error={errors.partySize}>
        <input type="number" min="1" inputMode="numeric" value={partySize} onChange={(event) => setPartySize(event.target.value)} className={fieldClass} />
      </Field>
      <Field label="Giờ đến" error={errors.arrivalLocal}>
        <input type="datetime-local" value={arrivalLocal} onChange={(event) => setArrivalLocal(event.target.value)} className={fieldClass} />
      </Field>
      <Field label="Ghi chú (không bắt buộc)">
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className={fieldClass} />
      </Field>
      {children}
      <Field label={manual ? 'Lý do tạo tay' : 'Lý do đổi lịch/bàn'} error={errors.reason}>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className={fieldClass} />
      </Field>
      {errors.tableIds && <p className="text-sm font-medium text-red-700">{errors.tableIds}</p>}
      {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700">Hủy</button>
        <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Đang lưu…' : manual ? 'Tạo đặt bàn' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-gray-700">
      {label}
      <span className="mt-1 block">{children}</span>
      {error && <span className="mt-1 block text-xs font-medium text-red-700">{error}</span>}
    </label>
  )
}
