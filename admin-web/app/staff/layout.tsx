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
    // App-shell: cao đúng viewport (dvh chuẩn cho mobile), chỉ vùng nội dung cuộn — không để
    // trang tự dài ra gây scroll thừa/khoảng trống.
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-gray-50">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-500">MEVO · Đặt hộ</p>
          <p className="truncate text-sm font-semibold text-gray-800">{store?.name ?? 'Quán'}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span className="hidden truncate text-xs text-gray-400 sm:inline">{user?.email}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
              Đăng xuất
            </button>
          </form>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
