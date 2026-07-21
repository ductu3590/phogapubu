'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/staff/order', label: 'Đặt món', icon: '🧾' },
  { href: '/staff/orders', label: 'Đơn đang xử lý', icon: '📋' },
]

export default function StaffNav() {
  const path = usePathname()
  return (
    <nav className="flex flex-shrink-0 border-b border-gray-200 bg-white">
      {tabs.map((t) => {
        const active = path === t.href || (t.href === '/staff/order' && path === '/staff')
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-semibold ${
              active
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'border-b-2 border-transparent text-gray-500 active:bg-gray-50'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
