import { LayoutDashboard, ShieldCheck, Store, Users, PlusSquare } from 'lucide-react'
import { requireOperatorOrRedirect, signedInEmail } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/sign-out-button'
import RevisitRefresh from '@/components/revisit-refresh'
import { AppShell } from '@/components/ui/app-shell'

// Khu MEVO superadmin — sidebar rộng theo bản Stitch A07/A10 (ST-4): logo "MEVO Cockpit", nhóm
// "Vận hành & quản trị", mục đang mở tô đặc cam, thẻ tài khoản ở chân. Chỉ liệt kê trang đang có thật.
export default async function MevoLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'mevo_superadmin') redirect('/admin')
  // Email lấy lại từ lần kiểm phiên ở trên (cùng request) — không gọi getUser thêm một chặng mạng (2026-11-16).
  const user = { email: await signedInEmail() }

  return (
    <AppShell
      brand={{ title: 'MEVO Cockpit', subtitle: 'MEVO Superadmin' }}
      groups={[
        {
          label: 'Vận hành & quản trị',
          items: [
            { href: '/mevo', label: 'Tổng quan', icon: <LayoutDashboard />, exact: true },
            { href: '/mevo/stores/new', label: 'Tạo quán mới', icon: <PlusSquare /> },
            { href: '/mevo/stores', label: 'Danh sách quán', icon: <Store /> },
            { href: '/mevo/accounts', label: 'Tài khoản vận hành', icon: <Users /> },
          ],
        },
      ]}
      footer={
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden>
            <ShieldCheck className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">MEVO Superadmin</p>
            <p className="truncate text-[12px] text-slate-500">{user?.email ?? 'Quyền toàn hệ thống'}</p>
          </div>
          <SignOutButton email={user?.email} className="size-9 md:size-9" />
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">{children}</div>
      <RevisitRefresh />
    </AppShell>
  )
}
