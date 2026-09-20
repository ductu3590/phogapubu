import { describe, expect, it } from 'vitest'
import type { FloorSnapshot } from '@/lib/area-layout'
import type { OpenTableSession } from '@/lib/actions/table-session'
import {
  buildReservationTableGroups,
  reservationSelectionHint,
} from './reservation-table-picker'

const floor: FloorSnapshot = {
  version: 1,
  areas: [
    { id: 'inside', name: 'Trong nhà' },
    { id: 'garden', name: 'Sân vườn' },
  ],
  tables: [
    { id: 't3', table_number: 'Bàn 3', area_id: 'garden', pos_x: 1, pos_y: 0 },
    { id: 't2', table_number: 'Bàn 2', area_id: 'inside', pos_x: 1, pos_y: 0 },
    { id: 't1', table_number: 'Bàn 1', area_id: 'inside', pos_x: 0, pos_y: 0 },
    { id: 't4', table_number: 'Bàn 4', area_id: null, pos_x: null, pos_y: null },
  ],
}

const session = (tableId: string): OpenTableSession => ({
  session_id: 'session-1', table_id: tableId, table_number: 'Bàn 3',
  tables: [{ id: tableId, table_number: 'Bàn 3' }], is_open_ordering: true,
  status: 'open', close_reason: null, opened_at: '', opened_by: 'customer', last_activity_at: '',
  has_host: true, needs_review: false, order_count: 1, total: 0, unpaid_total: 0,
  cooking_count: 0, idle_timeout_minutes: 360, orders: [],
})

describe('reservation table picker model', () => {
  it('nhóm theo thứ tự khu vực và thứ tự lưới, để bàn chưa phân khu ở cuối', () => {
    const groups = buildReservationTableGroups({
      floor,
      sessions: [],
      selectedTableIds: new Set(),
      currentReservationTableIds: new Set(),
      otherReservationTableIds: new Set(),
    })

    expect(groups.map((group) => [group.name, group.tables.map((table) => table.tableNumber)])).toEqual([
      ['Trong nhà', ['Bàn 1', 'Bàn 2']],
      ['Sân vườn', ['Bàn 3']],
      ['Chưa phân khu', ['Bàn 4']],
    ])
  })

  it('khóa bàn đang có khách hoặc đã giữ cho booking khác, nhưng giữ bàn của booking này được chọn', () => {
    const groups = buildReservationTableGroups({
      floor,
      sessions: [session('t3')],
      selectedTableIds: new Set(['t1']),
      currentReservationTableIds: new Set(['t1']),
      otherReservationTableIds: new Set(['t2']),
    })
    const tables = new Map(groups.flatMap((group) => group.tables).map((table) => [table.id, table]))

    expect(tables.get('t1')).toMatchObject({ selected: true, disabled: false })
    expect(tables.get('t2')).toMatchObject({ disabled: true, reason: 'Đã giữ cho booking khác' })
    expect(tables.get('t3')).toMatchObject({ disabled: true, reason: 'Đang có khách' })
  })

  it('chỉ coi số bàn gợi ý là nhắc việc, không biến nó thành điều kiện submit', () => {
    expect(reservationSelectionHint(new Set(['t1']), 2)).toBe('Đã chọn 1 bàn · gợi ý 2 bàn')
    expect(reservationSelectionHint(new Set(['t1', 't2', 't3']), 2)).toBe('Đã chọn 3 bàn · gợi ý 2 bàn')
  })
})
