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
      order_ids: ['o1'], merged: true, tables_count: 2, total: 587000, discount_total: 15500, bill_discount: 15500, instrument: 'cash', order_type: 'dine_in',
      items_count: 5, table_label: 'Bàn 8, Bàn 9', customer_name: 'Anh Tú', party_size: 8, adjustments_count: 0, received_by_name: 'Thu ngân Lan' },
    // Mig 112a: bill thu kết hợp, có từng khoản.
    { key: 'P:pay-1', paid_at: '2026-10-09T05:00:00Z', opened_at: '2026-10-09T03:00:00Z', session_ids: ['00000000-0000-0000-0000-00000000c40b'],
      order_ids: ['o2'], merged: false, tables_count: 1, total: 1000000, discount_total: 0, bill_discount: 0, instrument: 'mixed', order_type: 'dine_in',
      items_count: 3, table_label: 'Bàn 2', adjustments_count: 0, received_by_name: 'Thu ngân Lan',
      payments: [{ instrument: 'cash', amount: 400000 }, { instrument: 'bank', amount: 600000 }], cash_given: 500000, change_amount: 100000 },
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
    expect(find('Giảm giá (tổng)').value).toBe(15500)
    expect(find('Trong đó giảm giá bill').value).toBe(15500)
    expect(find('Quán').value).toBe('Bia lẩu Bảo Lương')
    expect(find('Ngày').value).toBe('09/10/2026')
    expect(find('Xuất lúc').value).toBe('09/10/2026 22:00')
  })

  it('Tổng hợp: quán có giờ bắt đầu ngày thì thêm dòng Khoảng giờ ngay sau Ngày, quán 00:00 thì không', () => {
    const labels = (r: typeof report) => {
      const ws = buildBillsWorkbook(r, meta).getWorksheet('Tổng hợp')!
      const out: unknown[][] = []
      ws.eachRow((row) => out.push([row.getCell(1).value, row.getCell(2).value]))
      return out
    }
    const shifted = { ...report, dayFrom: '2026-10-08T22:00:00+00:00', dayTo: '2026-10-09T22:00:00+00:00' }
    const rows = labels(shifted)
    const i = rows.findIndex((x) => x[0] === 'Ngày')
    expect(rows[i + 1]).toEqual(['Khoảng giờ', '05:00 09/10 – 05:00 10/10'])
    expect(labels(report).some((x) => x[0] === 'Khoảng giờ')).toBe(false)
  })

  it('Hoá đơn: tiêu đề + mỗi dòng bảng một hàng, giờ theo VN, lý do huỷ', async () => {
    const ws = (await roundTrip()).getWorksheet('Hoá đơn')!
    expect(ws.getRow(1).getCell(1).value).toBe('Mã')
    const values = (r: number) => (ws.getRow(r).values as unknown[]).slice(1)
    const all = [values(2), values(3), values(4)]
    const paid = all.find((v) => v[1] === 'Đã thanh toán' && v[2] === 'Bàn 8, Bàn 9')!
    expect(paid).toEqual(expect.arrayContaining(['Bàn 8, Bàn 9', 'Anh Tú', 8, '09:22', '11:15', 5, 'Tiền mặt', 587000, 'Thu ngân Lan']))
    // GG-1: cột Giảm giá (tổng, gồm voucher) và Giảm giá bill tách riêng.
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    const iBill = header.indexOf('Giảm giá bill')
    expect(iBill).toBeGreaterThan(-1)
    expect(paid[header.indexOf('Giảm giá')]).toBe(15500)
    expect(paid[iBill]).toBe(15500)
    const cancelledRow = all.find((v) => v[1] === 'Từ chối')!
    expect(cancelledRow[iBill] == null || cancelledRow[iBill] === '').toBe(true)
    const cancelled = all.find((v) => v[1] === 'Từ chối')!
    expect(cancelled).toEqual(expect.arrayContaining(['#DA5382', 'Bàn 9', 274000, 'Hết đồ']))
  })

  it('Hoá đơn: cột Tiền mặt / Chuyển khoản ngay sau Phương thức; bill kết hợp tách đúng từng khoản', async () => {
    const ws = (await roundTrip()).getWorksheet('Hoá đơn')!
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    expect(header).toEqual(expect.arrayContaining(['Phương thức', 'Tiền mặt', 'Chuyển khoản']))
    expect(header.indexOf('Tiền mặt')).toBe(header.indexOf('Phương thức') + 1)
    expect(header.indexOf('Chuyển khoản')).toBe(header.indexOf('Phương thức') + 2)
    const rows = [2, 3, 4].map((r) => (ws.getRow(r).values as unknown[]).slice(1))
    const mixedRow = rows.find((v) => v[header.indexOf('Bàn')] === 'Bàn 2')!
    expect(mixedRow[header.indexOf('Phương thức')]).toBe('Kết hợp')
    expect(mixedRow[header.indexOf('Tiền mặt')]).toBe(400000)
    expect(mixedRow[header.indexOf('Chuyển khoản')]).toBe(600000)
    const mixedRowNo = [2, 3, 4].find((r) => ws.getRow(r).getCell(header.indexOf('Bàn') + 1).value === 'Bàn 2')!
    expect(ws.getRow(mixedRowNo).getCell(header.indexOf('Tiền mặt') + 1).numFmt).toBe('#,##0')
    // Bill cũ tiền mặt: đủ số vào cột Tiền mặt, cột Chuyển khoản để trống
    const cashRow = rows.find((v) => v[header.indexOf('Bàn')] === 'Bàn 8, Bàn 9')!
    expect(cashRow[header.indexOf('Tiền mặt')]).toBe(587000)
    expect(cashRow[header.indexOf('Chuyển khoản')] ?? null).toBeNull()
  })

  it('Hoá đơn: cột Khác sau Chuyển khoản + Ghi nợ; mọi dòng đã thu Tiền mặt + Chuyển khoản + Khác = Số tiền', async () => {
    const r = parseBillsReport({
      date: '2026-10-09',
      bills: [
        { key: 'P:1', paid_at: '2026-10-09T05:00:00Z', total: 1000, instrument: 'mixed', table_label: 'Bàn A',
          payments: [{ instrument: 'cash', amount: 400 }, { instrument: 'bank', amount: 600 }] },
        { key: 'C:2', paid_at: '2026-10-09T05:10:00Z', total: 700, instrument: 'cash', table_label: 'Bàn B' },
        { key: 'C:3', paid_at: '2026-10-09T05:20:00Z', total: 300, instrument: 'mixed', table_label: 'Bàn C' }, // bill cũ trộn
        { key: 'O:4', paid_at: '2026-10-09T05:30:00Z', total: 90, instrument: 'other', table_label: 'Bàn D' }, // ví
      ],
    })
    const buf = await buildBillsWorkbook(r, meta).xlsx.writeBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('Hoá đơn')!
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    const iCash = header.indexOf('Tiền mặt'), iBank = header.indexOf('Chuyển khoản'), iOther = header.indexOf('Khác')
    // Mig 123: cột Ghi nợ chen giữa Chuyển khoản và Khác.
    expect(iOther).toBe(iBank + 2)
    expect(iBank).toBe(iCash + 1)
    const n = (v: unknown) => (typeof v === 'number' ? v : 0)
    const byTable: Record<string, number[]> = {}
    for (let row = 2; row <= ws.rowCount; row++) {
      const v = (ws.getRow(row).values as unknown[]).slice(1)
      byTable[v[header.indexOf('Bàn')] as string] = [n(v[iCash]), n(v[iBank]), n(v[iOther])]
      expect(n(v[iCash]) + n(v[iBank]) + n(v[iOther])).toBe(v[header.indexOf('Số tiền')])
    }
    expect(byTable['Bàn A']).toEqual([400, 600, 0])
    expect(byTable['Bàn B']).toEqual([700, 0, 0])
    expect(byTable['Bàn C']).toEqual([0, 0, 300])
    // Phương thức: bill có từng khoản → "Kết hợp"; bill cũ trộn → "Nhiều phương thức"
    const methodOf = (table: string) => {
      for (let row = 2; row <= ws.rowCount; row++) {
        const v = (ws.getRow(row).values as unknown[]).slice(1)
        if (v[header.indexOf('Bàn')] === table) return v[header.indexOf('Phương thức')]
      }
    }
    expect(methodOf('Bàn A')).toBe('Kết hợp')
    expect(methodOf('Bàn C')).toBe('Nhiều phương thức')
    expect(byTable['Bàn D']).toEqual([0, 0, 90])
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

describe('Excel báo cáo ngày — công nợ (mig 123)', () => {
  const debtReport = parseBillsReport({
    date: '2026-11-09',
    totals: { revenue: 470000, cash: 150000, bank: 70000, debt: 230000, other: 20000, bills_count: 4 },
    debt_collections: { cash: 100000, bank: 50000, count: 2 },
    bills: [
      { key: 'P:a', paid_at: '2026-11-09T05:00:00Z', total: 300000, instrument: 'mixed', table_label: 'Bàn 1',
        payments: [{ instrument: 'cash', amount: 100000 }, { instrument: 'debt', amount: 200000 }], debt_customer: { id: 'c', name: 'Cty Hoà Bình' } },
      { key: 'P:b', paid_at: '2026-11-09T06:00:00Z', total: 30000, instrument: 'debt', table_label: 'Bàn 2',
        payments: [{ instrument: 'debt', amount: 30000 }], debt_customer: { id: 'c', name: 'Cty Hoà Bình' } },
      { key: 'P:c', paid_at: '2026-11-09T07:00:00Z', total: 50000, instrument: 'cash', table_label: 'Bàn 3', payments: [{ instrument: 'cash', amount: 50000 }] },
    ],
  })
  const open = async (r: typeof debtReport) => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildBillsWorkbook(r, { ...meta, date: '2026-11-09' }).xlsx.writeBuffer())
    return wb
  }
  const finder = (ws: ExcelJS.Worksheet) => (label: string) => {
    let v: ExcelJS.Cell | undefined
    ws.eachRow((row) => { if (row.getCell(1).value === label) v = row.getCell(2) })
    return v as ExcelJS.Cell
  }

  it('cột Ghi nợ ngay sau Chuyển khoản; Ghi chú "Nợ — <tên>"; Khác không chứa nợ', async () => {
    const ws = (await open(debtReport)).getWorksheet('Hoá đơn')!
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    expect(header).toEqual(expect.arrayContaining(['Tiền mặt', 'Chuyển khoản', 'Ghi nợ']))
    expect(header.indexOf('Ghi nợ')).toBe(header.indexOf('Chuyển khoản') + 1)
    expect(header.indexOf('Khác')).toBe(header.indexOf('Ghi nợ') + 1)
    const rows = Array.from({ length: ws.rowCount - 1 }, (_, i) => (ws.getRow(i + 2).values as unknown[]).slice(1))
    const debtRow = rows.find((v) => v[header.indexOf('Bàn')] === 'Bàn 1')!
    expect(debtRow[header.indexOf('Ghi nợ')]).toBe(200000)
    expect(debtRow[header.indexOf('Tiền mặt')]).toBe(100000)
    expect(debtRow[header.indexOf('Ghi chú')]).toContain('Nợ — Cty Hoà Bình')
    const n = (v: unknown) => (typeof v === 'number' ? v : 0)
    for (const v of rows) {
      expect(n(v[header.indexOf('Khác')])).toBe(0)
      expect(n(v[header.indexOf('Tiền mặt')]) + n(v[header.indexOf('Chuyển khoản')]) + n(v[header.indexOf('Ghi nợ')]) + n(v[header.indexOf('Khác')]))
        .toBe(v[header.indexOf('Số tiền')])
    }
    const allDebt = rows.find((v) => v[header.indexOf('Bàn')] === 'Bàn 2')!
    expect(allDebt[header.indexOf('Phương thức')]).toBe('Ghi nợ')
    expect(ws.getRow(rows.indexOf(debtRow) + 2).getCell(header.indexOf('Ghi nợ') + 1).numFmt).toBe('#,##0')
  })

  it('Tổng hợp: Doanh thu (có nợ) + ba dòng nợ sau Chuyển khoản; thu nợ không cộng vào doanh thu', async () => {
    const ws = (await open(debtReport)).getWorksheet('Tổng hợp')!
    const find = finder(ws)
    expect(find('Doanh thu').value).toBe(470000)
    expect(find('Tổng thực thu')).toBeUndefined()
    for (const l of ['Ghi nợ hôm nay', 'Thu nợ tiền mặt', 'Thu nợ chuyển khoản']) expect(find(l)).toBeTruthy()
    expect([find('Ghi nợ hôm nay').value, find('Thu nợ tiền mặt').value, find('Thu nợ chuyển khoản').value]).toEqual([230000, 100000, 50000])
    const labels: unknown[] = []
    ws.eachRow((row) => labels.push(row.getCell(1).value))
    expect(labels.indexOf('Ghi nợ hôm nay')).toBe(labels.indexOf('Chuyển khoản') + 1)
  })

  it('không nợ, không thu nợ: vẫn "Tổng thực thu", không có ba dòng nợ', async () => {
    const ws = (await roundTrip()).getWorksheet('Tổng hợp')!
    const find = finder(ws)
    expect(find('Tổng thực thu').value).toBe(1281000)
    for (const l of ['Doanh thu', 'Ghi nợ hôm nay', 'Thu nợ tiền mặt', 'Thu nợ chuyển khoản']) expect(find(l)).toBeUndefined()
  })
})
