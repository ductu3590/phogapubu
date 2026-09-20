'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { signOut } from '@/app/(auth)/login/actions'
import AdminNav from './admin-nav'

export default function AdminMobileNav({
  storeName,
  reservationsEnabled,
  userEmail,
}: {
  storeName: string
  reservationsEnabled: boolean
  userEmail: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="shrink-0 md:hidden">
      <header className="flex min-h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-orange-500">MEVO</p>
          <p className="truncate text-sm font-semibold text-gray-800">{storeName}</p>
        </div>
        <button
          type="button"
          aria-label="Mở menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex bg-black/35" role="dialog" aria-modal="true" aria-label="Menu quản trị">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setOpen(false)}
            className="min-w-0 flex-1"
          />
          <aside className="flex h-full w-[min(18rem,85vw)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-500">MEVO</p>
                <p className="truncate text-sm font-semibold text-gray-800">{storeName}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setOpen(false)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div onClick={() => setOpen(false)} className="min-h-0 flex-1 overflow-y-auto">
              <AdminNav reservationsEnabled={reservationsEnabled} />
            </div>
            <div className="border-t border-gray-100 px-3 py-4">
              {userEmail && <p className="mb-2 truncate px-3 text-xs text-gray-400">{userEmail}</p>}
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                >
                  🚪 Đăng xuất
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
