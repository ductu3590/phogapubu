'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateAccountPassword, updateAccountProfile } from '@/lib/actions/account'

type Props = {
  email: string
  fullName: string
  phone: string
  roleLabel: string
}

export default function AccountClient({ email, fullName, phone, roleLabel }: Props) {
  const router = useRouter()
  const [profileSaved, setProfileSaved] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [profilePending, startProfile] = useTransition()
  const [passwordPending, startPassword] = useTransition()

  useEffect(() => {
    if (!profileSaved) return
    const t = setTimeout(() => setProfileSaved(false), 2500)
    return () => clearTimeout(t)
  }, [profileSaved])

  useEffect(() => {
    if (!passwordSaved) return
    const t = setTimeout(() => setPasswordSaved(false), 2500)
    return () => clearTimeout(t)
  }, [passwordSaved])

  const displayName = fullName.trim() || email
  const initial = (displayName.trim()[0] ?? '?').toUpperCase()

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 text-foreground">
      {/* Dải nhận diện tài khoản */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white" aria-hidden>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-foreground">{displayName}</p>
          <p className="truncate text-sm text-muted">{email}</p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground/80">{roleLabel}</span>
      </div>

      <div className="grid items-stretch gap-5 @3xl:grid-cols-2">
        <form
          action={(fd) => {
            setProfileError('')
            startProfile(async () => {
              const res = await updateAccountProfile(fd)
              if (!res.ok) { setProfileError(res.error); return }
              setProfileSaved(true)
              router.refresh()
            })
          }}
          className="flex flex-col rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-base font-semibold text-foreground">Thông tin cá nhân</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="label">Email đăng nhập</label>
              <input value={email} readOnly className="input cursor-not-allowed bg-secondary text-muted" />
            </div>
            <div className="grid gap-4 @xl:grid-cols-2">
              <div>
                <label className="label">Họ tên</label>
                <input name="full_name" defaultValue={fullName} maxLength={100} className="input" />
              </div>
              <div>
                <label className="label">Số điện thoại</label>
                <input name="phone" type="tel" defaultValue={phone} maxLength={30} className="input" />
              </div>
            </div>
          </div>
          {profileError && <p className="mt-3 text-sm text-danger">{profileError}</p>}
          <div className="mt-auto flex items-center gap-3 pt-5">
            <button
              type="submit"
              disabled={profilePending}
              className="min-h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {profilePending ? 'Đang lưu…' : 'Lưu thông tin'}
            </button>
            {profileSaved && <span className="text-sm text-success">Đã lưu</span>}
          </div>
        </form>

        <form
          action={(fd) => {
            setPasswordError('')
            startPassword(async () => {
              const res = await updateAccountPassword(fd)
              if (!res.ok) { setPasswordError(res.error); return }
              setPasswordSaved(true)
              router.refresh()
            })
          }}
          className="flex flex-col rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-base font-semibold text-foreground">Đổi mật khẩu</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="label">Mật khẩu hiện tại</label>
              <input name="current_password" type="password" autoComplete="current-password" className="input" />
            </div>
            <div className="grid gap-4 @xl:grid-cols-2">
              <div>
                <label className="label">Mật khẩu mới</label>
                <input name="password" type="password" minLength={8} autoComplete="new-password" className="input" />
              </div>
              <div>
                <label className="label">Nhập lại mật khẩu mới</label>
                <input name="confirm_password" type="password" minLength={8} autoComplete="new-password" className="input" />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted">Mật khẩu mới từ 8 ký tự.</p>
          </div>
          {passwordError && <p className="mt-3 text-sm text-danger">{passwordError}</p>}
          <div className="mt-auto flex items-center gap-3 pt-5">
            <button
              type="submit"
              disabled={passwordPending}
              className="min-h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {passwordPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </button>
            {passwordSaved && <span className="text-sm text-success">Đã đổi mật khẩu</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
