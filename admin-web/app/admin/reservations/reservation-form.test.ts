import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ReservationForm,
  reservationIsoToVietnamLocalInput,
  validateManualReservation,
  validateRescheduleReservation,
  vietnamLocalInputToReservationIso,
} from './reservation-form'

describe('reservation form rules', () => {
  it('form tạo tay có đủ trường nghiệp vụ và không render picker bàn trước khi booking tồn tại', () => {
    const html = renderToStaticMarkup(createElement(ReservationForm, {
      mode: 'manual',
      onSubmit: () => undefined,
      onCancel: () => undefined,
      busy: false,
      actionError: null,
    }))

    expect(html).toContain('Tên khách')
    expect(html).toContain('Số điện thoại')
    expect(html).toContain('Lý do tạo tay')
    expect(html).not.toContain('Đã chọn 0 bàn')
  })

  it('round-trip datetime-local theo Asia/Ho_Chi_Minh thay vì timezone máy', () => {
    const iso = vietnamLocalInputToReservationIso('2026-09-21T19:15')
    expect(iso).toBe('2026-09-21T12:15:00.000Z')
    expect(reservationIsoToVietnamLocalInput(iso!)).toBe('2026-09-21T19:15')
  })

  it('bắt đủ tên, điện thoại, số khách, giờ đến và lý do khi chủ quán tạo tay', () => {
    expect(validateManualReservation({
      customerName: ' ', customerPhone: 'abc', partySize: '0', arrivalLocal: '', reason: ' ',
    })).toEqual({
      customerName: 'Nhập tên khách',
      customerPhone: 'Nhập số điện thoại hợp lệ',
      partySize: 'Số khách phải lớn hơn 0',
      arrivalLocal: 'Chọn giờ đến',
      reason: 'Nhập lý do tạo tay',
    })
  })

  it('đổi lịch bắt lý do và bắt ít nhất một bàn khi booking đã giữ bàn', () => {
    expect(validateRescheduleReservation({
      arrivalLocal: '2026-09-21T19:15', partySize: '8', reason: ' ', selectedTableIds: new Set(),
      requiresTable: true,
    })).toEqual({ reason: 'Nhập lý do đổi lịch/bàn', tableIds: 'Chọn ít nhất một bàn' })

    expect(validateRescheduleReservation({
      arrivalLocal: '2026-09-21T19:15', partySize: '8', reason: 'Khách đổi giờ', selectedTableIds: new Set(),
      requiresTable: false,
    })).toEqual({})
  })
})
