'use client'

import { useState, useTransition } from 'react'
import {
  createOwnerOaChallenge,
  disableOwnerOaRecipient,
  sendOwnerOaTest,
  type getOwnerOaNotificationState,
} from '@/lib/actions/zalo-owner-notifications'

type OwnerOaState = Awaited<ReturnType<typeof getOwnerOaNotificationState>>

const recipientLabels: Record<NonNullable<OwnerOaState['recipientStatus']>, string> = {
  pending: 'Chờ xác minh',
  verified: 'Đã xác minh',
  disabled: 'Đã tắt',
}

export default function ZaloOwnerNotifications({
  storeId,
  initialState,
}: {
  storeId: string
  initialState: OwnerOaState
}) {
  const [state, setState] = useState(initialState)
  const [challenge, setChallenge] = useState<{ message: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function createChallenge() {
    setError(null)
    startTransition(async () => {
      try {
        setChallenge(await createOwnerOaChallenge(storeId))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không tạo được mã kết nối')
      }
    })
  }

  function disableRecipient() {
    setError(null)
    startTransition(async () => {
      try {
        await disableOwnerOaRecipient(storeId)
        setState((current) => ({ ...current, recipientStatus: 'disabled' }))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không tắt được người nhận OA')
      }
    })
  }

  function sendTest() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await sendOwnerOaTest(storeId)
        setState((current) => ({ ...current, lastTestedAt: new Date().toISOString(), lastTestStatus: result.ok ? 'sent' : 'failed' }))
        if (!result.ok) setError(result.message)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không gửi được tin thử')
      }
    })
  }

  async function copyWebhookUrl() {
    const url = `${window.location.origin}${state.webhookPath}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  const canCreate = state.hasOaId && state.hasOaAppId && state.hasAppSecret && state.configEnabled

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      <div>
        <h3 className="font-semibold text-foreground">Người nhận thông báo đặt bàn</h3>
        <p className="mt-1 text-sm text-muted">
          Chủ quán phải nhắn mã kết nối vào đúng OA. Hệ thống lấy UID trực tiếp từ webhook đã ký,
          không cho nhập UID bằng tay.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Credential label="OA ID" ready={state.hasOaId} />
        <Credential label="Mini App ID" ready={state.hasMiniAppId} />
        <Credential label="OA API App ID" ready={state.hasOaAppId} />
        <Credential label="Access Token" ready={state.hasAccessToken} />
        <Credential label="App Secret" ready={state.hasAppSecret} />
      </div>

      <div className="rounded-lg bg-background p-3 text-sm">
        <div className="font-medium text-foreground/80">Webhook URL</div>
        <code className="mt-1 block break-all text-xs text-muted">{state.webhookPath}</code>
        <button
          type="button"
          onClick={copyWebhookUrl}
          className="mt-2 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-foreground/80"
        >
          {copied ? 'Đã sao chép' : 'Sao chép URL đầy đủ'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Trạng thái:</span>
        <span className={state.recipientStatus === 'verified' ? 'font-medium text-success' : 'font-medium text-foreground/80'}>
          {state.recipientStatus ? recipientLabels[state.recipientStatus] : 'Chưa kết nối'}
        </span>
        {state.verifiedAt && (
          <span className="text-xs text-muted">
            {new Date(state.verifiedAt).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canCreate || pending}
          onClick={createChallenge}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-border-strong"
        >
          {pending ? 'Đang xử lý…' : 'Tạo mã kết nối'}
        </button>
        {state.recipientStatus === 'verified' && (
          <button
            type="button"
            disabled={pending}
            onClick={disableRecipient}
            className="rounded-lg border border-critical-border px-4 py-2 text-sm font-medium text-danger disabled:opacity-50"
          >
            Tắt người nhận
          </button>
        )}
        {state.recipientStatus === 'verified' && (
          <button
            type="button"
            disabled={pending}
            onClick={sendTest}
            className="rounded-lg border border-info-border px-4 py-2 text-sm font-medium text-info disabled:opacity-50"
          >
            {pending ? 'Đang gửi…' : 'Gửi tin thử'}
          </button>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-foreground/80"
        >
          Tải lại trạng thái
        </button>
      </div>

      {state.lastTestedAt && (
        <p className="text-xs text-muted">
          Gửi thử gần nhất: {new Date(state.lastTestedAt).toLocaleString('vi-VN')} — {state.lastTestStatus === 'sent' ? 'Đã gửi' : 'Thất bại'}
        </p>
      )}

      {!canCreate && (
        <p className="text-sm text-warning">
          Cần đủ OA ID, OA API App ID và App Secret đang bật trước khi tạo mã.
        </p>
      )}

      {challenge && (
        <div className="rounded-lg border border-info-border bg-info-bg p-4 text-sm text-info">
          <p className="font-medium">Chủ quán mở Zalo, vào đúng OA rồi gửi nguyên văn:</p>
          <code className="my-3 block select-all break-all rounded bg-surface px-3 py-2 text-base font-bold">
            {challenge.message}
          </code>
          <p>Mã hết hạn lúc {new Date(challenge.expiresAt).toLocaleTimeString('vi-VN')} và chỉ dùng một lần.</p>
        </div>
      )}

      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}

function Credential({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-sm">
      <div className="text-muted">{label}</div>
      <div className={ready ? 'font-medium text-success' : 'font-medium text-warning'}>
        {ready ? 'Đã có' : 'Còn thiếu'}
      </div>
    </div>
  )
}
