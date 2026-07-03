'use client'

import { assignStoreOwner } from '@/lib/actions/mevo-stores'
import { useState } from 'react'

// Client Component riêng cho form gán chủ quán — cần hiện mật khẩu tạm (nếu tài khoản mới tạo)
// TRẢ VỀ 1 LẦN DUY NHẤT ngay sau khi bấm, không lưu lại được sau đó.
export default function AssignOwnerForm({ storeId }: { storeId: string }) {
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ email: string; tempPassword: string | null } | null>(null)

  async function action(formData: FormData) {
    setError('')
    setResult(null)
    try {
      const res = await assignStoreOwner(storeId, formData)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Đã gán <strong>{result.email}</strong> làm chủ quán.
          {result.tempPassword ? (
            <>
              {' '}Mật khẩu tạm (chỉ hiện 1 lần, hãy gửi ngay cho chủ quán):{' '}
              <code className="rounded bg-white px-2 py-0.5 font-mono">{result.tempPassword}</code>
            </>
          ) : (
            ' Tài khoản đã có sẵn, mật khẩu giữ nguyên như cũ.'
          )}
        </div>
      )}
      <form action={action} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Email chủ quán</span>
          <input name="email" type="email" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
          Gán / tạo tài khoản
        </button>
      </form>
    </div>
  )
}
