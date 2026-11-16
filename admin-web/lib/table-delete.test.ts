import { describe, expect, it } from 'vitest'
import { deleteTablesConfirmText, pickHistoryTarget, type DeletableTable } from './table-delete'

const t = (id: string, table_number: string, is_active = true): DeletableTable => ({ id, table_number, is_active })
const tables = [t('a', 'Bàn 10'), t('b', 'Bàn 2'), t('c', 'Bàn 1'), t('d', 'VIP 1'), t('e', 'Bàn 0', false)]

describe('pickHistoryTarget — bàn nhận doanh thu cũ khi xoá bàn', () => {
  it('bàn đầu tiên theo tên tự nhiên, bỏ qua bàn đã Đóng', () => {
    expect(pickHistoryTarget(tables, ['a'])?.table_number).toBe('Bàn 1')
  })
  it('xoá chính "Bàn 1" → "Bàn 2" (không phải "Bàn 10")', () => {
    expect(pickHistoryTarget(tables, ['c'])?.table_number).toBe('Bàn 2')
  })
  it('chỉ còn bàn đã Đóng → lấy bàn đã Đóng', () => {
    expect(pickHistoryTarget(tables, ['a', 'b', 'c', 'd'])?.table_number).toBe('Bàn 0')
  })
  it('xoá hết → null', () => {
    expect(pickHistoryTarget(tables, tables.map((x) => x.id))).toBeNull()
  })
})

describe('deleteTablesConfirmText', () => {
  it('nêu tên bàn xoá và bàn nhận', () => {
    const s = deleteTablesConfirmText(tables, ['a', 'b'])
    expect(s).toContain('Xoá 2 bàn "Bàn 2", "Bàn 10"?')
    expect(s).toContain('chuyển sang "Bàn 1"')
  })
  it('một bàn', () => {
    expect(deleteTablesConfirmText(tables, ['d'])).toContain('Xoá bàn "VIP 1"?')
  })
  it('nhiều bàn → rút gọn danh sách tên', () => {
    const many = Array.from({ length: 9 }, (_, i) => t(`m${i}`, `M${i + 1}`))
    expect(deleteTablesConfirmText([...many, t('k', 'K')], many.map((x) => x.id))).toContain('và 4 bàn khác')
  })
  it('xoá hết bàn → cảnh báo bàn có đơn không xoá được', () => {
    expect(deleteTablesConfirmText(tables, tables.map((x) => x.id))).toContain('KHÔNG xoá được')
  })
})
