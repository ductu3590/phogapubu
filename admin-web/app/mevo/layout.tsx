import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'

export default async function MevoLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'mevo_superadmin') redirect('/admin')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-500">MEVO</p>
          <p className="text-sm font-semibold text-gray-800">Backend nội bộ</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link href="/mevo" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600">
            📊 Dashboard
          </Link>
          <Link href="/mevo/stores" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600">
            🏪 Danh sách quán
          </Link>
        </nav>
        <div className="border-t border-gray-100 px-3 py-4">
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 hover:bg-red-50">
              🚪 Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
