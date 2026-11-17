import { describe, expect, it } from 'vitest'
import type { OpenTableSession } from './actions/table-session'
import type { ReservationRow } from './actions/reservations'
import type { GridContext } from './pos-floor-grid'
import type { TrayAssignment } from './tray-colors'
import { gridTileAction, gridTileView } from './pos-grid-tile'

const NOW = new Date('2026-11-17T12:30:00Z').getTime() // 19:30 giờ VN
const sess = (o: Record<string, unknown> = {}) => ({
  session_id: 's1', status: 'open', total: 450000, opened_at: '2026-11-17T12:00:00Z',
  needs_review: false, orders: [{ status: 'confirmed', order_source: 'customer', needs_pos_confirmation: false }],
  ...o,
}) as unknown as OpenTableSession
const held = (id: string, arrival: string) => ({
  reservationId: id, status: 'confirmed', sessionId: null, arrivalAt: arrival, planningHoldMinutes: 120, tableIds: ['t1'],
}) as unknown as ReservationRow
const empty: GridContext = { sessionByTable: new Map(), heldByTable: new Map() }
const base = { trays: new Map<string, TrayAssignment>(), callingSessionIds: new Set<string>(), now: NOW }

describe('gridTileView', () => {
  it('bàn trống: visual free, không tiền, không giờ', () => {
    const v = gridTileView('t1', { ...empty, ...base })
    expect(v).toEqual({ visual: 'free', money: null, seated: null, trayIndex: null, pending: 0, heldAt: null, calling: false })
  })
  it('bàn đang giữ: visual booked, heldAt "19:30"', () => {
    const v = gridTileView('t1', { ...empty, ...base, heldByTable: new Map([['t1', held('r1', '2026-11-17T12:30:00Z')]]) })
    expect(v.visual).toBe('booked')
    expect(v.heldAt).toBe('19:30')
    expect(v.money).toBeNull()
  })
  it('bàn có phiên: money, seated, trayIndex, calling', () => {
    const s = sess()
    const trays = new Map([['s1', { color: {}, index: 2 } as unknown as TrayAssignment]])
    const v = gridTileView('t1', {
      sessionByTable: new Map([['t1', s]]), heldByTable: new Map(),
      trays, callingSessionIds: new Set(['s1']), now: NOW,
    })
    expect(v).toMatchObject({ visual: 'serving', money: 450000, seated: "30'", trayIndex: 2, calling: true, heldAt: null })
  })
  it('mâm hai bàn: cả hai ô cùng money/seated/trayIndex', () => {
    const s = sess()
    const trays = new Map([['s1', { color: {}, index: 1 } as unknown as TrayAssignment]])
    const c = { sessionByTable: new Map([['t1', s], ['t2', s]]), heldByTable: new Map(), trays, callingSessionIds: new Set<string>(), now: NOW }
    const a = gridTileView('t1', c), b = gridTileView('t2', c)
    expect(a).toEqual(b)
    expect(a.money).toBe(450000)
    expect(a.trayIndex).toBe(1)
  })
  it('chờ duyệt: pending = pendingCount(session), visual pending', () => {
    const s = sess({ orders: [{ status: 'pending', order_source: 'customer' }, { status: 'pending', order_source: 'customer' }] })
    const v = gridTileView('t1', { ...empty, ...base, sessionByTable: new Map([['t1', s]]) })
    expect(v.pending).toBe(2)
    expect(v.visual).toBe('pending')
  })
})

describe('gridTileAction', () => {
  const inp = { mode: 'normal' as const, mergeMode: false, modifier: false, reservationBlocked: false }
  it('normal: có phiên → session (additive = modifier || mergeMode)', () => {
    const ctx = { ...empty, sessionByTable: new Map([['t1', sess()]]) }
    expect(gridTileAction('t1', { ctx, ...inp })).toEqual({ kind: 'session', sessionId: 's1', additive: false })
    expect(gridTileAction('t1', { ctx, ...inp, modifier: true })).toMatchObject({ additive: true })
    expect(gridTileAction('t1', { ctx, ...inp, mergeMode: true })).toMatchObject({ additive: true })
  })
  it('normal: bàn đang giữ → reservation với id đặt bàn sớm nhất', () => {
    const ctx = { ...empty, heldByTable: new Map([['t1', held('r-early', '2026-11-17T12:30:00Z')]]) }
    expect(gridTileAction('t1', { ctx, ...inp })).toEqual({ kind: 'reservation', reservationId: 'r-early' })
  })
  it('normal: bàn trống → pick-free; mergeMode + bàn trống → none', () => {
    expect(gridTileAction('t1', { ctx: empty, ...inp })).toEqual({ kind: 'pick-free', tableId: 't1' })
    expect(gridTileAction('t1', { ctx: empty, ...inp, mergeMode: true })).toEqual({ kind: 'none' })
  })
  it('reservation mode: có phiên hoặc reservationBlocked → none; còn lại → reservation-pick', () => {
    const r = { ...inp, mode: 'reservation' as const }
    expect(gridTileAction('t1', { ctx: { ...empty, sessionByTable: new Map([['t1', sess()]]) }, ...r })).toEqual({ kind: 'none' })
    expect(gridTileAction('t1', { ctx: empty, ...r, reservationBlocked: true })).toEqual({ kind: 'none' })
    expect(gridTileAction('t1', { ctx: empty, ...r })).toEqual({ kind: 'reservation-pick', tableId: 't1' })
  })
})
