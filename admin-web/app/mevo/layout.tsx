import { LayoutDashboard, LogOut, Palette, Store, Users } from 'lucide-react'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'
import { AppShell } from '@/components/ui/app-shell'
import { getButtonClasses } from '@/components/ui/button-classes'
import { cn } from '@/lib/utils'

// Khu MEVO superadmin. CÙNG khung AppShell với /admin để hai khu có một kiểu điều hướng
// (bản vẽ A06–A11 từng có ba kiểu sidebar khác nhau cho cùng /mevo).
export default async function MevoLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'mevo_superadmin') redirect('/admin')

  return (
    <AppShell
      brand={{ title: 'MEVO', subtitle: 'Quản trị nền tảng' }}
      groups={[
        {
          items: [
            { href: '/mevo', label: 'Tổng quan', icon: <LayoutDashboard />, exact: true },
            { href: '/mevo/stores', label: 'Danh sách quán', icon: <Store /> },
            { href: '/mevo/accounts', label: 'Tài khoản', icon: <Users /> },
          ],
        },
        { label: 'Nội bộ', items: [{ href: '/mevo/ui-kit', label: 'Bộ giao diện', icon: <Palette /> }] },
      ]}
      footer={
        <form action={signOut}>
          <button type="submit" className={cn(getButtonClasses('ghost'), 'w-full justify-start px-3')}>
            <LogOut className="size-4" aria-hidden />
            Đăng xuất
          </button>
        </form>
      }
    >
      <div className="flex h-full min-h-0 flex-col">{children}</div>
    </AppShell>
  )
}
