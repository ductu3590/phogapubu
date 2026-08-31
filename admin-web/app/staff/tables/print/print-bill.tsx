'use client'

import { useEffect } from 'react'
import type { SessionsBill } from '@/lib/actions/table-session'

const dong = (n: number) => n.toLocaleString('vi-VN')

const gio = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function PrintBill({ bill }: { bill: SessionsBill }) {
  // Mở tab là in luôn — thu ngân không phải bấm thêm bước nào. Chờ một nhịp cho font/layout
  // ổn định rồi mới gọi print, nếu không Chrome đôi khi in ra trang trắng.
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [])

  const nhieuMam = bill.sessions.length > 1

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
          In lại
        </button>
        <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          Chọn máy in bill 80mm trong hộp thoại in. Đóng tab này sau khi in xong.
        </p>
      </div>

      <div className="bill">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{bill.store.name}</div>
          {bill.store.address && <div>{bill.store.address}</div>}
          {bill.store.phone && <div>ĐT: {bill.store.phone}</div>}
        </div>

        <hr />
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          {nhieuMam ? 'HOÁ ĐƠN TỔNG' : 'HOÁ ĐƠN'}
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
            <div style={{ fontSize: 11 }}>Mở lúc {gio(s.opened_at)}</div>
            <div style={{ marginTop: 4 }}>
              {s.items.map((it, i) => (
                <div key={i}>
                  <div className="row">
                    <span className="name">{it.name}</span>
                    <span className="num">{dong(it.line_total)}</span>
                  </div>
                  <div style={{ fontSize: 11, paddingLeft: 8 }}>
                    {it.quantity} × {dong(it.price)}
                  </div>
                </div>
              ))}
              {s.items.length === 0 && <div style={{ fontSize: 11 }}>(chưa gọi món)</div>}
            </div>
            {nhieuMam && (
              <div className="row" style={{ marginTop: 3 }}>
                <span className="name">Cộng {s.tables}</span>
                <span className="num">{dong(s.subtotal)}</span>
              </div>
            )}
          </div>
        ))}

        <hr />
        <div className="row" style={{ fontSize: 15, fontWeight: 700 }}>
          <span className="name">TỔNG CỘNG</span>
          <span className="num">{dong(bill.grand_total)}đ</span>
        </div>

        <hr />
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          Cảm ơn quý khách — hẹn gặp lại!
          <br />
          Đặt món bằng QR trên bàn · MEVO
        </div>
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
