'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStoreStaff, setStaffActive } from '@/lib/actions/staff'

type Staff = { userId: string; email: string; isActive: boolean }

export default function StaffClient({ staff }: { staff: Staff[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(null)

  async function handleCreate(formData: FormData) {
    setError('')
    setCreated(null)
    try {
      const res = await createStoreStaff(formData)
      setCreated(res)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    }
  }

  function handleToggle(userId: string, email: string, isActive: boolean) {
    const turningOff = isActive
    const msg = turningOff
      ? `Vô hiệu hoá "${email}"? Nhân viên này sẽ không đăng nhập được cho tới khi bật lại.`
      : `Bật lại "${email}"? Nhân viên này sẽ đăng nhập và làm việc lại được.`
    if (!confirm(msg)) return
    startTransition(async () => {
      try {
        await setStaffActive(userId, !isActive)
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Không đổi được trạng thái')
      }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Form thêm nhân viên */}
      <div className="mb-6 max-w-lg rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Thêm nhân viên</h2>
        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {created && (
          <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Đã thêm <strong>{created.email}</strong>.
            {created.tempPassword ? (
              <>
                {' '}Mật khẩu tạm (chỉ hiện 1 lần — gửi ngay cho nhân viên):{' '}
                <code className="rounded bg-white px-2 py-0.5 font-mono">{created.tempPassword}</code>
              </>
            ) : (
              ' Tài khoản đã có sẵn, mật khẩu giữ nguyên như cũ.'
            )}
          </div>
        )}
        <form action={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium text-gray-700">Email nhân viên</span>
            <input
              name="email"
              type="email"
              required
              placeholder="nhanvien@quan.vn"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-orange-400"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Thêm nhân viên
          </button>
        </form>
      </div>

      {/* Danh sách nhân viên */}
      <div className="max-w-lg">
        <p className="mb-2 text-sm text-gray-500">{staff.length} nhân viên</p>
        {staff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
            Chưa có nhân viên nào.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {staff.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`truncate text-sm ${s.isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                    {s.email}
                  </span>
                  {!s.isActive && (
                    <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      Đã tắt
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(s.userId, s.email, s.isActive)}
                  disabled={isPending}
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    s.isActive
                      ? 'text-red-500 hover:bg-red-50'
                      : 'text-green-600 hover:bg-green-50'
                  }`}
                >
                  {s.isActive ? 'Vô hiệu hoá' : 'Bật lại'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
