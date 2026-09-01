'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resetOperatorPassword, type AccountGroup, type OperatorAccount } from '@/lib/actions/mevo-accounts'

const ROLE_LABEL: Record<OperatorAccount['role'], string> = {
  mevo_superadmin: 'MEVO superadmin',
  store_owner: 'Chủ quán',
  store_staff: 'Nhân viên',
}

export default function AccountsClient({ groups }: { groups: AccountGroup[] }) {
  const router = useRouter()
  // Mỗi lúc chỉ mở form của MỘT tài khoản — tránh gõ mật khẩu vào nhầm dòng.
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [saving, setSaving] = useState(false)

  function toggle(userId: string) {
    setError('')
    setDone('')
    setOpenUserId((current) => (current === userId ? null : userId))
  }

  async function handleReset(userId: string, formData: FormData) {
    setError('')
    setDone('')
    setSaving(true)
    try {
      const res = await resetOperatorPassword(userId, formData)
      setOpenUserId(null)
      setDone(`Đã đổi mật khẩu cho ${res.email}. Gửi mật khẩu mới cho họ và nhắc đăng nhập lại.`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được mật khẩu')
    } finally {
      setSaving(false)
    }
  }

  const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {done && (
        <p className="mb-4 max-w-2xl rounded-xl bg-green-50 p-3 text-sm text-green-700">{done}</p>
      )}

      <p className="mb-3 text-sm text-gray-500">{totalAccounts} tài khoản</p>

      <div className="max-w-2xl space-y-5">
        {groups.map((group) => (
          <div key={group.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
              <h2 className="text-sm font-bold text-gray-800">{group.storeName}</h2>
            </div>

            {group.accounts.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400">
                Chưa có tài khoản nào — quán này chưa gán được chủ quán.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {group.accounts.map((acc) => (
                  <li key={acc.userId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`truncate text-sm ${acc.isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            {acc.email}
                          </span>
                          <span className="flex-shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">
                            {ROLE_LABEL[acc.role]}
                          </span>
                          {acc.isSelf && (
                            <span className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                              tài khoản của anh
                            </span>
                          )}
                          {!acc.isActive && (
                            <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                              Đã khoá
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          Đăng nhập lần cuối: {acc.lastSignInText}
                        </p>
                      </div>
                      <button
                        onClick={() => toggle(acc.userId)}
                        className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
                      >
                        {openUserId === acc.userId ? 'Đóng' : 'Đổi mật khẩu'}
                      </button>
                    </div>

                    {openUserId === acc.userId && (
                      <form
                        action={(formData) => handleReset(acc.userId, formData)}
                        className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3"
                      >
                        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
                        <p className="text-xs text-gray-500">
                          Đặt mật khẩu mới cho <strong>{acc.email}</strong>. Không cần mật khẩu cũ.
                          {acc.isSelf && ' Đây là tài khoản anh đang đăng nhập — phiên hiện tại không bị đăng xuất.'}
                        </p>
                        <PasswordField label="Mật khẩu mới" name="password" />
                        <PasswordField label="Nhập lại mật khẩu mới" name="password_confirm" />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                          >
                            {saving ? 'Đang đổi...' : 'Đổi mật khẩu'}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(acc.userId)}
                            className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
                          >
                            Huỷ
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PasswordField({ label, name }: { label: string; name: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      <input
        name={name}
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400"
      />
    </label>
  )
}
