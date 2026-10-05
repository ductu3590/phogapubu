import { LayoutDashboard, LogOut, Palette, ShieldCheck, Store, Users, PlusSquare } from 'lucide-react'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'
import { AppShell } from '@/components/ui/app-shell'

// Khu MEVO superadmin — sidebar rộng theo bản Stitch A07/A10 (ST-4): logo "MEVO Cockpit", nhóm
// "Vận hành & quản trị", mục đang mở tô đặc cam, thẻ tài khoản ở chân. Chỉ liệt kê trang đang có thật.
export default async function MevoLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'mevo_superadmin') redirect('/admin')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
        { label: 'Nội bộ', items: [{ href: '/mevo/ui-kit', label: 'Bộ giao diện', icon: <Palette /> }] },
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
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">{children}</div>
    </AppShell>
  )
}
