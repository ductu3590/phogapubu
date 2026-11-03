'use client'

import { useEffect } from 'react'
import type { SessionsBill } from '@/lib/actions/table-session'
import { useAutoPrint } from '@/lib/print/use-auto-print'

const dong = (n: number) => n.toLocaleString('vi-VN')

// Thời gian khách ngồi, vd "1g 20p" — chỉ để thu ngân/khách đối chiếu, không dùng tính tiền.
const thoiGianNgoi = (tuIso: string, denIso: string) => {
  const ph = Math.round((new Date(denIso).getTime() - new Date(tuIso).getTime()) / 60000)
  if (!Number.isFinite(ph) || ph < 1) return null
  return ph >= 60 ? `${Math.floor(ph / 60)}g ${ph % 60}p` : `${ph}p`
}

const gio = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Lỗi in khi giảm giá lớn hơn tiền hàng (của một mâm hoặc cả bill) — tổng in ra sẽ thấp hơn thật hoặc âm. */
export const LOI_GIAM_GIA_IN = 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá ở POS'

export function billDiscountError(bill: SessionsBill): string | null {
  const tongTienHang = bill.sessions.reduce((n, ss) => n + ss.subtotal, 0)
  const giam = bill.grand_discount ?? bill.sessions.reduce((n, ss) => n + (ss.discount ?? 0), 0)
  const sai =
    bill.sessions.some((ss) => (ss.discount ?? 0) > ss.subtotal) || giam > tongTienHang || bill.grand_total < 0
  return sai ? LOI_GIAM_GIA_IN : null
}

/** "10%" chỉ khi MỌI mâm trong bill đều giảm cùng một mức %; trộn (mâm % với mâm VNĐ / không giảm) → rỗng. */
export function billDiscountLabel(bill: SessionsBill): string {
  if (bill.sessions.length === 0) return ''
  const nhan = bill.sessions.map((ss) => ((ss.discount ?? 0) > 0 ? ss.discount_label ?? '' : ''))
  return nhan[0] !== '' && nhan.every((n) => n === nhan[0]) ? nhan[0] : ''
}

