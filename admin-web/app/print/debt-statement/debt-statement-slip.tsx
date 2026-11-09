'use client'

import { vnDateTimeLabel } from '@/lib/bills-report'
import { debtKindLabel, type DebtCustomerDetail } from '@/lib/debts'
import { useAutoPrint } from '@/lib/print/use-auto-print'

const dong = (n: number) => n.toLocaleString('vi-VN')
// Ngày kinh doanh 'YYYY-MM-DD' → 'dd/mm' (đúng ngày của bill trên A04).
const dayMonth = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '—')

export type DebtStatementSlipProps = {
  storeName: string
  detail: DebtCustomerDetail
  printedAt: string
  printedBy: string
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

// Bảng kê công nợ 80mm (mig 123) — đưa khách / kế toán đối chiếu. Chỉ in bill CÒN NỢ (cũ nhất trước); số liệu lấy
// nguyên từ debt_customer_detail (server đã bỏ lần trả đã huỷ), không tính lại. In bằng trình duyệt (printDocument
// kind 'debt_statement', không có ở phần mềm in).
export default function DebtStatementSlip({ storeName, detail, printedAt, printedBy, autoPrint = true }: DebtStatementSlipProps) {
  useAutoPrint(autoPrint)
  const c = detail.customer
  const open = detail.bills.filter((b) => b.outstanding > 0)
  const printedLabel = vnDateTimeLabel(new Date(printedAt))
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
        .bill { margin-bottom: 4px; }
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
          <div style={{ fontWeight: 700, marginTop: 2 }}>BẢNG KÊ CÔNG NỢ</div>
        </div>
        <hr />
        <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{c.name}</div>
        <div className="note">{debtKindLabel(c.kind)}{c.phone ? ` · ${c.phone}` : ''}</div>
        <Row name="In lúc" value={printedLabel} />
        <div className="note">Người in: {printedBy}</div>
        <hr />
        {open.length === 0 ? (
          <div style={{ textAlign: 'center', fontWeight: 700 }}>Không còn khoản nợ</div>
        ) : (
          <>
            {open.map((b) => (
              <div key={b.billPaymentId} className="bill">
                <div style={{ fontWeight: 700 }}>{dayMonth(b.businessDate)} · {b.tableLabel}</div>
                <Row name="Tổng bill" value={dong(b.billTotal)} />
                <Row name="Đã trả" value={dong(b.paidAmount)} />
                <Row name="Còn nợ" value={dong(b.outstanding)} strong />
              </div>
            ))}
            <hr />
            <div className="row" style={{ fontSize: 15, fontWeight: 700 }}>
              <span className="name">TỔNG CÒN NỢ</span>
              <span className="num">{dong(c.outstanding)}đ</span>
            </div>
            <Row name="Số bill còn nợ" value={String(open.length)} />
          </>
        )}
        <hr />
        <div className="note">Số liệu tới {printedLabel}. Đối chiếu và báo lại quán nếu có sai lệch.</div>
        <div className="sign">
          <div>Bên quán</div>
          <div>Khách hàng</div>
        </div>
      </div>
    </>
  )
}
