'use client'

import { useState } from 'react'
import { signOut } from '../login/actions'
import { changeInitialPassword } from './actions'

const inputClass =
  'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100'

export default function ChangePasswordForm({ email }: { email: string }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await changeInitialPassword(new FormData(e.currentTarget))
    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }
    // Tải cứng (như màn đăng nhập): nạp lại toàn bộ trạng thái server, tránh route chặn @modal bắt điều hướng mềm.
    window.location.assign(result.redirectTo)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl" aria-hidden>🔒</div>
          <h1 className="text-2xl font-bold text-gray-900">Đổi mật khẩu</h1>
          <p className="mt-2 text-sm text-gray-500">
            Đây là lần đầu anh/chị đăng nhập (hoặc mật khẩu vừa được đặt lại). Hãy đặt mật khẩu mới của riêng mình
            trước khi tiếp tục.
          </p>
          {email ? <p className="mt-2 truncate text-sm font-medium text-gray-700">{email}</p> : null}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Mật khẩu mới
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">Từ 8 ký tự trở lên, khác mật khẩu đang dùng.</p>
          </div>

          <div>
            <label htmlFor="password_confirm" className="mb-1 block text-sm font-medium text-gray-700">
              Nhập lại mật khẩu mới
            </label>
            <input
              id="password_confirm"
              name="password_confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-orange-500 py-3 font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
          </button>
        </form>

        <form action={signOut} className="mt-4 text-center">
          <button type="submit" className="text-sm text-gray-500 underline-offset-2 hover:underline">
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  )
}
