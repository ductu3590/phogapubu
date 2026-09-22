'use client'

import { useState, useTransition } from 'react'
import {
  disableGroupNotificationChannel,
  saveGroupNotificationChannel,
  sendGroupNotificationTest,
  type GroupNotificationState,
} from '@/lib/actions/reservation-group-notifications'

const statusLabel: Record<NonNullable<GroupNotificationState['lastDeliveryStatus']>, string> = {
  sent: 'Đã gửi', failed: 'Sẽ thử lại', action_required: 'Cần kiểm tra thủ công',
}

export default function ReservationGroupNotifications({ storeId, initialState }: { storeId: string; initialState: GroupNotificationState }) {
  const [state, setState] = useState(initialState)
  const [groupId, setGroupId] = useState('')
  const [enabled, setEnabled] = useState(initialState.enabled)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null); setNotice(null)
    startTransition(async () => {
      try {
        await saveGroupNotificationChannel(storeId, { enabled, groupId })
        setState((current) => ({ ...current, provider: 'zca_group', enabled, hasDestination: true }))
        setGroupId('')
        setNotice(enabled ? 'Đã lưu và bật cảnh báo nhóm. Chưa có tin nào được gửi tự động.' : 'Đã lưu nhóm ở trạng thái tắt.')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được cấu hình') }
    })
  }

  function disable() {
    setError(null); setNotice(null)
    startTransition(async () => {
      try {
        await disableGroupNotificationChannel(storeId)
        setEnabled(false)
        setState((current) => ({ ...current, provider: 'none', enabled: false, hasDestination: false }))
        setNotice('Đã tắt thông báo nội bộ. Booking vẫn hoạt động bình thường trên POS.')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tắt được cảnh báo') }
    })
  }

  function sendTest() {
    setError(null); setNotice(null)
    startTransition(async () => {
      try {
        const result = await sendGroupNotificationTest(storeId)
        setState((current) => ({ ...current, lastDeliveryAt: new Date().toISOString(), lastDeliveryStatus: result.ok ? 'sent' : 'action_required' }))
        if (result.ok) setNotice('Đã gửi tin thử vào nhóm Zalo.')
        else setError(result.message || 'Relay chưa gửi được tin thử')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được tin thử') }
    })
  }

  return (
    <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
      <div>
        <h3 className="font-semibold text-gray-800">Thông báo nội bộ (best-effort)</h3>
        <p className="mt-1 text-sm text-gray-500">Dùng bot nội bộ để báo booking mới cho nhóm vận hành. POS vẫn là nguồn xử lý chính; khi relay lỗi, chủ quán xem POS hoặc gọi điện.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Status label="Kênh" value={state.enabled ? 'Đang bật' : 'Đang tắt'} ok={state.enabled} />
        <Status label="Group ID" value={state.hasDestination ? 'Đã lưu (ẩn)' : 'Chưa lưu'} ok={state.hasDestination} />
        <Status label="Gửi gần nhất" value={state.lastDeliveryStatus ? statusLabel[state.lastDeliveryStatus] : 'Chưa có'} ok={state.lastDeliveryStatus === 'sent'} />
      </div>
      {state.lastDeliveryAt && <p className="text-xs text-gray-500">Cập nhật gần nhất: {new Date(state.lastDeliveryAt).toLocaleString('vi-VN')}{state.lastProviderCode ? ` · ${state.lastProviderCode}` : ''}</p>}
      <label className="block text-sm font-medium text-gray-700">
        Zalo Group ID mới
        <input value={groupId} onChange={(event) => setGroupId(event.target.value)} placeholder="Nhập để lưu hoặc thay nhóm; giá trị cũ luôn ẩn" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Bật cảnh báo nhóm sau khi lưu</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300">{pending ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
        <button type="button" disabled={pending || !state.enabled} onClick={sendTest} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 disabled:opacity-50">Gửi tin thử</button>
        {state.enabled && <button type="button" disabled={pending} onClick={disable} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50">Tắt cảnh báo</button>}
      </div>
      {notice && <p className="text-sm font-medium text-green-700">{notice}</p>}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  )
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm"><div className="text-gray-500">{label}</div><div className={ok ? 'font-medium text-green-600' : 'font-medium text-gray-600'}>{value}</div></div>
}
