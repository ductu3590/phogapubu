import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseBillsReport } from './bills-report'
import { buildBillsWorkbook, billsWorkbookFileName } from './bills-report-xlsx'

const report = parseBillsReport({
  date: '2026-10-09',
  totals: { revenue: 1281000, cash: 992000, bank: 289000, other: 0, bills_count: 3 },
  open: { tables_count: 0, provisional_total: 0 },
  bills: [
    { key: 'C:1', paid_at: '2026-10-09T04:15:00Z', opened_at: '2026-10-09T02:22:00Z', session_ids: ['00000000-0000-0000-0000-00000000b30a'],
      order_ids: ['o1'], merged: true, tables_count: 2, total: 587000, discount_total: 0, instrument: 'cash', order_type: 'dine_in',
      items_count: 5, table_label: 'Bàn 8, Bàn 9', customer_name: 'Anh Tú', party_size: 8, adjustments_count: 0, received_by_name: 'Thu ngân Lan' },
  ],
  waiting: [],
  cancelled: [
    { order_id: 'f54f2562-f5bf-4752-a937-c8c9f1da5382', at: '2026-10-09T08:20:00Z', created_at: '2026-10-09T08:15:00Z', kind: 'rejected',
      reason_code: 'out_of_stock', total: 274000, table_label: 'Bàn 9' },
  ],
  adjustments: [
    { at: '2026-10-09T04:06:00Z', type: 'quantity', item_name: 'Ếch xào lá lốt', quantity: 1, old_quantity: 2, new_quantity: 1,
      amount: -135000, reason: 'Bếp báo hết', table_label: 'Bàn 3', by_name: 'baoluong@mevo.vn' },
  ],
})
const meta = { storeName: 'Bia lẩu Bảo Lương', date: '2026-10-09', exportedAt: new Date('2026-10-09T15:00:00Z'), exportedBy: 'Chủ quán' }

async function roundTrip() {
  const buf = await buildBillsWorkbook(report, meta).xlsx.writeBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

describe('Excel báo cáo ngày (A04-3)', () => {
  it('3 sheet đúng tên, đọc lại được', async () => {
    const wb = await roundTrip()
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Tổng hợp', 'Hoá đơn', 'Điều chỉnh'])
  })

  it('Tổng hợp: tiền là SỐ (định dạng #,##0), không phải chữ', async () => {
    const ws = (await roundTrip()).getWorksheet('Tổng hợp')!
    const find = (label: string) => {
      let v: unknown
      ws.eachRow((row) => { if (row.getCell(1).value === label) v = row.getCell(2) })
      return v as ExcelJS.Cell
    }
    expect(find('Tổng thực thu').value).toBe(1281000)
    expect(find('Tổng thực thu').numFmt).toBe('#,##0')
    expect(find('Tiền mặt').value).toBe(992000)
    expect(find('Chuyển khoản').value).toBe(289000)
    expect(find('Số hoá đơn đã thu').value).toBe(3)
    expect(find('Quán').value).toBe('Bia lẩu Bảo Lương')
    expect(find('Ngày').value).toBe('09/10/2026')
    expect(find('Xuất lúc').value).toBe('09/10/2026 22:00')
  })

  it('Hoá đơn: tiêu đề + mỗi dòng bảng một hàng, giờ theo VN, lý do huỷ', async () => {
    const ws = (await roundTrip()).getWorksheet('Hoá đơn')!
    expect(ws.getRow(1).getCell(1).value).toBe('Mã')
    const values = (r: number) => (ws.getRow(r).values as unknown[]).slice(1)
    const all = [values(2), values(3)]
    const paid = all.find((v) => v[1] === 'Đã thanh toán')!
    expect(paid).toEqual(expect.arrayContaining(['Bàn 8, Bàn 9', 'Anh Tú', 8, '09:22', '11:15', 5, 'Tiền mặt', 587000, 'Thu ngân Lan']))
    const cancelled = all.find((v) => v[1] === 'Từ chối')!
    expect(cancelled).toEqual(expect.arrayContaining(['#DA5382', 'Bàn 9', 274000, 'Hết đồ']))
  })

  it('Điều chỉnh: loại tiếng Việt, số lượng cũ → mới, tiền âm khi bớt', async () => {
    const ws = (await roundTrip()).getWorksheet('Điều chỉnh')!
    const v = (ws.getRow(2).values as unknown[]).slice(1)
    expect(v).toEqual(['11:06', 'Sửa số lượng', 'Bàn 3', 'Ếch xào lá lốt', '2 → 1', -135000, 'Bếp báo hết', 'baoluong@mevo.vn'])
  })

  it('tên file: bao-cao-<slug>-<ngày>.xlsx, slug bỏ dấu', () => {
    expect(billsWorkbookFileName('Bia lẩu Bảo Lương', '2026-10-09')).toBe('bao-cao-bia-lau-bao-luong-2026-10-09.xlsx')
    expect(billsWorkbookFileName('', '2026-10-09')).toBe('bao-cao-2026-10-09.xlsx')
  })
})
