'use client'

import { useState } from 'react'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { sessionTimeoutMessage } from '@/lib/session-timeout'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const gio = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

export default function BillPanel({
  selected,
  picked,
  freeTables,
  otherSessions,
  pickedFreeTables,
  busy,
  onPay,
  onPrint,
  onReset,
  onCreateTray,
  onAddTable,
  onMergeInto,
  onReleaseHost,
  onConfirmOrder,
  onPrintOrder,
  onOpenManualOrder,
  onVoidOrderItem,
  onRestoreOrderItem,
  onClearPick,
}: {
  /** Phiên đang mở bill (bấm 1 bàn có khách) */
  selected: OpenTableSession | null
  /** Các phiên đã tick để gộp bill */
  picked: OpenTableSession[]
  /** Bàn TRỐNG — để thêm vào mâm đang chọn */
  freeTables: { id: string; table_number: string }[]
  /** Các phiên đang mở KHÁC phiên đang chọn — để nhập phiên lẻ vào mâm */
  otherSessions: OpenTableSession[]
  /** Số bàn trống đang tick — để ghép mâm */
  pickedFreeTables: number
  busy: boolean
  onPay: (list: OpenTableSession[], instrument: 'cash' | 'bank') => void
  onPrint: (list: OpenTableSession[]) => void
  onReset: (s: OpenTableSession) => void
  onCreateTray: () => void
  onAddTable: (sessionId: string, tableId: string) => void
  onMergeInto: (sessionId: string, targetSessionId: string) => void
  onReleaseHost: (sessionId: string) => void
  onConfirmOrder: (orderId: string) => void
  onPrintOrder: (orderId: string) => void
  onOpenManualOrder: (sessionId: string) => void
  onVoidOrderItem: (orderItemId: string, type: 'cancelled' | 'gift', reason?: string) => void
  onRestoreOrderItem: (orderItemId: string) => void
  onClearPick: () => void
}) {
  // Đơn đang mở bảng món để soát trước khi xác nhận. null = chưa mở đơn nào.
  const [xemDon, setXemDon] = useState<string | null>(null)

  const list = picked.length > 0 ? picked : selected ? [selected] : []
  const tong = list.reduce((n, s) => n + s.total, 0)
  const chuaXong = list.reduce((n, s) => n + s.cooking_count, 0)
  // Đơn `pos` chỉ là ghi bổ sung đã phục vụ: không qua xác nhận, không in phiếu bếp.
  const donCho = list.flatMap((s) => s.orders.filter((o) => o.status === 'pending' && o.order_source !== 'pos' && o.order_source !== 'reservation_preorder'))

  const dieuChinh = (itemId: string, type: 'cancelled' | 'gift') => {
    const label = type === 'cancelled' ? 'bỏ món này' : 'tặng món này'
    if (!confirm(`Xác nhận ${label}? Tổng bill sẽ được tính lại.`)) return
    const reason = prompt(`Lý do ${label} (có thể để trống):`) ?? undefined
    onVoidOrderItem(itemId, type, reason)
  }

  if (pickedFreeTables >= 2) {
    return (
      <Khung tieuDe={`Đã chọn ${pickedFreeTables} bàn trống`}>
        <button
          onClick={onCreateTray}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          🍲 Ghép thành một mâm
        </button>
        <button onClick={onClearPick} className="mt-2 w-full py-2 text-xs text-gray-500 underline">
          Bỏ chọn
        </button>
      </Khung>
    )
  }

  if (list.length === 0) {
    return (
      <Khung tieuDe="Chưa chọn bàn">
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Bấm một bàn có khách để mở bill và thu tiền.
          <br />
          Bấm nhiều bàn <b>trống</b> để ghép mâm.
          <br />
          Ctrl/Cmd + bấm nhiều mâm để gộp bill.
          <br />
          <br />
          {freeTables.length} bàn đang trống.
        </p>
      </Khung>
    )
  }

  return (
    <Khung
      tieuDe={
        list.length > 1
          ? `Gộp bill ${list.length} mâm`
          : `${list[0].is_open_ordering ? '🍲' : '🪑'} ${list[0].table_number}`
      }
    >
      {list.length === 1 && (
        <p className="text-xs text-gray-400">
          mở lúc {gio(list[0].opened_at)} · {list[0].order_count} đơn
          {list[0].opened_by === 'staff' && ' · nhân viên mở'}
        </p>
      )}

      {list.length === 1 && list[0].needs_review && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          ⏰ {sessionTimeoutMessage(list[0].idle_timeout_minutes)} nên bàn đã mở khoá, nhưng còn
          <b> {dong(list[0].unpaid_total)} chưa thu</b>.
        </p>
      )}

      {donCho.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-2">
          <p className="text-xs font-bold text-amber-900">
            🔔 {donCho.length} đơn chờ xác nhận
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {donCho.map((o) => (
              <li key={o.id} className="rounded-lg bg-white p-2">
                <button
                  onClick={() => setXemDon(xemDon === o.id ? null : o.id)}
                  className="flex w-full items-center justify-between gap-2 text-left text-xs"
                >
                  <span className="font-semibold text-gray-800">
                    {gio(o.created_at)} · {o.items.length} món ·{' '}
                    {o.order_source === 'staff' ? 'nhân viên' : 'khách'}
                  </span>
                  <span className="flex-shrink-0 text-gray-500">
                    {dong(o.total_amount)} {xemDon === o.id ? '▲' : '▼'}
                  </span>
                </button>

                {xemDon === o.id && (
                  <>
                    <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
                      {o.items.map((it, i) => (
                        <li key={i} className="flex justify-between text-xs text-gray-700">
                          <span>{it.name}</span>
                          <span className="font-semibold">×{it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => onConfirmOrder(o.id)}
                      disabled={busy}
                      className="mt-2 w-full rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      ✅ Xác nhận &amp; in 2 liên
                    </button>
                    <p className="mt-1 text-[11px] text-gray-400">
                      In ra: 1 phiếu cho bếp, 1 phiếu đặt ở bàn khách.
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {list.length === 1 && (
        <button
          onClick={() => onOpenManualOrder(list[0].session_id)}
          disabled={busy}
          className="mt-3 w-full rounded-xl border border-dashed border-gray-400 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ＋ Thêm món tay <span className="font-normal text-gray-400">· không báo bếp</span>
        </button>
      )}

      <ul className="mt-3 max-h-[45vh] space-y-2 overflow-y-auto border-y border-gray-100 py-3">
        {list.flatMap((s) =>
          s.orders.map((o) => (
            <li key={o.id} className="text-xs">
              <div className="flex justify-between text-gray-400">
                <span>
                  {gio(o.created_at)} · {o.order_source === 'reservation_preorder' ? 'món đặt trước' : o.order_source === 'staff' ? 'nhân viên' : o.order_source === 'pos' ? 'ghi tay' : 'khách'}
                  {o.status === 'pending' && (
                    <span className="ml-1 font-semibold text-amber-600">chờ xác nhận</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  {dong(o.total_amount)}
                  {o.payment_received_at && ' ✓'}
                  {o.order_source !== 'reservation_preorder' && <button
                    onClick={() => onPrintOrder(o.id)}
                    title="In lại 2 liên của đơn này"
                    className="rounded px-1 hover:bg-gray-100"
                  >🖨️</button>}
                </span>
              </div>
              <ul className="mt-1 space-y-1 text-gray-700">
                {o.items.map((it) => {
                  const cancelled = it.void_type === 'cancelled'
                  const gift = it.void_type === 'gift'
                  const toppingText = it.toppings?.map((topping) => topping.name).join(', ')
                  return (
                    <li key={it.id} className={`flex items-start justify-between gap-2 ${cancelled ? 'text-red-500 line-through' : ''}`}>
                      <span className="min-w-0">
                        {it.name} ×{it.quantity}
                        {toppingText && <span className="text-[11px] text-gray-400"> + {toppingText}</span>}
                        {cancelled && <span className="ml-1 no-underline text-[10px] font-semibold text-red-500">Khách bỏ</span>}
                        {gift && <span className="ml-1 text-[10px] font-semibold text-violet-600">Tặng · 0đ</span>}
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-1 no-underline">
                        {it.void_type ? (
                          <button onClick={() => onRestoreOrderItem(it.id)} disabled={busy} className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 disabled:opacity-50">Khôi phục</button>
                        ) : (
                          <>
                            <button onClick={() => dieuChinh(it.id, 'cancelled')} disabled={busy} className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 disabled:opacity-50">Bỏ</button>
                            <button onClick={() => dieuChinh(it.id, 'gift')} disabled={busy} className="rounded border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700 disabled:opacity-50">Tặng</button>
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
                {o.items.length === 0 && <li>Không có món</li>}
              </ul>
            </li>
          )),
        )}
      </ul>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">TỔNG</span>
        <span className="text-xl font-bold text-gray-900">{dong(tong)}</span>
      </div>

      {chuaXong > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ Còn {chuaXong} món chưa xong. Vẫn thu tiền và đóng bàn? Món đang làm vẫn nằm ở màn
          bếp.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onPay(list, 'cash')}
          disabled={busy}
          className="rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          💵 Tiền mặt
        </button>
        <button
          onClick={() => onPay(list, 'bank')}
          disabled={busy}
          className="rounded-xl bg-gray-800 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
        >
          🏦 Chuyển khoản
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">
        Chuyển khoản: cho khách quét mã QR của quán, nghe loa báo tiền về rồi mới bấm.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onPrint(list)}
          disabled={busy}
          className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          🖨️ In bill
        </button>
        {list.length === 1 && (
          <button
            onClick={() => onReset(list[0])}
            disabled={busy}
            className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Bỏ bàn: huỷ đơn chưa nấu và chưa thu tiền, đóng phiên"
          >
            Bỏ bàn
          </button>
        )}
      </div>

      {list.length === 1 && (
        <details className="mt-3 rounded-lg border border-gray-200 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-gray-600">
            Thao tác khác
          </summary>

          <label className="mt-2 block text-[11px] text-gray-500">Thêm bàn trống vào mâm này</label>
          <select
            disabled={busy || freeTables.length === 0}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value
              e.target.value = ''
              if (v) onAddTable(list[0].session_id, v)
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
          >
            <option value="">— chọn bàn trống —</option>
            {freeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.table_number}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-[11px] text-gray-500">
            Nhập bàn này vào một mâm khác (gộp cả đơn)
          </label>
          <select
            disabled={busy || otherSessions.length === 0}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value
              e.target.value = ''
              if (v) onMergeInto(list[0].session_id, v)
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
          >
            <option value="">— chọn mâm đích —</option>
            {otherSessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.table_number}
              </option>
            ))}
          </select>

          <button
            onClick={() => onReleaseHost(list[0].session_id)}
            disabled={busy}
            className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
          >
            Nhả quyền gọi món (khách hết pin / đổi máy)
          </button>
        </details>
      )}

      {picked.length > 0 && (
        <button onClick={onClearPick} className="mt-2 w-full py-2 text-xs text-gray-500 underline">
          Bỏ chọn {picked.length} mâm
        </button>
      )}
    </Khung>
  )
}

function Khung({ tieuDe, children }: { tieuDe: string; children: React.ReactNode }) {
  return (
    <aside className="flex w-[400px] flex-shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white p-4">
      <h2 className="text-base font-bold text-gray-900">{tieuDe}</h2>
      {children}
    </aside>
  )
}
