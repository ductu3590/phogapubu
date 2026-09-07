'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OpenTableSession } from '@/lib/actions/table-session'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã nhận',
  cooking: 'Đang làm',
  ready: 'Xong',
  paid: 'Hoàn tất',
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
}: {
  sessions: OpenTableSession[]
  busy: boolean
  onSelectSession: (sessionId: string) => void
  onConfirmOrder: (orderId: string) => void
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
          .filter((o) => o.order_source !== 'pos' && new Date(o.created_at).getTime() >= moc)
          .map((o) => ({ o, s })),
      )
      .sort((a, b) => b.o.created_at.localeCompare(a.o.created_at))
  }, [sessions, now])

  return (
    <div className="flex max-h-44 flex-col border-t border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Đơn mới</span>
        <span className="text-[11px] text-gray-400">{CUA_SO_PHUT} phút gần nhất</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        {rows.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">Chưa có đơn nào mới.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map(({ o, s }) => (
              <li key={o.id} className="flex items-center gap-2">
                <button
                  onClick={() => onSelectSession(s.session_id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                >
                  <span className="w-32 flex-shrink-0 truncate font-semibold text-gray-800">
                    {s.table_number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-600">
                    {o.items.map((it) => `${it.name} ×${it.quantity}`).join(', ') || 'Không có món'}
                  </span>
                  <span className="flex-shrink-0 text-gray-400">
                    {o.order_source === 'staff' ? '🧑‍🍳 nhân viên' : '👤 khách'}
                  </span>
                  <span className="w-20 flex-shrink-0 text-right text-gray-400">
                    {truoc(o.created_at, now)}
                  </span>
                  <span className="w-20 flex-shrink-0 text-right text-gray-500">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  <span className="w-24 flex-shrink-0 text-right font-semibold text-gray-800">
                    {dong(o.total_amount)}
                  </span>
                </button>
                {/* Xác nhận thẳng từ đây: giờ đông khách, bắt thu ngân bấm bàn rồi mới xác nhận
                    là thêm một nhịp thừa. Vẫn in đúng 2 liên như bấm trong panel. */}
                {o.status === 'pending' && o.order_source !== 'pos' && (
                  <button
                    onClick={() => onConfirmOrder(o.id)}
                    disabled={busy}
                    className="flex-shrink-0 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    ✅ Xác nhận &amp; in
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
