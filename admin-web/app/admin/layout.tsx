import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') {
    // Superadmin lỡ vào /admin — đưa về đúng khu, không fallback vào "quán đầu tiên".
    redirect('/mevo')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let storeName = 'Quán của tôi'
  const { data } = await supabase.from('stores').select('name').eq('id', operator.storeId).single()
  if (data) storeName = data.name

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* Brand */}
        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-500">MEVO</p>
              <p className="truncate text-sm font-semibold text-gray-800">{storeName}</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <NavLink href="/admin/dashboard" icon="📊">Dashboard</NavLink>
          <NavLink href="/admin/menu" icon="🍽️">Quản lý menu</NavLink>
          <NavLink href="/admin/tables" icon="🪑">Bàn & QR</NavLink>
          <NavLink href="/admin/orders" icon="📋">Đơn hàng</NavLink>
          <NavLink href="/admin/kitchen" icon="🍳">Màn hình bếp</NavLink>
          <NavLink href="/admin/spin" icon="🎁">Vòng quay</NavLink>
          <NavLink href="/admin/settings" icon="⚙️">Cài đặt quán</NavLink>
          <NavLink href="/admin/account" icon="👤">Tài khoản</NavLink>
        </nav>

        {/* Bottom: đăng xuất */}
        <div className="border-t border-gray-100 px-3 py-4">
          <p className="mb-2 truncate px-3 text-xs text-gray-400">{user?.email}</p>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50"
            >
              🚪 Đăng xuất
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600"
    >
      <span className="text-base">{icon}</span>
      {children}
    </Link>
  )
}
