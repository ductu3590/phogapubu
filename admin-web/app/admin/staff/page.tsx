import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import { listStoreStaff } from '@/lib/actions/staff'
import StaffClient from './staff-client'

export default async function AdminStaffPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const staff = await listStoreStaff()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Nhân viên</h1>
        <p className="text-sm text-muted">
          Tạo tài khoản cho nhân viên đặt món hộ khách. Mỗi nhân viên đăng nhập bằng tài khoản riêng
          — không dùng chung tài khoản chủ quán.
        </p>
      </div>
      <StaffClient staff={staff} />
    </div>
  )
}
