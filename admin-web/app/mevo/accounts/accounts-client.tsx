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
    <div className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
      {done && (
        <p className="mb-4 max-w-2xl rounded-xl bg-success-bg p-3 text-sm text-success">{done}</p>
      )}

      <p className="mb-3 text-sm text-muted">{totalAccounts} tài khoản</p>

      <div className="max-w-2xl space-y-5">
        {groups.map((group) => (
          <div key={group.key} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border bg-background px-4 py-2.5">
              <h2 className="text-sm font-bold text-foreground">{group.storeName}</h2>
            </div>

            {group.accounts.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">
                Chưa có tài khoản nào — quán này chưa gán được chủ quán.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {group.accounts.map((acc) => (
                  <li key={acc.userId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`truncate text-sm ${acc.isActive ? 'text-foreground' : 'text-muted line-through'}`}>
                            {acc.email}
                          </span>
                          <span className="flex-shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted">
                            {ROLE_LABEL[acc.role]}
                          </span>
                          {acc.isSelf && (
                            <span className="flex-shrink-0 rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
                              tài khoản của anh
                            </span>
                          )}
                          {!acc.isActive && (
                            <span className="flex-shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted">
                              Đã khoá
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          Đăng nhập lần cuối: {acc.lastSignInText}
                        </p>
                      </div>
                      <button
                        onClick={() => toggle(acc.userId)}
                        className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-light"
                      >
                        {openUserId === acc.userId ? 'Đóng' : 'Đổi mật khẩu'}
                      </button>
                    </div>

                    {openUserId === acc.userId && (
                      <form
                        action={(formData) => handleReset(acc.userId, formData)}
                        className="mt-3 space-y-3 rounded-xl bg-background p-3"
                      >
                        {error && <p className="rounded-lg bg-critical-bg p-2.5 text-sm text-danger">{error}</p>}
                        <p className="text-xs text-muted">
                          Đặt mật khẩu mới cho <strong>{acc.email}</strong>. Không cần mật khẩu cũ.
                          {acc.isSelf && ' Đây là tài khoản anh đang đăng nhập — phiên hiện tại không bị đăng xuất.'}
                        </p>
                        <PasswordField label="Mật khẩu mới" name="password" />
                        <PasswordField label="Nhập lại mật khẩu mới" name="password_confirm" />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                          >
                            {saving ? 'Đang đổi...' : 'Đổi mật khẩu'}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(acc.userId)}
                            className="rounded-xl px-4 py-2 text-sm font-medium text-muted hover:bg-item-hover"
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
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      <input
        name={name}
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-focus"
      />
    </label>
  )
}
