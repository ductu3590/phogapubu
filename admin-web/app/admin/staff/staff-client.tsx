'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStoreStaff, setStaffActive, setStaffRole } from '@/lib/actions/staff'
import { ROLE_LABEL } from '@/lib/auth/roles'

type Staff = { userId: string; email: string; isActive: boolean; role: 'store_staff' | 'store_cashier' }

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

  // Đổi vai trò Phục vụ ↔ Thu ngân (PA-2). Thu ngân thu được tiền + xem doanh thu nên hỏi lại trước.
  function handleRole(userId: string, email: string, role: Staff['role']) {
    const next = role === 'store_cashier' ? 'store_staff' : 'store_cashier'
    const msg = next === 'store_cashier'
      ? `Đổi "${email}" thành Thu ngân? Người này sẽ thu tiền, bỏ/tặng món và xem doanh thu.`
      : `Đổi "${email}" thành Nhân viên phục vụ? Người này sẽ không thu tiền được nữa.`
    if (!confirm(msg)) return
    startTransition(async () => {
      try {
        await setStaffRole(userId, next)
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Không đổi được vai trò')
      }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Form thêm nhân viên */}
      <div className="mb-6 max-w-lg rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">Thêm nhân viên</h2>
        {error && <p className="mb-3 rounded-lg bg-critical-bg p-3 text-sm text-danger">{error}</p>}
        {created && (
          <div className="mb-3 rounded-lg bg-success-bg p-3 text-sm text-success">
            Đã thêm <strong>{created.email}</strong>.
            {created.tempPassword ? (
              <>
                {' '}Mật khẩu tạm (chỉ hiện 1 lần — gửi ngay cho nhân viên):{' '}
                <code className="rounded bg-surface px-2 py-0.5 font-mono">{created.tempPassword}</code>
              </>
            ) : (
              ' Tài khoản đã có sẵn, mật khẩu giữ nguyên như cũ.'
            )}
          </div>
        )}
        <form action={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium text-foreground/80">Email nhân viên</span>
            <input
              name="email"
              type="email"
              required
              placeholder="nhanvien@quan.vn"
              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-foreground outline-none focus:border-focus"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground/80">Vai trò</span>
            <select name="role" defaultValue="store_staff" className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-focus">
              <option value="store_staff">Nhân viên phục vụ</option>
              <option value="store_cashier">Thu ngân</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Thêm nhân viên
          </button>
        </form>
      </div>

      {/* Danh sách nhân viên */}
      <div className="max-w-2xl">
        <p className="mb-2 text-sm text-muted">{staff.length} người</p>
        {staff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            Chưa có nhân viên nào.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {staff.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`truncate text-sm ${s.isActive ? 'text-foreground' : 'text-muted line-through'}`}>
                    {s.email}
                  </span>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.role === 'store_cashier' ? 'bg-orange-50 text-orange-700' : 'bg-secondary text-muted'}`}>
                    {ROLE_LABEL[s.role]}
                  </span>
                  {!s.isActive && (
                    <span className="flex-shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted">
                      Đã tắt
                    </span>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={() => handleRole(s.userId, s.email, s.role)}
                  disabled={isPending}
                  className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-secondary disabled:opacity-50"
                >
                  {s.role === 'store_cashier' ? 'Đổi thành Phục vụ' : 'Đổi thành Thu ngân'}
                </button>
                <button
                  onClick={() => handleToggle(s.userId, s.email, s.isActive)}
                  disabled={isPending}
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    s.isActive
                      ? 'text-danger hover:bg-danger-bg'
                      : 'text-success hover:bg-success-bg'
                  }`}
                >
                  {s.isActive ? 'Vô hiệu hoá' : 'Bật lại'}
                </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
