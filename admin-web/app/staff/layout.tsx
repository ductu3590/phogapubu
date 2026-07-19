import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/login/actions'

// Khu nhân viên đặt hộ — mobile-first. Cho store_staff và store_owner (owner vào để hỗ trợ/test).
// UI đặt món thật hoàn thiện ở SA-3; SA-2 chỉ dựng auth + khung.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireStaffAreaOrRedirect()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: store } = await supabase.from('stores').select('name').eq('id', operator.storeId).single()

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-500">MEVO · Đặt hộ</p>
          <p className="truncate text-sm font-semibold text-gray-800">{store?.name ?? 'Quán'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden truncate text-xs text-gray-400 sm:inline">{user?.email}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
              Đăng xuất
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
