'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateAccountPassword, updateAccountProfile } from '@/lib/actions/account'

type Props = {
  email: string
  fullName: string
  phone: string
}

export default function AccountClient({ email, fullName, phone }: Props) {
  const router = useRouter()
  const [profileSaved, setProfileSaved] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')

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

  return (
    <div className="flex max-w-xl flex-col gap-6 text-gray-900">
      <form
        action={async (fd) => {
          setProfileError('')
          try {
            await updateAccountProfile(fd)
            setProfileSaved(true)
            router.refresh()
          } catch (e) {
            setProfileError(e instanceof Error ? e.message : 'Lỗi khi lưu thông tin')
          }
        }}
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <h2 className="text-base font-semibold text-gray-900">Thông tin cá nhân</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="label">Email đăng nhập</label>
            <input
              value={email}
              readOnly
              className="input cursor-not-allowed"
              style={{ backgroundColor: '#f9fafb', color: '#6b7280' }}
            />
          </div>
          <div>
            <label className="label">Họ tên</label>
            <input name="full_name" defaultValue={fullName} maxLength={100} className="input" />
          </div>
          <div>
            <label className="label">Số điện thoại</label>
            <input name="phone" type="tel" defaultValue={phone} maxLength={30} className="input" />
          </div>
        </div>
        {profileError && <p className="mt-3 text-sm text-red-600">{profileError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Lưu thông tin
          </button>
          {profileSaved && <span className="text-sm text-green-600">Đã lưu</span>}
        </div>
      </form>

      <form
        action={async (fd) => {
          setPasswordError('')
          try {
            await updateAccountPassword(fd)
            setPasswordSaved(true)
            router.refresh()
          } catch (e) {
            setPasswordError(e instanceof Error ? e.message : 'Lỗi khi đổi mật khẩu')
          }
        }}
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <h2 className="text-base font-semibold text-gray-900">Đổi mật khẩu</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="label">Mật khẩu hiện tại</label>
            <input
              name="current_password"
              type="password"
              autoComplete="current-password"
              className="input"
            />
          </div>
          <div>
            <label className="label">Mật khẩu mới</label>
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>
          <div>
            <label className="label">Nhập lại mật khẩu mới</label>
            <input
              name="confirm_password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>
        </div>
        {passwordError && <p className="mt-3 text-sm text-red-600">{passwordError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Đổi mật khẩu
          </button>
          {passwordSaved && <span className="text-sm text-green-600">Đã đổi mật khẩu</span>}
        </div>
      </form>
    </div>
  )
}
