import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCashBookList, type CashbookFilters } from './cash-book'
import { buildCashbookWorkbook, cashbookWorkbookFileName } from './cashbook-xlsx'

const raw = (over: Record<string, unknown>) => ({
  id: 'e', kind: 'payment', method: 'cash', category_id: 'c1', category_name: 'Đá', report_group: 'operating_expense',
  amount: 50000, note: 'đá cây', counterparty: 'Anh Ba', business_date: '2026-11-09', created_at: '2026-11-09T05:30:00Z',
  created_by_name: 'Thu ngân Lan', cash_shift_id: 'sh1', shift_opened_at: '2026-11-09T01:00:00Z', source: 'pos_drawer',
  source_ref: null, voided_at: null, voided_by_name: null, void_reason: null, ...over,
})
// Server trả totals tính trên TOÀN BỘ phiếu khớp lọc (có thể > 2000 dòng) — cố ý KHÁC tổng các dòng dưới đây.
const list = parseCashBookList({
  entries: [
    raw({ id: 'e1' }),
    raw({ id: 'e2', kind: 'receipt', method: 'bank', category_name: 'Thu khác', report_group: 'other_income', amount: 200000,
      source: 'manual', cash_shift_id: null, shift_opened_at: null, counterparty: null }),
    raw({ id: 'e3', amount: 30000, voided_at: '2026-11-09T06:00:00Z', voided_by_name: 'Chủ', void_reason: 'ghi nhầm' }),
    raw({ id: 'e4', category_name: 'Nhập hàng', report_group: 'inventory_purchase', method: 'bank', amount: 1500000,
      source: 'inventory_receipt', source_ref: 'doc1', cash_shift_id: null, shift_opened_at: null }),
  ],
  totals: { receipt_cash: 111, receipt_bank: 222, payment_cash: 333, payment_bank: 444 },
  truncated: true,
})
const filters: CashbookFilters = { from: '2026-11-01', to: '2026-11-09', kind: null, method: 'cash', categoryId: null }
const meta = { storeName: 'Yên Garden', filters, exportedAt: new Date('2026-11-09T15:00:00Z'), exportedBy: 'Chủ quán Tú · Chủ quán' }

async function roundTrip() {
  const buf = await buildCashbookWorkbook(list, meta).xlsx.writeBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}
const rowValues = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1)
const findRow = (ws: ExcelJS.Worksheet, label: string) => {
  for (let i = 1; i <= ws.rowCount; i++) if (ws.getRow(i).getCell(1).value === label) return ws.getRow(i)
  throw new Error(`không có dòng ${label}`)
}

describe('Excel sổ thu chi', () => {
  it('hai sheet Tổng + Phiếu, đọc lại được', async () => {
    const wb = await roundTrip()
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Tổng', 'Phiếu'])
  })

  it('sheet Phiếu: cột Ngày KD, Giờ, Loại, Danh mục, Nhóm báo cáo, Số tiền, Phương thức, Người nộp/nhận, Ghi chú, Người ghi, Ca, Nguồn, Trạng thái', async () => {
    const ws = (await roundTrip()).getWorksheet('Phiếu')!
    expect(rowValues(ws, 1)).toEqual(['Ngày KD', 'Giờ', 'Loại', 'Danh mục', 'Nhóm báo cáo', 'Số tiền', 'Phương thức',
      'Người nộp/nhận', 'Ghi chú', 'Người ghi', 'Ca', 'Nguồn', 'Trạng thái'])
    expect(rowValues(ws, 2)).toEqual(['09/11/2026', '12:30', 'Chi', 'Đá', 'Chi phí vận hành', 50000, 'Tiền mặt', 'Anh Ba',
      'đá cây', 'Thu ngân Lan', 'từ 08:00 09/11', 'Thu/Chi két', 'Hiệu lực'])
    expect(rowValues(ws, 3).slice(2, 7)).toEqual(['Thu', 'Thu khác', 'Thu khác', 200000, 'Chuyển khoản'])
    expect(ws.getRow(5).getCell(12).value).toBe('Phiếu nhập kho')
    expect(ws.rowCount).toBe(5)
  })

  it('phiếu huỷ có Trạng thái Đã huỷ: <lý do>, vẫn có dòng', async () => {
    const ws = (await roundTrip()).getWorksheet('Phiếu')!
    expect(ws.getRow(4).getCell(13).value).toBe('Đã huỷ: ghi nhầm')
    expect(ws.getRow(4).getCell(6).value).toBe(30000)
  })

  it('sheet Tổng: thu TM, thu CK, chi TM, chi CK, chênh lệch — bằng totals của server, không cộng lại ở TS', async () => {
    const ws = (await roundTrip()).getWorksheet('Tổng')!
    expect(findRow(ws, 'Thu tiền mặt').getCell(2).value).toBe(111)
    expect(findRow(ws, 'Thu chuyển khoản').getCell(2).value).toBe(222)
    expect(findRow(ws, 'Chi tiền mặt').getCell(2).value).toBe(333)
    expect(findRow(ws, 'Chi chuyển khoản').getCell(2).value).toBe(444)
    expect(findRow(ws, 'Tổng thu').getCell(2).value).toBe(333)
    expect(findRow(ws, 'Tổng chi').getCell(2).value).toBe(777)
    expect(findRow(ws, 'Chênh lệch (thu − chi)').getCell(2).value).toBe(-444)
    expect(findRow(ws, 'Quán').getCell(2).value).toBe('Yên Garden')
    expect(findRow(ws, 'Từ ngày').getCell(2).value).toBe('01/11/2026')
    expect(findRow(ws, 'Đến ngày').getCell(2).value).toBe('09/11/2026')
    expect(findRow(ws, 'Phương thức').getCell(2).value).toBe('Tiền mặt')
    expect(findRow(ws, 'Xuất lúc').getCell(2).value).toBe('09/11/2026 22:00')
    // Danh sách bị cắt 2000 dòng: ghi rõ, tổng vẫn đủ.
    let note = false
    ws.eachRow((r) => { if (String(r.getCell(1).value).includes('2000 phiếu')) note = true })
    expect(note).toBe(true)
  })

  it('Số tiền là số (không phải chuỗi), định dạng #,##0', async () => {
    const wb = await roundTrip()
    const ws = wb.getWorksheet('Phiếu')!
    for (let i = 2; i <= ws.rowCount; i++) {
      expect(typeof ws.getRow(i).getCell(6).value).toBe('number')
      expect(ws.getRow(i).getCell(6).numFmt).toBe('#,##0')
    }
    const sum = wb.getWorksheet('Tổng')!
    expect(findRow(sum, 'Tổng thu').getCell(2).numFmt).toBe('#,##0')
  })

  it('tên file không dấu: so-thu-chi_<slug quán>_<from>_<to>.xlsx', () => {
    expect(cashbookWorkbookFileName('Yên Garden', '2026-11-01', '2026-11-09')).toBe('so-thu-chi_yen-garden_2026-11-01_2026-11-09.xlsx')
    expect(cashbookWorkbookFileName('Bia lẩu Bảo Lương!', '2026-11-09', '2026-11-09')).toBe('so-thu-chi_bia-lau-bao-luong_2026-11-09_2026-11-09.xlsx')
    expect(cashbookWorkbookFileName('', '2026-11-09', '2026-11-09')).toBe('so-thu-chi_2026-11-09_2026-11-09.xlsx')
  })
})