export default function PrintBill({ bill, testMode = false }: { bill: SessionsBill; testMode?: boolean }) {
  // Chặn ở MỌI đường in (POS, /staff/tables, Báo cáo): giảm giá sai thì báo lỗi, không in phiếu, không tự in.
  const loiGiam = billDiscountError(bill)
  useAutoPrint(!loiGiam)
  useEffect(() => {
    // Trang in thường nạp trong iframe ẩn (printInPlace) → người bấm không thấy trang lỗi; báo bằng hộp thoại.
    if (loiGiam && window.parent !== window) window.alert(loiGiam)
  }, [loiGiam])

  if (loiGiam) {
    return (
      <div role="alert" style={{ padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#b91c1c' }}>Không in được hoá đơn</p>
        <p style={{ marginTop: 6, fontSize: 14 }}>{loiGiam}</p>
      </div>
    )
  }

  const nhieuMam = bill.sessions.length > 1
  // Dòng Bỏ/Tặng (0đ) không tính vào số món khách phải trả.
  const soMon = bill.sessions.reduce((n, ss) => n + ss.items.filter((it) => !it.void_type && !it.is_gift).reduce((m, it) => m + it.quantity, 0), 0)

  // Giảm giá bill (mig 108). Server cũ không trả trường → coi như 0 và in như trước.
  const giamGia = bill.grand_discount ?? bill.sessions.reduce((n, ss) => n + (ss.discount ?? 0), 0)
  // grand_total đã là tiền SAU giảm → tiền hàng = grand_total + giảm giá (đúng phép tính ở get_sessions_bill).
  const tienHang = bill.grand_total + giamGia
  // Nhãn "(10%)" chỉ khi MỌI mâm giảm cùng một mức %; còn lại in "Giảm giá" trơn.
  const nhan = billDiscountLabel(bill)

  return (
    <>
      {/* Khổ 80mm: vùng in rộng ~72mm. Đặt @page để không dính lề mặc định của trình duyệt. */}
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff; }
        }
        .bill { width: 72mm; margin: 0 auto; color: #000;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 12px; line-height: 1.35; }
        .bill hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .row .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .row .num { flex-shrink: 0; text-align: right; }
        .diachi { overflow-wrap: anywhere; }
        .mevo { text-align: center; font-size: 11px; line-height: 1.3; }
      `}</style>

      <div className="no-print" style={{ padding: 12, textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: '#f97316',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          {testMode ? 'In thử lại' : 'In lại'}
        </button>
        <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          Chọn máy in bill 80mm trong hộp thoại in.
        </p>
      </div>

      <div className="bill">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{bill.store.name}</div>
          {bill.store.address?.trim() && <div className="diachi">{bill.store.address.trim()}</div>}
          {bill.store.phone?.trim() && <div>ĐT: {bill.store.phone.trim()}</div>}
        </div>

        <hr />
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          {testMode ? 'PHIẾU IN THỬ' : nhieuMam ? 'HOÁ ĐƠN TỔNG' : 'HOÁ ĐƠN'}
        </div>
        <div className="row">
          <span className="name">In lúc</span>
          <span className="num">{gio(bill.printed_at)}</span>
        </div>

        {bill.sessions.map((s) => (
          <div key={s.session_id}>
            <hr />
            <div style={{ fontWeight: 700 }}>
              {s.tables}
              {s.is_open_ordering && nhieuMam ? ' (mâm)' : ''}
            </div>
            <div style={{ fontSize: 11 }}>
              Mở lúc {gio(s.opened_at)}
              {thoiGianNgoi(s.opened_at, bill.printed_at) && <> · Ngồi {thoiGianNgoi(s.opened_at, bill.printed_at)}</>}
            </div>
            <div style={{ marginTop: 4 }}>
              {s.items.map((it, i) => (
                <div key={i}>
                  <div className="row">
                    <span className="name">{it.name}</span>
                    <span className="num">{dong(it.line_total)}</span>
                  </div>
                  <div style={{ fontSize: 11, paddingLeft: 8 }}>
                    {it.void_type ? (
                      // Dòng 0đ: ghi rõ Tặng hay Bỏ + lý do (mig 098) — khách hiểu vì sao không tính tiền.
                      <>{it.quantity} × {it.void_type === 'gift' ? 'TẶNG' : 'BỎ'}{it.void_reason?.trim() ? ` — ${it.void_reason.trim()}` : ''}</>
                    ) : (
                      <>{it.quantity} × {dong(it.price)}{it.is_gift && ' · Tặng'}</>
                    )}
                  </div>
                </div>
              ))}
              {s.items.length === 0 && <div style={{ fontSize: 11 }}>(chưa gọi món)</div>}
            </div>
            {(s.qty_changes?.length ?? 0) > 0 && (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>Điều chỉnh số lượng:</div>
                {s.qty_changes!.map((c, i) => (
                  <div key={i} style={{ paddingLeft: 8 }}>
                    {c.name}: {c.old_quantity} → {c.new_quantity} — {c.reason}
                  </div>
                ))}
              </div>
            )}
            {nhieuMam && (
              <div className="row" style={{ marginTop: 3 }}>
                <span className="name">Cộng {s.tables}</span>
                <span className="num">{dong(s.subtotal)}</span>
              </div>
            )}
          </div>
        ))}

        <hr />
        <div className="row" style={{ fontSize: 11 }}>
          <span className="name">Tổng số món</span>
          <span className="num">{soMon}</span>
        </div>
        {giamGia > 0 && (
          <>
            <div className="row" style={{ marginTop: 2 }}>
              <span className="name">Tổng tiền hàng</span>
              <span className="num">{dong(tienHang)}</span>
            </div>
            <div className="row">
              <span className="name">Giảm giá{nhan ? ` (${nhan})` : ''}</span>
              <span className="num">-{dong(giamGia)}</span>
            </div>
          </>
        )}
        <div className="row" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
          <span className="name">{giamGia > 0 ? 'Khách cần trả' : 'TỔNG CỘNG'}</span>
          <span className="num">{dong(bill.grand_total)}đ</span>
        </div>

        <hr />
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          {testMode ? <>Không phải hoá đơn — không tạo đơn</> : <>Cảm ơn quý khách — hẹn gặp lại!</>}
        </div>

        <hr />
        {/* Quảng bá MEVO: dòng giới thiệu + website (không in logo — anh Tú bỏ 2026-10-12). */}
        <div className="mevo">
          <div style={{ fontWeight: 700 }}>MEVO · Menu Evolution</div>
          <div>Quét QR gọi món, thanh toán nhanh ngay trên Zalo — giải pháp cho quán ăn Việt.</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>mevo.vn</div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
