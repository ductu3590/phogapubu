'use client'

import type { OpenTableSession } from '@/lib/actions/table-session'

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
  onClearPick: () => void
}) {
  const list = picked.length > 0 ? picked : selected ? [selected] : []
  const tong = list.reduce((n, s) => n + s.total, 0)
  const chuaXong = list.reduce((n, s) => n + s.cooking_count, 0)

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
          ⏰ Phiên quá 6 giờ không hoạt động nên bàn đã mở khoá, nhưng còn
          <b> {dong(list[0].unpaid_total)} chưa thu</b>.
        </p>
      )}

      <ul className="mt-3 max-h-[45vh] space-y-2 overflow-y-auto border-y border-gray-100 py-3">
        {list.flatMap((s) =>
          s.orders.map((o) => (
            <li key={o.id} className="text-xs">
              <div className="flex justify-between text-gray-400">
                <span>
                  {gio(o.created_at)} · {o.order_source === 'staff' ? 'nhân viên' : 'khách'}
                </span>
                <span>
                  {dong(o.total_amount)}
                  {o.payment_received_at && ' ✓'}
                </span>
              </div>
              <p className="text-gray-700">
                {o.items.map((it) => `${it.name} ×${it.quantity}`).join(', ') || 'Không có món'}
              </p>
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
