import { LogOut } from 'lucide-react'
import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/login/actions'
import { getButtonClasses } from '@/components/ui/button-classes'
import StaffNav from './staff-nav'
import BellStyleSync from '@/components/bell-style-sync'
import ServiceCallBar from './service-call-bar'
import { listOpenServiceRequests } from '@/lib/actions/service-requests'

// Khu nhân viên đặt hộ — mobile-first. Cho store_staff và store_owner (owner vào để hỗ trợ/test).
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireStaffAreaOrRedirect()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: store }, requests] = await Promise.all([
    supabase.from('stores').select('name, bell_style').eq('id', operator.storeId).single(),
    listOpenServiceRequests(),
  ])

  return (
    // App-shell: cao đúng viewport (dvh chuẩn cho mobile), chỉ vùng nội dung cuộn — không để
    // trang tự dài ra gây scroll thừa/khoảng trống.
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-background">
      <BellStyleSync style={store?.bell_style as string | undefined} />
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-white" aria-hidden>M</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{store?.name ?? 'Quán'}</p>
            <p className="truncate text-[13px] text-muted">MEVO · Đặt hộ</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden truncate text-[13px] text-muted sm:inline">{user?.email}</span>
          <form action={signOut}>
            <button type="submit" className={getButtonClasses('ghost')}>
              <LogOut className="size-4" aria-hidden />
              Đăng xuất
            </button>
          </form>
        </div>
      </header>
      <StaffNav />
      {/* Khách bấm "Gọi nhân viên" → hiện ở mọi tab, không chỉ tab Bàn. */}
      <ServiceCallBar
        storeId={operator.storeId}
        initialRequests={requests.ok ? requests.requests : []}
        initialError={requests.ok ? null : requests.error}
      />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
