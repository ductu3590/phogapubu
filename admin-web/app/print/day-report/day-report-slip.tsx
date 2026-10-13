'use client'

import { vnDateTimeLabel, type DaySummary } from '@/lib/bills-report'
import { useAutoPrint } from '@/lib/print/use-auto-print'

const dong = (n: number) => n.toLocaleString('vi-VN')
const vnDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

export type DayReportSlipProps = {
  storeName: string
  date: string
  printedAt: string
  printedBy: string
  totals: { revenue: number; cash: number; bank: number; other: number; billsCount: number }
  summary: DaySummary
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
// Số tiền lấy nguyên từ RPC get_bills_report (qua props), không tính lại. Theo NGÀY (chưa có ca làm việc).
export default function DayReportSlip({ storeName, date, printedAt, printedBy, totals, summary: s }: DayReportSlipProps) {
  useAutoPrint()
  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print { .no-print { display: none !important; } html, body { background: #fff; } }
        .slip { width: 72mm; margin: 0 auto; color: #000;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.4; }
        .slip hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .row .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .row .num { flex-shrink: 0; text-align: right; }
        .sign { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; text-align: center; font-size: 11px; }
        .sign div { flex: 1; padding-bottom: 36px; }
      `}</style>

      <div className="no-print" style={{ padding: 12, textAlign: 'center' }}>
        <button onClick={() => window.print()}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontWeight: 600 }}>
          In lại
        </button>
        <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Chọn máy in bill 80mm trong hộp thoại in.</p>
      </div>

      <div className="slip">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{storeName}</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>BÁO CÁO CUỐI NGÀY</div>
          <div>Ngày {vnDate(date)}</div>
        </div>
        <hr />
        <Row name="In lúc" value={vnDateTimeLabel(new Date(printedAt))} />
        <div style={{ fontSize: 11, overflowWrap: 'anywhere' }}>Người in: {printedBy}</div>
        <hr />
        <Row name="Tiền mặt" value={dong(totals.cash)} />
        <Row name="Chuyển khoản" value={dong(totals.bank)} />
        {totals.other > 0 && <Row name="Ví / khác" value={dong(totals.other)} />}
        <div className="row" style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
          <span className="name">TỔNG THỰC THU</span>
          <span className="num">{dong(totals.revenue)}đ</span>
        </div>
        <Row name="Số hoá đơn đã thu" value={String(totals.billsCount)} />
        <hr />
        {s.waitingCount > 0 && <Row name={`Còn chưa thu (${s.waitingCount})`} value={dong(s.waitingTotal)} strong />}
        {s.cancelledCount > 0 && <Row name={`Đơn huỷ / từ chối (${s.cancelledCount})`} value={dong(s.cancelledTotal)} />}
        {s.giftCount > 0 && <Row name={`Tặng (${s.giftCount} lần)`} value={dong(s.giftTotal)} />}
        {s.voidCount > 0 && <Row name={`Bỏ (${s.voidCount} lần)`} value={dong(s.voidTotal)} />}
        {s.quantityChangeCount > 0 && <Row name="Sửa số lượng" value={`${s.quantityChangeCount} lần`} />}
        {s.waitingCount + s.cancelledCount + s.giftCount + s.voidCount + s.quantityChangeCount === 0 && (
          <div style={{ fontSize: 11 }}>Không có khoản chưa thu, huỷ hay điều chỉnh.</div>
        )}
        <hr />
        {/* Option A (2026-07-08): hệ thống không thấy giao dịch ngân hàng → chỉ nhắc đối chiếu, không ghi "đã khớp". */}
        <div style={{ fontSize: 11 }}>Đối chiếu chuyển khoản với app ngân hàng. Tiền mặt đối chiếu với két.</div>
        <div className="sign">
          <div>Người bàn giao</div>
          <div>Người nhận</div>
        </div>
      </div>
    </>
  )
}
