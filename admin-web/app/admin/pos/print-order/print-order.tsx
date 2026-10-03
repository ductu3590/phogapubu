'use client'

import { useEffect } from 'react'

export type SlipItem = {
  name: string
  quantity: number
  price: number
  note: string | null
  toppings: { name: string; price: number }[]
  isGift: boolean
}

export type OrderSlip = {
  storeName: string
  storePhone: string | null
  tableLabel: string
  createdAt: string
  orderNote: string | null
  orderTotal: number
  sessionTotal: number
  orderSource: string
  items: SlipItem[]
  preorderPrintKind?: 'original' | 'adjustment' | 'reprint'
  preorderRevision?: number
}

const dong = (n: number) => n.toLocaleString('vi-VN')

const gio = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const donGia = (it: SlipItem) => it.isGift ? 0 : it.price + it.toppings.reduce((s, t) => s + t.price, 0)

export default function PrintOrder({ slip }: { slip: OrderSlip }) {
  // Mở tab là in luôn, y như trang bill (staff/tables/print). Chờ một nhịp cho font/layout ổn
  // định, nếu không Chrome thỉnh thoảng in ra trang trắng.
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff; }
          .lien + .lien { page-break-before: always; }
        }
        .lien { width: 72mm; margin: 0 auto 10mm; color: #000;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 12px; line-height: 1.35; }
        .lien hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .row .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .row .num { flex-shrink: 0; text-align: right; }
        .tieude { text-align: center; font-weight: 700; font-size: 15px; }
        .ban { text-align: center; font-weight: 700; font-size: 20px; margin: 4px 0; }
        .to { font-size: 15px; font-weight: 700; }
        .ghichu { font-style: italic; }
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
            cursor: 'pointer',
          }}
        >
          🖨️ In lại 2 liên
        </button>
      </div>

      {/* ── LIÊN 1: PHIẾU BẾP — không giá, chữ to, chỉ thứ bếp cần ── */}
      <div className="lien">
        <p className="tieude">{slip.preorderPrintKind === 'adjustment' ? 'PHIẾU ĐIỀU CHỈNH' : slip.preorderPrintKind === 'reprint' ? 'PHIẾU BẾP · IN LẠI' : 'PHIẾU BẾP'}</p>
        <p className="ban">{slip.tableLabel}</p>
        <div className="row">
          <span>{gio(slip.createdAt)}</span>
          <span>{slip.preorderRevision ? `Đặt trước · v${slip.preorderRevision}` : slip.orderSource === 'staff' ? 'NV đặt hộ' : 'Khách tự gọi'}</span>
        </div>
        <hr />
        {slip.items.map((it, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div className="row to">
              <span className="name">{it.name}</span>
              <span className="num">x{it.quantity} · {dong(donGia(it) * it.quantity)}</span>
            </div>
            {it.toppings.length > 0 && (
              <div style={{ paddingLeft: 8 }}>+ {it.toppings.map((t) => t.name).join(', ')}</div>
            )}
            {it.note && <div className="ghichu" style={{ paddingLeft: 8 }}>* {it.note}</div>}
          </div>
        ))}
        {slip.orderNote && (
          <>
            <hr />
            <p className="ghichu">Ghi chú đơn: {slip.orderNote}</p>
          </>
        )}
        <hr />
        <div className="row to">
          <span>Tổng phiếu</span>
          <span className="num">{dong(slip.orderTotal)}</span>
        </div>
        <hr />
        <p style={{ textAlign: 'center' }}>— hết phiếu bếp —</p>
      </div>

      {/* ── LIÊN 2: PHIẾU BÀN — đặt ở bàn khách, có ô tick để nhân viên gạch khi bưng ra ── */}
      <div className="lien">
        <p className="tieude">{slip.storeName}{slip.preorderPrintKind === 'reprint' ? ' · IN LẠI' : ''}</p>
        {slip.storePhone && <p style={{ textAlign: 'center' }}>ĐT: {slip.storePhone}</p>}
        <p className="ban">{slip.tableLabel}</p>
        <div className="row">
          <span>{gio(slip.createdAt)}</span>
          <span>PHIẾU MÓN (chưa thanh toán)</span>
        </div>
        <hr />
        {slip.items.map((it, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div className="row">
              <span className="name">
                ☐ {it.name} x{it.quantity}
                {it.isGift && ' (Tặng)'}
              </span>
              <span className="num">{dong(donGia(it) * it.quantity)}</span>
            </div>
            {it.toppings.length > 0 && (
              <div style={{ paddingLeft: 12 }}>+ {it.toppings.map((t) => t.name).join(', ')}</div>
            )}
            {it.note && <div className="ghichu" style={{ paddingLeft: 12 }}>* {it.note}</div>}
          </div>
        ))}
        <hr />
        <div className="row to">
          <span>Lần gọi này</span>
          <span className="num">{dong(slip.orderTotal)}</span>
        </div>
        <div className="row">
          <span>Tạm tính cả bàn</span>
          <span className="num">{dong(slip.sessionTotal)}</span>
        </div>
        <hr />
        <p style={{ textAlign: 'center' }}>Nhân viên gạch ô ☐ khi đã bưng món ra.</p>
        <p style={{ textAlign: 'center' }}>Phiếu này KHÔNG phải hoá đơn thanh toán.</p>
      </div>
    </>
  )
}
