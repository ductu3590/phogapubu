import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { listStoreStaff } from '@/lib/actions/staff'
import StaffClient from './staff-client'

export default async function AdminStaffPage() {
  await requireAdminPageOrRedirect('owner')

  const staff = await listStoreStaff()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Nhân viên</h1>
        <p className="text-sm text-muted">
          Tạo tài khoản cho nhân viên phục vụ (đặt món hộ khách) hoặc thu ngân (thu tiền, xem báo cáo ngày).
          Mỗi người đăng nhập bằng tài khoản riêng — không dùng chung tài khoản chủ quán.
        </p>
      </div>
      <StaffClient staff={staff} />
    </div>
  )
}
