'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './button'

export type AppNavItem = {
  href: string
  label: string
  /** Icon lucide dạng phần tử, ví dụ `<LayoutGrid />`. */
  icon?: ReactNode
  /** Số việc đang chờ THẬT (đơn chờ duyệt...). Không có thì bỏ, không dựng số giả. */
  count?: number
  /** Khớp đúng href, không khớp các trang con (dùng cho mục gốc như `/admin`). */
  exact?: boolean
}

export type AppNavGroup = { label?: string; items: AppNavItem[] }

export function isNavItemActive(pathname: string, item: Pick<AppNavItem, 'href' | 'exact'>): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** Mục đang chọn là mục khớp DÀI NHẤT, để `/admin/menu` không sáng cùng lúc với `/admin`. */
export function findActiveHref(pathname: string, groups: AppNavGroup[]): string | null {
  let best: string | null = null
  for (const group of groups) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item) && (!best || item.href.length > best.length)) best = item.href
    }
  }
  return best
}

function NavList({ groups, activeHref, onNavigate }: { groups: AppNavGroup[]; activeHref: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Điều hướng chính">
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex}>
          {group.label ? <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{group.label}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const isActive = item.href === activeHref
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors',
                      // Stitch A07/A10: mục đang mở tô đặc cam, chữ trắng.
                      isActive
                        ? 'bg-brand font-semibold text-white shadow-sm'
                        : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    {item.icon ? <span className="inline-flex shrink-0 [&>svg]:size-[18px]" aria-hidden>{item.icon}</span> : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count ? (
                      <span className={cn('min-w-6 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums', isActive ? 'bg-white text-brand' : 'bg-brand text-white')}>
                        {item.count > 99 ? '99+' : item.count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Khung sidebar rộng — hiện dùng cho /mevo (bản Stitch A06–A11). /admin dùng thanh icon
 * (icon-rail-shell.tsx), /staff có header riêng.
 * - Từ `lg` (1024px): sidebar 272px bên trái, thu gọn được.
 * - Dưới `lg`: thanh trên cùng + nút menu mở ngăn kéo toàn chiều cao.
 * Vùng nội dung tự cuộn; sidebar và thanh trên đứng yên.
 */
export function AppShell({
  brand,
  groups,
  footer,
  children,
  className,
}: {
  /** Tên sản phẩm/quán ở đầu sidebar, ví dụ `{ title: 'Bia lẩu Bảo Lương', subtitle: 'MEVO · Chủ quán' }`. */
  brand: { title: string; subtitle?: string }
  groups: AppNavGroup[]
  /** Chân sidebar: tài khoản, đăng xuất. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const activeHref = findActiveHref(pathname, groups)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) return
    if (isDrawerOpen && !drawer.open) drawer.showModal()
    if (!isDrawerOpen && drawer.open) drawer.close()
  }, [isDrawerOpen])

  const brandBlock = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-base font-bold text-white shadow-sm" aria-hidden>
        M
      </span>
      <div className="min-w-0">
        <p className="truncate text-base leading-tight font-bold text-slate-900">{brand.title}</p>
        {brand.subtitle ? <p className="truncate text-[13px] text-slate-500">{brand.subtitle}</p> : null}
      </div>
    </div>
  )

  return (
    <div className={cn('flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background lg:flex-row', className)}>
      {/* Desktop sidebar */}
      {!isCollapsed ? (
        <aside className="hidden w-68 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="flex h-18 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            {brandBlock}
            <IconButton icon={<PanelLeftClose />} label="Thu gọn menu" onClick={() => setIsCollapsed(true)} className="md:size-9" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <NavList groups={groups} activeHref={activeHref} />
          </div>
          {footer ? <div className="shrink-0 bg-slate-50 px-3 py-3">{footer}</div> : null}
        </aside>
      ) : null}

      {/* Mobile / tablet top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface pr-2 pl-4 lg:hidden">
        {brandBlock}
        <IconButton icon={<Menu />} label="Mở menu" aria-expanded={isDrawerOpen} onClick={() => setIsDrawerOpen(true)} />
      </header>

      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        {isCollapsed ? (
          <IconButton
            icon={<PanelLeftOpen />}
            label="Mở menu"
            onClick={() => setIsCollapsed(false)}
            className="absolute top-3 left-3 z-20 hidden border border-border-strong bg-surface md:size-9 lg:inline-flex"
          />
        ) : null}
        {children}
      </main>

      {/* Ngăn kéo menu cho màn hẹp */}
      <dialog
        ref={drawerRef}
        aria-label="Menu"
        onCancel={(event) => {
          event.preventDefault()
          setIsDrawerOpen(false)
        }}
        onClick={(event) => {
          if (event.target === drawerRef.current) setIsDrawerOpen(false)
        }}
        className="ui-dialog m-0 h-dvh max-h-none w-[min(320px,86vw)] max-w-none flex-col border-r border-border bg-surface p-0 text-foreground shadow-modal open:flex lg:hidden"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pr-2 pl-4">
          {brandBlock}
          <IconButton icon={<X />} label="Đóng menu" onClick={() => setIsDrawerOpen(false)} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavList groups={groups} activeHref={activeHref} onNavigate={() => setIsDrawerOpen(false)} />
        </div>
        {footer ? <div className="shrink-0 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </dialog>
    </div>
  )
}
