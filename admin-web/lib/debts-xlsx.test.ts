import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { DebtCustomerSummary } from './debts'
import { buildDebtsWorkbook, debtsWorkbookFileName } from './debts-xlsx'

const c = (over: Partial<DebtCustomerSummary>): DebtCustomerSummary => ({
  id: 'c', name: 'Cty Hoà Bình', phone: '0912345678', kind: 'company', note: 'kế toán chị Lan', isActive: true,
  outstanding: 650_000, openBills: 2, oldestOpenAt: '2026-11-01T12:00:00Z', lastPaymentAt: null, ...over,
})
const customers = [c({ id: 'a' }), c({ id: 'b', name: 'Anh Long', phone: null, kind: 'person', note: null, outstanding: 90_000, openBills: 1, oldestOpenAt: '2026-11-05T16:30:00Z' })]
const meta = { storeName: 'Yên Garden', exportedAt: new Date('2026-11-09T15:00:00Z'), exportedBy: 'Chủ quán Tú · Chủ quán' }

async function roundTrip(list = customers) {
  const buf = await buildDebtsWorkbook(list, meta).xlsx.writeBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as ArrayBuffer)
  return wb
}
const rowValues = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1)

describe('buildDebtsWorkbook', () => {
  it('một sheet Công nợ: tiêu đề, cột Tên, SĐT, Loại, Tổng nợ (định dạng tiền), Số bill nợ, Bill nợ cũ nhất, Ghi chú; dòng tổng', async () => {
    const wb = await roundTrip()
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Công nợ'])
    const ws = wb.getWorksheet('Công nợ')!
    expect(ws.getCell('A1').value).toBe('CÔNG NỢ KHÁCH HÀNG')
    expect(ws.getCell('A1').font?.bold).toBe(true)
    const all = Array.from({ length: ws.rowCount }, (_, i) => rowValues(ws, i + 1))
    expect(all).toContainEqual(['Quán', 'Yên Garden'])
    expect(all.some((r) => r[0] === 'Xuất lúc' && String(r[1]).startsWith('09/11/2026 22:00'))).toBe(true)
    expect(all).toContainEqual(['Người xuất', 'Chủ quán Tú · Chủ quán'])
    const head = all.findIndex((r) => r[0] === 'Tên')
    expect(all[head]).toEqual(['Tên', 'SĐT', 'Loại', 'Tổng nợ', 'Số bill nợ', 'Bill nợ cũ nhất', 'Ghi chú'])
    expect(all[head + 1]).toEqual(['Cty Hoà Bình', '0912345678', 'Cơ quan', 650_000, 2, '01/11/2026', 'kế toán chị Lan'])
    // 16:30Z = 23:30 giờ VN, vẫn ngày 05/11
    expect(all[head + 2]).toEqual(['Anh Long', '', 'Cá nhân', 90_000, 1, '05/11/2026', ''])
    expect(all[head + 3].slice(0, 5)).toEqual(['Tổng', '', '', 740_000, 3])
    expect(ws.getRow(head + 2).getCell(4).numFmt).toBe('#,##0')
    expect(ws.getRow(head + 4).getCell(4).numFmt).toBe('#,##0')
    expect(ws.getRow(head + 4).font?.bold).toBe(true)
  })
  it('khách không còn nợ: ô bill cũ nhất trống; danh sách rỗng vẫn có dòng tổng 0', async () => {
    const ws = (await roundTrip([c({ outstanding: 0, openBills: 0, oldestOpenAt: null })])).getWorksheet('Công nợ')!
    const all = Array.from({ length: ws.rowCount }, (_, i) => rowValues(ws, i + 1))
    const head = all.findIndex((r) => r[0] === 'Tên')
    expect(all[head + 1][5]).toBe('')
    const empty = (await roundTrip([])).getWorksheet('Công nợ')!
    const rows = Array.from({ length: empty.rowCount }, (_, i) => rowValues(empty, i + 1))
    expect(rows.at(-1)?.slice(0, 5)).toEqual(['Tổng', '', '', 0, 0])
  })
})

it('tên file: cong-no-<slug quán>-<ngày>.xlsx', () => {
  expect(debtsWorkbookFileName('Yên Garden', '2026-11-09')).toBe('cong-no-yen-garden-2026-11-09.xlsx')
  expect(debtsWorkbookFileName('', '2026-11-09')).toBe('cong-no-2026-11-09.xlsx')
})
