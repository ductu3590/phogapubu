'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, KeyRound, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react'
import {
  createStoreStaff,
  resetStaffPassword,
  setStaffActive,
  updateStaff,
  type StaffMember,
} from '@/lib/actions/staff'
import { ROLE_LABEL } from '@/lib/auth/roles'

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; staff: StaffMember }
  | { kind: 'reset'; staff: StaffMember }
  | { kind: 'toggle'; staff: StaffMember }

const fieldClass = 'rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-focus'
const inputClass = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-focus'
const iconButtonClass = 'inline-flex size-9 items-center justify-center rounded-lg border'
const NAME_MAX = 60

// Tài khoản cũ (trước mig 101) chưa có tên → hiện email làm tên chính.
function staffLabel(s: StaffMember) {
  return s.displayName ?? s.email
}

export default function StaffClient({ staff }: { staff: StaffMember[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | StaffMember['role']>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'off'>('all')
  // Mật khẩu tạm chỉ hiện 1 lần ngay trong hộp thoại thêm.
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(null)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter((s) =>
      (!q || s.email.toLowerCase().includes(q) || (s.displayName ?? '').toLowerCase().includes(q)) &&
      (roleFilter === 'all' || s.role === roleFilter) &&
      (statusFilter === 'all' || (statusFilter === 'active') === s.isActive))
  }, [staff, search, roleFilter, statusFilter])

  function open(next: Dialog) {
    setError('')
    setCreated(null)
    setDialog(next)
  }
  function close() {
    if (isPending) return
    setDialog(null)
    setCreated(null)
    setError('')
  }

  async function handleCreate(formData: FormData) {
    setError('')
    startTransition(async () => {
      try {
        setCreated(await createStoreStaff(formData))
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
      }
    })
  }

  async function handleReset(userId: string, formData: FormData) {
    setError('')
    startTransition(async () => {
      const res = await resetStaffPassword(userId, formData)
      if (!res.ok) { setError(res.error); return }
      setDialog(null)
      setNotice(`Đã đổi mật khẩu cho ${res.email}. Gửi mật khẩu mới cho nhân viên và nhắc đăng nhập lại.`)
      router.refresh()
    })
  }

  async function handleEdit(userId: string, formData: FormData) {
    setError('')
    startTransition(async () => {
      const res = await updateStaff(userId, formData)
      if (!res.ok) { setError(res.error); return }
      setDialog(null)
      setNotice('')
      router.refresh()
    })
  }

  // Bật/tắt: xác nhận bằng hộp thoại trong trang thay cho confirm()/alert() của trình duyệt.
  function handleToggle(staff: StaffMember) {
    setError('')
    startTransition(async () => {
      try {
        await setStaffActive(staff.userId, !staff.isActive)
        setDialog(null)
        setNotice('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không thực hiện được')
      }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-4 flex flex-wrap items-center gap-2 md:flex-nowrap">
          <label className="relative min-w-0 flex-1 md:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email"
              aria-label="Tìm theo tên hoặc email"
              className={`${inputClass} pl-9`}
            />
          </label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} aria-label="Lọc vai trò" className={fieldClass}>
            <option value="all">Mọi vai trò</option>
            <option value="store_staff">{ROLE_LABEL.store_staff}</option>
            <option value="store_cashier">{ROLE_LABEL.store_cashier}</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Lọc trạng thái" className={fieldClass}>
            <option value="all">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="off">Đã tắt</option>
          </select>
          <span className="whitespace-nowrap text-sm text-muted">{visible.length}/{staff.length} người</span>
          <button
            type="button"
            onClick={() => open({ kind: 'add' })}
            className="ml-auto inline-flex min-h-10 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
          >
            <Plus className="size-4" aria-hidden />Thêm nhân viên
          </button>
        </div>

        {notice && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-success-bg p-3 text-sm text-success">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} className="font-bold underline">Đóng</button>
          </div>
        )}

        {staff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted">
            Chưa có nhân viên nào. Bấm “Thêm nhân viên” để tạo tài khoản đầu tiên.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted">
            Không có nhân viên khớp bộ lọc.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="hidden border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted md:table-header-group">
                <tr>
                  <th className="px-4 py-2.5">Nhân viên</th>
                  <th className="px-4 py-2.5">Vai trò</th>
                  <th className="px-4 py-2.5">Trạng thái</th>
                  <th className="px-4 py-2.5">Đăng nhập lần cuối</th>
                  <th className="px-4 py-2.5">Ngày tạo</th>
                  <th className="px-4 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((s) => (
                  <tr key={s.userId} className="flex flex-col gap-2 px-4 py-3 md:table-row md:p-0">
                    <td className="min-w-0 md:px-4 md:py-3">
                      <div className={`font-semibold ${s.isActive ? 'text-foreground' : 'text-muted line-through'}`}>
                        {staffLabel(s)}
                      </div>
                      {s.displayName ? (
                        <div className="break-all text-xs text-muted">{s.email}</div>
                      ) : (
                        <button type="button" onClick={() => open({ kind: 'edit', staff: s })} className="text-xs font-medium text-primary hover:underline">
                          Chưa có tên — đặt tên
                        </button>
                      )}
                    </td>
                    <td className="md:px-4 md:py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.role === 'store_cashier' ? 'bg-orange-50 text-orange-700' : 'bg-secondary text-muted'}`}>
                        {ROLE_LABEL[s.role]}
                      </span>
                    </td>
                    <td className="md:px-4 md:py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.isActive ? 'bg-success-bg text-success' : 'bg-secondary text-muted'}`}>
                        {s.isActive ? 'Đang hoạt động' : 'Đã tắt'}
                      </span>
                    </td>
                    <td className="text-muted md:px-4 md:py-3">{s.lastSignInText}</td>
                    <td className="text-muted md:px-4 md:py-3">{s.createdText}</td>
                    <td className="md:px-4 md:py-3">
                      <div className="flex items-center gap-1.5 md:justify-end">
                        <button
                          type="button"
                          onClick={() => open({ kind: 'edit', staff: s })}
                          title="Chỉnh sửa"
                          aria-label={`Chỉnh sửa ${staffLabel(s)}`}
                          className={`${iconButtonClass} border-border-strong text-foreground hover:bg-item-hover`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => open({ kind: 'reset', staff: s })}
                          title="Đặt lại mật khẩu"
                          aria-label={`Đặt lại mật khẩu ${staffLabel(s)}`}
                          className={`${iconButtonClass} border-border-strong text-foreground hover:bg-item-hover`}
                        >
                          <KeyRound className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => open({ kind: 'toggle', staff: s })}
                          title={s.isActive ? 'Vô hiệu hoá' : 'Bật lại'}
                          aria-label={`${s.isActive ? 'Vô hiệu hoá' : 'Bật lại'} ${staffLabel(s)}`}
                          className={`${iconButtonClass} ${s.isActive ? 'border-critical-border text-danger hover:bg-danger-bg' : 'border-border-strong text-success hover:bg-success-bg'}`}
                        >
                          {s.isActive ? <UserX className="size-4" aria-hidden /> : <UserCheck className="size-4" aria-hidden />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-6">
          <section role="dialog" aria-modal="true" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
            {dialog.kind === 'add' && (
              <AddDialog created={created} error={error} busy={isPending} onSubmit={handleCreate} onClose={close} />
            )}
            {dialog.kind === 'edit' && (
              <EditDialog staff={dialog.staff} error={error} busy={isPending} onSubmit={(fd) => handleEdit(dialog.staff.userId, fd)} onClose={close} />
            )}
            {dialog.kind === 'reset' && (
              <ResetDialog staff={dialog.staff} error={error} busy={isPending} onSubmit={(fd) => handleReset(dialog.staff.userId, fd)} onClose={close} />
            )}
            {dialog.kind === 'toggle' && (
              <ConfirmDialog staff={dialog.staff} error={error} busy={isPending} onConfirm={() => handleToggle(dialog.staff)} onClose={close} />
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Đóng" className="min-h-10 min-w-10 rounded-lg text-xl text-muted hover:bg-item-hover">×</button>
    </div>
  )
}

function AddDialog({ created, error, busy, onSubmit, onClose }: {
  created: { email: string; tempPassword: string | null } | null
  error: string
  busy: boolean
  onSubmit: (fd: FormData) => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  if (created) {
    return (
      <div className="space-y-4">
        <DialogHeader title="Đã thêm nhân viên" onClose={onClose} />
        <p className="text-sm text-foreground/80">Tài khoản <strong>{created.email}</strong> đã sẵn sàng.</p>
        {created.tempPassword ? (
          <div className="rounded-lg bg-success-bg p-3 text-sm text-success">
            <p>Mật khẩu tạm (chỉ hiện 1 lần — gửi ngay cho nhân viên):</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-surface px-2 py-1 font-mono text-base text-foreground">{created.tempPassword}</code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(created.tempPassword!).then(() => setCopied(true)).catch(() => undefined) }}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border-strong bg-surface px-2.5 text-xs font-semibold text-foreground"
              >
                <Copy className="size-3.5" aria-hidden />{copied ? 'Đã chép' : 'Sao chép'}
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-secondary p-3 text-sm text-muted">Tài khoản đã có sẵn, mật khẩu giữ nguyên như cũ.</p>
        )}
        <button type="button" onClick={onClose} className="min-h-10 w-full rounded-lg bg-primary font-bold text-white hover:bg-primary-hover">Xong</button>
      </div>
    )
  }
  return (
    <form action={onSubmit} className="space-y-4">
      <DialogHeader title="Thêm nhân viên" onClose={onClose} />
      {error && <p className="rounded-lg bg-critical-bg p-3 text-sm text-danger">{error}</p>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground/80">Tên nhân viên</span>
        <input name="display_name" required maxLength={NAME_MAX} placeholder="VD: Nguyễn Văn An" autoComplete="off" className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground/80">Email đăng nhập</span>
        <input name="email" type="email" required placeholder="nhanvien@quan.vn" className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground/80">Vai trò</span>
        <select name="role" defaultValue="store_staff" className={inputClass}>
          <option value="store_staff">{ROLE_LABEL.store_staff}</option>
          <option value="store_cashier">{ROLE_LABEL.store_cashier}</option>
        </select>
      </label>
      <p className="text-xs text-muted">Phục vụ: đặt món hộ khách. Thu ngân: thu tiền, bỏ/tặng món, xem báo cáo ngày.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-lg border border-border-strong font-bold">Huỷ</button>
        <button type="submit" disabled={busy} className="min-h-10 flex-1 rounded-lg bg-primary font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? 'Đang thêm…' : 'Thêm nhân viên'}
        </button>
      </div>
    </form>
  )
}

function ResetDialog({ staff, error, busy, onSubmit, onClose }: {
  staff: StaffMember
  error: string
  busy: boolean
  onSubmit: (fd: FormData) => void
  onClose: () => void
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <DialogHeader title="Đặt lại mật khẩu" onClose={onClose} />
      <p className="text-sm text-muted">
        Đặt mật khẩu mới cho <strong className="text-foreground">{staffLabel(staff)}</strong>
        {staff.displayName && <> ({staff.email})</>}. Không cần mật khẩu cũ.
      </p>
      {error && <p className="rounded-lg bg-critical-bg p-3 text-sm text-danger">{error}</p>}
      {[['Mật khẩu mới', 'password'], ['Nhập lại mật khẩu mới', 'password_confirm']].map(([label, name]) => (
        <label key={name} className="block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">{label}</span>
          <input name={name} type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </label>
      ))}
      <p className="text-xs text-muted">Từ 8 ký tự, không có dấu cách ở đầu hoặc cuối.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-lg border border-border-strong font-bold">Huỷ</button>
        <button type="submit" disabled={busy} className="min-h-10 flex-1 rounded-lg bg-primary font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
      </div>
    </form>
  )
}

function EditDialog({ staff, error, busy, onSubmit, onClose }: {
  staff: StaffMember
  error: string
  busy: boolean
  onSubmit: (fd: FormData) => void
  onClose: () => void
}) {
  const [role, setRole] = useState(staff.role)
  const roleChanged = role !== staff.role
  // onSubmit + preventDefault (không dùng form action): React 19 tự reset form sau action, kể cả khi báo lỗi.
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)) }}
      className="space-y-4"
    >
      <DialogHeader title="Chỉnh sửa nhân viên" onClose={onClose} />
      {error && <p className="rounded-lg bg-critical-bg p-3 text-sm text-danger">{error}</p>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground/80">Tên nhân viên</span>
        <input
          name="display_name"
          required
          maxLength={NAME_MAX}
          defaultValue={staff.displayName ?? ''}
          placeholder="VD: Nguyễn Văn An"
          autoComplete="off"
          autoFocus
          className={inputClass}
        />
      </label>
      <div>
        <span className="mb-1 block text-sm font-medium text-foreground/80">Email đăng nhập</span>
        <p className="break-all rounded-lg bg-secondary px-3 py-2.5 text-sm text-muted">{staff.email}</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground/80">Vai trò</span>
        <select name="role" value={role} onChange={(e) => setRole(e.target.value as StaffMember['role'])} className={inputClass}>
          <option value="store_staff">{ROLE_LABEL.store_staff}</option>
          <option value="store_cashier">{ROLE_LABEL.store_cashier}</option>
        </select>
      </label>
      {roleChanged ? (
        <p className="rounded-lg bg-warning-bg p-3 text-xs text-warning">
          {role === 'store_cashier'
            ? 'Người này sẽ thu tiền, bỏ/tặng món và xem doanh thu.'
            : 'Người này sẽ không thu tiền được nữa.'}
          {' '}Có hiệu lực từ lần tải trang kế tiếp của họ.
        </p>
      ) : (
        <p className="text-xs text-muted">Phục vụ: đặt món hộ khách. Thu ngân: thu tiền, bỏ/tặng món, xem báo cáo ngày.</p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-lg border border-border-strong font-bold">Huỷ</button>
        <button type="submit" disabled={busy} className="min-h-10 flex-1 rounded-lg bg-primary font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
    </form>
  )
}

function ConfirmDialog({ staff, error, busy, onConfirm, onClose }: {
  staff: StaffMember
  error: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const title = staff.isActive ? 'Vô hiệu hoá tài khoản' : 'Bật lại tài khoản'
  const body = staff.isActive
    ? 'Nhân viên này sẽ không đăng nhập được cho tới khi bật lại. Lịch sử bill và báo cáo được giữ nguyên.'
    : 'Nhân viên này sẽ đăng nhập và làm việc lại được.'
  const danger = staff.isActive
  return (
    <div className="space-y-4">
      <DialogHeader title={title} onClose={onClose} />
      <p className="text-sm text-foreground/80">
        <strong>{staffLabel(staff)}</strong>
        {staff.displayName && <span className="text-muted"> · {staff.email}</span>}
      </p>
      <p className="text-sm text-muted">{body}</p>
      {error && <p className="rounded-lg bg-critical-bg p-3 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-lg border border-border-strong font-bold">Huỷ</button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`min-h-10 flex-1 rounded-lg font-bold text-white disabled:opacity-50 ${danger ? 'bg-danger' : 'bg-primary hover:bg-primary-hover'}`}
        >
          {busy ? 'Đang lưu…' : 'Xác nhận'}
        </button>
      </div>
    </div>
  )
}
