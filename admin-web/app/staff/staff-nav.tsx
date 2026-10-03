'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, LayoutGrid, ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/staff/order', label: 'Đặt món', icon: ReceiptText },
  { href: '/staff/orders', label: 'Đang xử lý', icon: ClipboardList },
  { href: '/staff/tables', label: 'Bàn', icon: LayoutGrid },
]

export default function StaffNav() {
  const path = usePathname()
  return (
    <nav aria-label="Khu nhân viên" className="flex shrink-0 border-b border-border bg-surface">
      {tabs.map((t) => {
        const active =
          t.href === '/staff/order'
            ? path === t.href || path === '/staff'
            : path === t.href || path.startsWith(t.href + '/')
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-12 flex-1 items-center justify-center gap-1.5 text-sm font-medium transition-colors',
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full',
              active ? 'text-primary after:bg-primary' : 'text-foreground/70 active:bg-item-hover',
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
