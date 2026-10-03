import { describe, expect, it } from 'vitest'
import { reservationsByTable } from './staff-reserved-tables'

const NOW = Date.parse('2026-10-03T01:04:00Z') // 08:04 giờ VN
const vn = (hhmm: string) => new Date(Date.parse(`2026-10-03T${hhmm}:00+07:00`)).toISOString()
const row = (tableId: string, arrival: string, holdEnd: string) => ({ tableId, arrivalAt: vn(arrival), holdEndsAt: vn(holdEnd) })

describe('reservationsByTable', () => {
  it('08:04, đặt 09:00 → đang giữ (trong 60 phút trước giờ hẹn)', () => {
    expect(reservationsByTable([row('t4', '09:00', '11:00')], NOW).get('t4')?.held).toBe(true)
  })

  it('đặt 20:00 → chỉ ghi giờ, chưa giữ', () => {
    const r = reservationsByTable([row('t4', '20:00', '22:00')], NOW).get('t4')
    expect(r?.held).toBe(false)
  })

  it('bàn có 2 đặt bàn → lấy cái sớm nhất', () => {
    const r = reservationsByTable([row('t4', '20:00', '22:00'), row('t4', '09:00', '11:00')], NOW).get('t4')
    expect(r?.next.arrivalAt).toBe(vn('09:00'))
  })

  it('đã hết giờ giữ bàn → bỏ qua', () => {
    expect(reservationsByTable([row('t4', '06:00', '08:00')], NOW).has('t4')).toBe(false)
  })
})
