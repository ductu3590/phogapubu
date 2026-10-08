'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { areaColorClasses } from '@/lib/area-colors'
import { cn } from '@/lib/utils'

export type QrCard = { id: string; tableNumber: string; areaName: string | null; areaColor: string | null; qr: string }

// Tờ in QR A4 dọc, lưới 3×4 = 12 mã/trang (PA-3). In bằng hộp in của trình duyệt — chọn
// "Lưu dưới dạng PDF" để lấy file. Trang nằm NGOÀI khung admin (/print/table-qr): khung admin có vùng
// cuộn overflow nên Chrome không chia sang trang 2 — quán > 12 bàn chỉ in được trang đầu (vá review PA-3).
export default function QrSheet({ storeName, title, cards }: { storeName: string; title: string; cards: QrCard[] }) {
  return (
    <div className="qr-root min-h-dvh bg-white">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: #fff; overflow: visible !important; height: auto !important; }
          .no-print { display: none !important; }
          .qr-grid { gap: 0 !important; }
          .qr-card { break-inside: avoid; }
        }
      `}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <p className="text-lg font-bold text-slate-900">In QR bàn — {title}</p>
          <p className="text-sm text-slate-500">{cards.length} mã · A4, 12 mã/trang. Muốn lấy file: chọn &quot;Lưu dưới dạng PDF&quot; trong hộp in.</p>
        </div>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>In</Button>
      </div>
      <div className="qr-grid mx-auto grid max-w-[190mm] grid-cols-3 gap-2 p-4 print:p-0">
        {cards.map((c) => {
          const color = c.areaColor ? areaColorClasses(c.areaColor) : null
          return (
            <div key={c.id} className="qr-card flex h-[68mm] flex-col items-center justify-center border border-dashed border-slate-400 p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.qr} alt={`QR ${c.tableNumber}`} className="size-[40mm]" />
              <p className="mt-1 text-xl font-bold text-black">{c.tableNumber}</p>
              {c.areaName && (
                <p className={cn('flex items-center gap-1 text-xs font-semibold', color?.text)}>
                  <span className={cn('inline-block size-2 rounded-full', color?.dot)} aria-hidden />{c.areaName}
                </p>
              )}
              <p className="text-[10px] text-slate-500">{storeName} · Quét bằng Zalo để gọi món</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
