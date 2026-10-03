'use client'

import { useState, useTransition } from 'react'
import {
  disableGroupNotificationChannel,
  saveGroupNotificationChannel,
  sendGroupNotificationTest,
  retryGroupNotificationDelivery,
  type GroupNotificationState,
} from '@/lib/actions/reservation-group-notifications'
import { deliveryStatusLabel, type DeliverySummary } from '@/lib/reservation-delivery-status'

const statusLabel: Record<NonNullable<GroupNotificationState['lastDeliveryStatus']>, string> = {
  queued: 'Đang chờ gửi', processing: 'Đang gửi', sent: 'Đã gửi', failed: 'Gửi thất bại', action_required: 'Cần kiểm tra',
}

export default function ReservationGroupNotifications({ storeId, initialState, initialDeliveries }: { storeId: string; initialState: GroupNotificationState; initialDeliveries?: DeliverySummary[] }) {
  const [state, setState] = useState(initialState)
  const [groupId, setGroupId] = useState('')
  const [enabled, setEnabled] = useState(initialState.enabled)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function retry(delivery: DeliverySummary) {
    setError(null); setNotice(null)
    startTransition(async () => {
      const result = await retryGroupNotificationDelivery(storeId, {
        deliveryId: delivery.id, expectedUpdatedAt: delivery.updatedAt,
        requestId: crypto.randomUUID(), reason: 'MEVO kiểm tra và gửi lại thông báo nội bộ',
      })
      if (!result.ok) setError(result.error || 'Không thể gửi lại delivery')
      else setNotice(result.already ? 'Yêu cầu gửi lại đã được ghi nhận trước đó.' : 'Đã xếp delivery vào hàng đợi gửi lại.')
    })
  }

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
        setState((current) => ({ ...current, lastDeliveryAt: new Date().toISOString(), lastDeliveryStatus: result.ok ? 'queued' : 'action_required' }))
        if (result.ok) setNotice('Đã xếp tin thử vào hàng đợi. Trạng thái thực tế sẽ cập nhật từ server.')
        else setError(result.message || 'Relay chưa gửi được tin thử')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được tin thử') }
    })
  }

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      <div>
        <h3 className="font-semibold text-foreground">Thông báo nội bộ (best-effort)</h3>
        <p className="mt-1 text-sm text-muted">Dùng bot nội bộ để báo booking mới cho nhóm vận hành. POS vẫn là nguồn xử lý chính; khi relay lỗi, chủ quán xem POS hoặc gọi điện.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Status label="Kênh" value={state.enabled ? 'Đang bật' : 'Đang tắt'} ok={state.enabled} />
        <Status label="Group ID" value={state.hasDestination ? 'Đã lưu (ẩn)' : 'Chưa lưu'} ok={state.hasDestination} />
        <Status label="Gửi gần nhất" value={state.lastDeliveryStatus ? statusLabel[state.lastDeliveryStatus] : 'Chưa có'} ok={state.lastDeliveryStatus === 'sent'} />
      </div>
      <p className="text-xs text-muted">Gửi lại: {state.retryContractVerified ? 'Đã xác minh relay khử trùng theo mã delivery' : 'Đang khóa đến khi MEVO xác minh relay không gửi trùng'}</p>
      {state.lastDeliveryAt && <p className="text-xs text-muted">Cập nhật gần nhất: {new Date(state.lastDeliveryAt).toLocaleString('vi-VN')}{state.lastProviderCode ? ` · ${state.lastProviderCode}` : ''}</p>}
      <label className="block text-sm font-medium text-foreground/80">
        Zalo Group ID mới
        <input value={groupId} onChange={(event) => setGroupId(event.target.value)} placeholder="Nhập để lưu hoặc thay nhóm; giá trị cũ luôn ẩn" className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground/80"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Bật cảnh báo nhóm sau khi lưu</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:bg-border-strong">{pending ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
        <button type="button" disabled={pending || !state.enabled} onClick={sendTest} className="rounded-lg border border-info-border px-4 py-2 text-sm font-medium text-info disabled:opacity-50">Gửi tin thử</button>
        {state.enabled && <button type="button" disabled={pending} onClick={disable} className="rounded-lg border border-critical-border px-4 py-2 text-sm font-medium text-danger disabled:opacity-50">Tắt cảnh báo</button>}
      </div>
      {(initialDeliveries?.length ?? 0) > 0 && <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-xs"><thead className="bg-background text-muted"><tr><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Lần gửi</th><th className="px-3 py-2">Cập nhật</th><th className="px-3 py-2">Thao tác</th></tr></thead>
          <tbody>{initialDeliveries!.map((delivery) => <tr key={delivery.id} className="border-t border-border"><td className="px-3 py-2">{deliveryStatusLabel(delivery.status, delivery.stale)}{delivery.providerCode ? ` · ${delivery.providerCode}` : ''}</td><td className="px-3 py-2">{delivery.attemptCount}</td><td className="px-3 py-2">{new Date(delivery.updatedAt).toLocaleString('vi-VN')}</td><td className="px-3 py-2">{delivery.canRetry ? <button type="button" disabled={pending} onClick={() => retry(delivery)} className="text-info disabled:opacity-50">Gửi lại</button> : <span title={delivery.retryBlockedReason ?? undefined}>—</span>}</td></tr>)}</tbody>
        </table>
      </div>}
      {notice && <p className="text-sm font-medium text-success">{notice}</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-lg border border-border px-3 py-2 text-sm"><div className="text-muted">{label}</div><div className={ok ? 'font-medium text-success' : 'font-medium text-muted'}>{value}</div></div>
}
