export type DeliveryStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'action_required'

export type DeliverySummary = {
  id: string
  status: DeliveryStatus
  updatedAt: string
  createdAt: string
  queuedAt: string | null
  processingStartedAt: string | null
  attemptCount: number
  requeueCount: number
  providerCode: string | null
  stale: boolean
  canRetry: boolean
  retryBlockedReason: string | null
}

export function deliveryStatusLabel(status: DeliveryStatus, stale: boolean): string {
  if (stale) return 'Cần kiểm tra'
  return {
    queued: 'Đang chờ gửi',
    processing: 'Đang gửi',
    sent: 'Đã gửi',
    failed: 'Gửi thất bại',
    action_required: 'Cần kiểm tra',
  }[status]
}

export function deliveryIsStale(status: DeliveryStatus, anchor: string | null, now = Date.now()): boolean {
  return (status === 'queued' || status === 'processing') && !!anchor && now - new Date(anchor).getTime() >= 120_000
}
