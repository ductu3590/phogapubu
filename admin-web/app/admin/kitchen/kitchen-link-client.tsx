'use client'

import { useState } from 'react'
import { generateKitchenLink, revokeKitchenToken } from '@/lib/actions/kitchen'

interface Props {
  storeId: string
  storeName: string
}

export default function KitchenLinkClient({ storeId, storeName }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  // path từ server (vd: /kitchen/slug?k=...) → ghép origin để thành URL đầy đủ mở trên tablet
  const toFullUrl = (path: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}${path}` : path

  async function handleGenerate() {
    setLoading(true)
    setError('')
    setCopied(false)
    try {
      const { path } = await generateKitchenLink(storeId)
      setUrl(toFullUrl(path))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi sinh link bếp')
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke() {
    if (
      !confirm(
        'Thu hồi sẽ làm MỌI link bếp cũ của quán này ngừng hoạt động ngay. ' +
          'Bạn sẽ phải mở lại link mới trên tablet. Tiếp tục?',
      )
    )
      return
    setLoading(true)
    setError('')
    setCopied(false)
    try {
      const { path } = await revokeKitchenToken(storeId)
      setUrl(toFullUrl(path))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi thu hồi token')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Không copy được — chọn và copy thủ công.')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ Link bếp chứa <strong>chìa khoá riêng của quán {storeName}</strong>. Chỉ mở trên
          tablet đặt tại quán, không chia sẻ ra ngoài. Nếu lộ → bấm “Thu hồi &amp; cấp lại”.
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : 'Lấy link bếp'}
          </button>
          <button
            onClick={handleRevoke}
            disabled={loading}
            className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Thu hồi &amp; cấp lại
          </button>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">⚠️ {error}</p>
        )}

        {url && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Link bếp (mở trên tablet, lần đầu cần mạng):
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 outline-none"
              />
              <button
                onClick={handleCopy}
                className="flex-shrink-0 rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                {copied ? 'Đã copy ✓' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Mở link này trên tablet bếp một lần — token sẽ được lưu lại, lần sau không cần link.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
