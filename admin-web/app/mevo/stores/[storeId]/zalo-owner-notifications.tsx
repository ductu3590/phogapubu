'use client'

import { useState, useTransition } from 'react'
import {
  createOwnerOaChallenge,
  disableOwnerOaRecipient,
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

  async function copyWebhookUrl() {
    const url = `${window.location.origin}${state.webhookPath}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  const canCreate = state.hasOaId && state.hasOaAppId && state.hasAppSecret && state.configEnabled

  return (
    <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
      <div>
        <h3 className="font-semibold text-gray-800">Người nhận thông báo đặt bàn</h3>
        <p className="mt-1 text-sm text-gray-500">
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

      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        <div className="font-medium text-gray-700">Webhook URL</div>
        <code className="mt-1 block break-all text-xs text-gray-600">{state.webhookPath}</code>
        <button
          type="button"
          onClick={copyWebhookUrl}
          className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
        >
          {copied ? 'Đã sao chép' : 'Sao chép URL đầy đủ'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-500">Trạng thái:</span>
        <span className={state.recipientStatus === 'verified' ? 'font-medium text-green-600' : 'font-medium text-gray-700'}>
          {state.recipientStatus ? recipientLabels[state.recipientStatus] : 'Chưa kết nối'}
        </span>
        {state.verifiedAt && (
          <span className="text-xs text-gray-400">
            {new Date(state.verifiedAt).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canCreate || pending}
          onClick={createChallenge}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {pending ? 'Đang xử lý…' : 'Tạo mã kết nối'}
        </button>
        {state.recipientStatus === 'verified' && (
          <button
            type="button"
            disabled={pending}
            onClick={disableRecipient}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            Tắt người nhận
          </button>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          Tải lại trạng thái
        </button>
      </div>

      {!canCreate && (
        <p className="text-sm text-amber-700">
          Cần đủ OA ID, OA API App ID và App Secret đang bật trước khi tạo mã.
        </p>
      )}

      {challenge && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">Chủ quán mở Zalo, vào đúng OA rồi gửi nguyên văn:</p>
          <code className="my-3 block select-all break-all rounded bg-white px-3 py-2 text-base font-bold">
            {challenge.message}
          </code>
          <p>Mã hết hạn lúc {new Date(challenge.expiresAt).toLocaleTimeString('vi-VN')} và chỉ dùng một lần.</p>
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  )
}

function Credential({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className={ready ? 'font-medium text-green-600' : 'font-medium text-amber-600'}>
        {ready ? 'Đã có' : 'Còn thiếu'}
      </div>
    </div>
  )
}
