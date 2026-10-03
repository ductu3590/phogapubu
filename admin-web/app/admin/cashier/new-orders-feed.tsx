'use client'

import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { Button } from '@/components/ui/button'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã nhận',
  cooking: 'Đang làm',
  ready: 'Xong',
  paid: 'Hoàn tất',
  cancelled: 'Đã từ chối',
}

const truoc = (iso: string, now: number) => {
  const phut = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (phut < 1) return 'vừa xong'
  return `${phut}' trước`
}

/**
 * Đơn "mới" = tạo trong 15 phút gần nhất. Không lưu trạng thái đã-xem: thêm cột chỉ để tô đậm
 * một dòng là không đáng.
 */
const CUA_SO_PHUT = 15

export default function NewOrdersFeed({
  sessions,
  busy,
  onSelectSession,
  onConfirmOrder,
  onRejectOrder,
}: {
  sessions: OpenTableSession[]
  busy: boolean
  onSelectSession: (sessionId: string) => void
  onConfirmOrder: (orderId: string) => void
  onRejectOrder: (orderId: string) => void
}) {
  // Đồng hồ riêng, nhích 30 giây một lần: vừa tránh gọi Date.now() giữa lúc render (hàm không
  // thuần), vừa để "3' trước" tự già đi mà không cần đơn mới về.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    const moc = now - CUA_SO_PHUT * 60_000
    return sessions
      .flatMap((s) =>
        s.orders
          .filter((o) => o.order_source !== 'pos' && o.order_source !== 'reservation_preorder' && new Date(o.created_at).getTime() >= moc)
          .map((o) => ({ o, s })),
      )
      .sort((a, b) => b.o.created_at.localeCompare(a.o.created_at))
  }, [sessions, now])

  return (
    <section aria-label="Đơn mới" className="flex max-h-56 flex-col border-t border-border bg-surface">
      <div className="flex items-baseline gap-2 px-4 pt-3 pb-2 md:px-5">
        <h2 className="text-sm font-semibold text-foreground">Đơn mới</h2>
        <span className="text-[13px] text-muted">{CUA_SO_PHUT} phút gần nhất</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 md:px-3">
        {rows.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted">Chưa có đơn nào mới.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ o, s }) => (
              <li key={o.id} className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => onSelectSession(s.session_id)}
                  className="grid min-w-0 flex-1 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-item-hover md:grid-cols-[8rem_minmax(0,1fr)_auto_auto_auto]"
                >
                  <span className="truncate text-sm font-semibold text-foreground">{s.table_number}</span>
                  <span className="text-right text-sm font-semibold text-foreground tabular md:order-last">{dong(o.total_amount)}</span>
                  <span className="col-span-2 min-w-0 truncate text-[13px] text-muted md:col-span-1 md:text-sm">
                    {o.items.map((it) => `${it.name} ×${it.quantity}`).join(', ') || 'Không có món'}
                  </span>
                  <span className="hidden text-[13px] text-muted md:inline">
                    {o.order_source === 'staff' ? 'Nhân viên' : 'Khách'} · {truoc(o.created_at, now)}
                  </span>
                  <span className="hidden text-[13px] text-muted md:inline">{STATUS_LABEL[o.status] ?? o.status}</span>
                </button>
                {/* Xác nhận thẳng từ đây: giờ đông khách, bắt thu ngân bấm bàn rồi mới xác nhận
                    là thêm một nhịp thừa. Vẫn in đúng 2 liên như bấm trong panel. */}
                {o.status === 'pending' && o.order_source !== 'pos' && o.order_source !== 'reservation_preorder' && (
                  <div className="flex shrink-0 gap-2 px-2 sm:px-0">
                    <Button variant="danger" onClick={() => onRejectOrder(o.id)} disabled={busy} className="flex-1 sm:flex-none">
                      Từ chối
                    </Button>
                    <Button variant="primary" icon={<Printer />} onClick={() => onConfirmOrder(o.id)} disabled={busy} className="flex-1 sm:flex-none">
                      Xác nhận &amp; in
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
