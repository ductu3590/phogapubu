import { describe, expect, it } from 'vitest'
import { BULK_TABLES_MAX, normalizeTableName, previewBulkTables } from './bulk-tables'

describe('previewBulkTables', () => {
  it('A, 1→3: A1, A2, A3', () => {
    expect(previewBulkTables({ prefix: 'A', from: 1, to: 3 }, [])).toEqual({ ok: true, create: ['A1', 'A2', 'A3'], skipped: [] })
  })
  it('"Bàn " giữ dấu cách: Bàn 1, Bàn 2; tiền tố rỗng: 1, 2', () => {
    expect(previewBulkTables({ prefix: 'Bàn ', from: 1, to: 2 }, [])).toEqual({ ok: true, create: ['Bàn 1', 'Bàn 2'], skipped: [] })
    expect(previewBulkTables({ prefix: '', from: 1, to: 2 }, [])).toEqual({ ok: true, create: ['1', '2'], skipped: [] })
  })
  it('đúng 100 bàn được; 101 bàn: "Tối đa 100 bàn một lần"', () => {
    expect(BULK_TABLES_MAX).toBe(100)
    const ok = previewBulkTables({ prefix: 'B', from: 1, to: 100 }, [])
    expect(ok.ok && ok.create.length).toBe(100)
    expect(previewBulkTables({ prefix: 'B', from: 1, to: 101 }, [])).toEqual({ ok: false, error: 'Tối đa 100 bàn một lần' })
  })
  it('to < from, số âm, số lẻ thập phân, NaN: đúng câu lỗi', () => {
    const intErr = { ok: false, error: 'Số đầu và số cuối phải là số nguyên từ 0 đến 9999' }
    expect(previewBulkTables({ prefix: 'A', from: 5, to: 2 }, [])).toEqual({ ok: false, error: 'Số cuối phải lớn hơn hoặc bằng số đầu' })
    expect(previewBulkTables({ prefix: 'A', from: -1, to: 2 }, [])).toEqual(intErr)
    expect(previewBulkTables({ prefix: 'A', from: 1.5, to: 3 }, [])).toEqual(intErr)
    expect(previewBulkTables({ prefix: 'A', from: NaN, to: 3 }, [])).toEqual(intErr)
    expect(previewBulkTables({ prefix: 'A', from: 1, to: 10000 }, [])).toEqual(intErr)
  })
  it('tiền tố 21 ký tự: lỗi', () => {
    expect(previewBulkTables({ prefix: 'x'.repeat(21), from: 1, to: 2 }, [])).toEqual({ ok: false, error: 'Tiền tố tối đa 20 ký tự' })
  })
  it('đã có "a1" và " A3 ": A1, A3 vào skipped; A2 vào create', () => {
    expect(previewBulkTables({ prefix: 'A', from: 1, to: 3 }, ['a1', ' A3 '])).toEqual({ ok: true, create: ['A2'], skipped: ['A1', 'A3'] })
  })
  it('cả loạt trùng: create rỗng, skipped đủ', () => {
    expect(previewBulkTables({ prefix: 'A', from: 1, to: 2 }, ['A1', 'A2'])).toEqual({ ok: true, create: [], skipped: ['A1', 'A2'] })
  })
})

describe('normalizeTableName', () => {
  it('trim, gộp khoảng trắng, hạ chữ thường', () => {
    expect(normalizeTableName('  Bàn   VIP  A ')).toBe('bàn vip a')
  })
})
