'use client'

import { revenueLabel, vnDateTimeLabel, type DaySummary } from '@/lib/bills-report'
import { useAutoPrint } from '@/lib/print/use-auto-print'

const dong = (n: number) => n.toLocaleString('vi-VN')
const vnDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

export type DayReportSlipProps = {
  storeName: string
  date: string
  rangeLabel?: string | null
  printedAt: string
  printedBy: string
  /** debt (mig 123): phần ghi nợ trong doanh thu; không có = 0. */
  totals: { revenue: number; cash: number; bank: number; debt?: number; other: number; billsCount: number }
  /** Mig 123: khách trả nợ trong ngày — dòng tiền vào, KHÔNG phải doanh thu. Không truyền = không có. */
  debtCollections?: { cash: number; bank: number; count: number }
  summary: DaySummary
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

// Phiếu báo cáo cuối ngày 80mm (A04-3) — phiếu NỘI BỘ để đối chiếu két / bàn giao, không quảng cáo MEVO.
// Số tiền lấy nguyên từ RPC get_bills_report (qua props), không tính lại. Theo NGÀY KINH DOANH (chưa có ca làm việc).
export default function DayReportSlip({ storeName, date, rangeLabel, printedAt, printedBy, totals, debtCollections, summary: s, autoPrint = true }: DayReportSlipProps) {
  const debt = totals.debt ?? 0
  const collected = debtCollections && debtCollections.count > 0 ? debtCollections : null
  useAutoPrint(autoPrint)
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
          <div style={{ fontWeight: 700, marginTop: 2 }}>BÁO CÁO CUỐI NGÀY</div>
          <div>Ngày {vnDate(date)}</div>
          {rangeLabel && <div>{rangeLabel}</div>}
        </div>
        <hr />
        <Row name="In lúc" value={vnDateTimeLabel(new Date(printedAt))} />
        <div style={{ fontSize: 11, overflowWrap: 'anywhere' }}>Người in: {printedBy}</div>
        <hr />
        <Row name="Tiền mặt" value={dong(totals.cash)} />
        <Row name="Chuyển khoản" value={dong(totals.bank)} />
        {debt > 0 && <Row name="Ghi nợ hôm nay" value={dong(debt)} />}
        {totals.other > 0 && <Row name="Ví / khác" value={dong(totals.other)} />}
        <div className="row" style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
          {/* Có nợ thì tổng là DOANH THU (gồm phần ghi nợ), không còn là tiền thực nhận. */}
          <span className="name">{revenueLabel({ debt }).toUpperCase()}</span>
          <span className="num">{dong(totals.revenue)}đ</span>
        </div>
        <Row name="Số hoá đơn đã thu" value={String(totals.billsCount)} />
        {collected && (
          <>
            <hr />
            {/* Khách trả nợ trong ngày: dòng tiền vào, KHÔNG cộng vào doanh thu ở trên. */}
            <Row name="Thu nợ tiền mặt" value={dong(collected.cash)} />
            <Row name="Thu nợ chuyển khoản" value={dong(collected.bank)} />
          </>
        )}
        <hr />
        {s.waitingCount > 0 && <Row name={`Còn chưa thu (${s.waitingCount})`} value={dong(s.waitingTotal)} strong />}
        {s.discountTotal > 0 && <Row name="Giảm giá" value={dong(s.discountTotal)} />}
        {s.cancelledCount > 0 && <Row name={`Đơn huỷ / từ chối (${s.cancelledCount})`} value={dong(s.cancelledTotal)} />}
        {s.giftCount > 0 && <Row name={`Tặng (${s.giftCount} lần)`} value={dong(s.giftTotal)} />}
        {s.voidCount > 0 && <Row name={`Bỏ (${s.voidCount} lần)`} value={dong(s.voidTotal)} />}
        {s.quantityChangeCount > 0 && <Row name="Sửa số lượng" value={`${s.quantityChangeCount} lần`} />}
        {s.waitingCount + s.cancelledCount + s.discountTotal + s.giftCount + s.voidCount + s.quantityChangeCount === 0 && (
          <div style={{ fontSize: 11 }}>Không có khoản chưa thu, huỷ hay điều chỉnh.</div>
        )}
        <hr />
        {/* Option A (2026-07-08): hệ thống không thấy giao dịch ngân hàng → chỉ nhắc đối chiếu, không ghi "đã khớp". */}
        <div style={{ fontSize: 11 }}>
          Đối chiếu chuyển khoản với app ngân hàng. Tiền mặt đối chiếu với két.
          {collected && collected.cash > 0 ? ' Tiền mặt thu nợ cũng nằm trong két.' : ''}
        </div>
        <div className="sign">
          <div>Người bàn giao</div>
          <div>Người nhận</div>
        </div>
      </div>
    </>
  )
}
