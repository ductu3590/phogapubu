'use client'

import { vnDateTimeLabel } from '@/lib/bills-report'
import { groupByCategory } from '@/lib/cash-book'
import { differenceLabel, type CashShiftReport } from '@/lib/cash-shift'
import { useAutoPrint } from '@/lib/print/use-auto-print'

const dong = (n: number) => n.toLocaleString('vi-VN')
const when = (iso: string | null) => (iso ? vnDateTimeLabel(new Date(iso)) : '—')

/** Công nợ trong ca (mig 123 truyền vào). Không có → phiếu như trước khi có công nợ. */
export type ShiftReportDebt = { debtRecorded: number; debtCash: number; debtBank: number }

export type ShiftReportSlipProps = {
  report: CashShiftReport
  storeName: string
  printedAt: string
  printedBy: string
  debt?: ShiftReportDebt | null
  // false: phần mềm in tự in — không vẽ nút In lại, không gọi window.print() từ trang
  autoPrint?: boolean
}

function Row({ name, value, strong = false }: { name: string; value: string; strong?: boolean }) {
  return (
    <div className="row" style={strong ? { fontWeight: 700 } : undefined}>
      <span className="name">{name}</span>
      <span className="num">{value}</span>
    </div>
  )
}

// Phiếu bàn giao ca 80mm (mig 122) — phiếu NỘI BỘ, không quảng cáo MEVO. Props thuần: trang /print/shift-report
// (phiên đăng nhập, get_cash_shift_report) và /print/agent (phần mềm in, cash_shift_report_json) dùng chung.
// Mọi con số lấy nguyên từ server (cash_shift_totals + số đã lưu lúc kết ca), không tính lại công thức két ở đây.
export default function ShiftReportSlip({ report: r, storeName, printedAt, printedBy, debt = null, autoPrint = true }: ShiftReportSlipProps) {
  useAutoPrint(autoPrint)
  const groups = groupByCategory(r.entries)
  const debtCash = r.debtCash ?? 0
  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print { ${autoPrint ? '.no-print { display: none !important; }' : ''} html, body { background: #fff; } }
        .slip { width: 72mm; margin: 0 auto; color: #000;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.4; }
        .slip hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .row .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .row .num { flex-shrink: 0; text-align: right; }
        .note { font-size: 11px; overflow-wrap: anywhere; }
        .sign { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; text-align: center; font-size: 11px; }
        .sign div { flex: 1; padding-bottom: 36px; }
      `}</style>

      {autoPrint && (
        <div className="no-print" style={{ padding: 12, textAlign: 'center' }}>
          <button onClick={() => window.print()}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontWeight: 600 }}>
            In lại
          </button>
          <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Chọn máy in bill 80mm trong hộp thoại in.</p>
        </div>
      )}

      <div className="slip">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{storeName}</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>PHIẾU BÀN GIAO CA</div>
          {r.carriedDays > 1 && <div>Ca gộp qua {r.carriedDays} ngày</div>}
        </div>
        <hr />
        <Row name="In lúc" value={when(printedAt)} />
        <div className="note">Người in: {printedBy}</div>
        <hr />
        <Row name="Người mở" value={r.openedByName ?? '—'} />
        <Row name="Giờ mở" value={when(r.openedAt)} />
        <Row name="Người kết" value={r.closedByName ?? '—'} />
        <Row name="Giờ đóng" value={when(r.closedAt)} />
        <hr />
        <Row name="Tiền đầu ca" value={dong(r.openingCash)} />
        <Row name="Tiền mặt thu bill" value={`+ ${dong(r.cashSales ?? 0)}`} />
        {debtCash > 0 && <Row name="Khách trả nợ (TM)" value={`+ ${dong(debtCash)}`} />}
        <Row name="Phiếu thu TM" value={`+ ${dong(r.cashReceipts ?? 0)}`} />
        <Row name="Phiếu chi TM" value={`− ${dong(r.cashPayments ?? 0)}`} />
        <div className="row" style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>
          <span className="name">TIỀN DỰ KIẾN</span>
          <span className="num">{dong(r.expectedCash ?? 0)}đ</span>
        </div>
        <Row name="Tiền đếm được" value={dong(r.countedCash ?? 0)} strong />
        <Row name="Chênh lệch" value={differenceLabel(r.difference ?? 0)} strong />
        <hr />
        <Row name="Số bill" value={String(r.billsCount ?? 0)} />
        <Row name="Tổng TM" value={dong(r.cashSales ?? 0)} />
        <Row name="Tổng CK" value={dong(r.bankSales ?? 0)} />
        {debt && <Row name="Ghi nợ trong ca" value={dong(debt.debtRecorded)} />}
        {debt && debt.debtBank > 0 && <Row name="Khách trả nợ (CK)" value={dong(debt.debtBank)} />}
        <hr />
        {groups.length === 0 ? (
          <div className="note">Không có phiếu thu / chi tiền mặt.</div>
        ) : (
          groups.map((g) => (
            <Row
              key={`${g.kind}-${g.categoryName}`}
              name={`${g.kind === 'receipt' ? 'Thu' : 'Chi'} · ${g.categoryName} (${g.count})`}
              value={`${g.kind === 'receipt' ? '+' : '−'} ${dong(g.total)}`}
            />
          ))
        )}
        {(r.openNote || r.closeNote) && <hr />}
        {r.openNote && <div className="note">Ghi chú mở ca: {r.openNote}</div>}
        {r.closeNote && <div className="note">Ghi chú kết ca: {r.closeNote}</div>}
        <hr />
        {/* Option A (2026-07-08): hệ thống không thấy giao dịch ngân hàng → chỉ nhắc đối chiếu. */}
        <div className="note">Đối chiếu chuyển khoản với app ngân hàng. Tiền mặt đối chiếu với két.</div>
        <div className="sign">
          <div>Người giao</div>
          <div>Người nhận</div>
        </div>
      </div>
    </>
  )
}
