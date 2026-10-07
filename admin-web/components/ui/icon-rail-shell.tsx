'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ellipsis, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { findActiveHref, type AppNavItem } from './app-shell'
import { IconButton } from './button'

// Khung khu chủ quán theo bản Stitch P01 (Pha 4, 2026-10-03): thanh icon hẹp bên trái thay sidebar rộng.
// - Từ md (768px): rail 76px, mục đang chọn tô cam đặc chữ trắng như Stitch; mục ít dùng nằm trong "Thêm".
// - Dưới md: thanh trên + ngăn kéo liệt kê đủ mọi mục.

export function IconRailShell({
  brand,
  items,
  bottomItems = [],
  moreItems,
  footer,
  children,
}: {
  brand: { initial: string; title: string; subtitle?: string }
  /** Mục hằng ngày, hiện thẳng trên rail. */
  items: AppNavItem[]
  /** Mục cố định ngay trên ô "Thêm" (⚙ Cài đặt). */
  bottomItems?: AppNavItem[]
  /** Mục ít dùng (cấu hình…), trong ô "Thêm" ở chân rail. */
  moreItems: AppNavItem[]
  /** Email + nút đăng xuất — trong ô "Thêm" và ngăn kéo màn hẹp. */
  footer?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const activeHref = findActiveHref(pathname, [{ items: [...items, ...bottomItems, ...moreItems] }])
  const moreActive = moreItems.some((i) => i.href === activeHref)
  const [moreOpen, setMoreOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const drawer = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    const close = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [moreOpen])

  useEffect(() => {
    const d = drawer.current
    if (!d) return
    if (drawerOpen && !d.open) d.showModal()
    if (!drawerOpen && d.open) d.close()
  }, [drawerOpen])

  const railLink = (item: AppNavItem) => {
    const active = item.href === activeHref
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          title={item.label}
          className={cn(
            'relative flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[12px] leading-tight font-medium transition-colors [&>svg]:size-5',
            active ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          {item.icon}
          <span className="max-w-full truncate text-center">{item.label}</span>
          {item.count ? (
            <span className="absolute top-1 right-1.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[11px] leading-4 font-semibold text-white tabular">{item.count}</span>
          ) : null}
        </Link>
      </li>
    )
  }

  const listLink = (item: AppNavItem, onNavigate?: () => void) => {
    const active = item.href === activeHref
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium [&>svg]:size-4.5',
            active ? 'bg-orange-600 text-white' : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          {item.icon}
          {item.label}
        </Link>
      </li>
    )
  }

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-slate-50 md:flex-row">
      <aside className="hidden w-[76px] shrink-0 flex-col items-center border-r border-slate-200 bg-white py-3 md:flex" aria-label="Điều hướng chính">
        <Link href={items[0]?.href ?? '/'} title={brand.title} className="mb-3 grid size-11 place-items-center rounded-xl bg-orange-600 text-lg font-bold text-white shadow-sm">
          {brand.initial}
        </Link>
        <nav className="min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col items-center gap-1.5">{items.map(railLink)}</ul>
        </nav>
        {bottomItems.length > 0 && (
          <ul className="mt-2 flex flex-col items-center gap-1.5">{bottomItems.map(railLink)}</ul>
        )}
        <div ref={moreRef} className="relative mt-2">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              'flex w-16 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-[12px] font-medium [&>svg]:size-5',
              moreActive ? 'bg-orange-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Ellipsis />
            Thêm
          </button>
          {moreOpen && (
            <div role="menu" className="absolute bottom-0 left-full z-50 ml-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-modal">
              <div className="border-b border-slate-100 px-3 pt-1 pb-2">
                <p className="truncate text-sm font-semibold text-slate-900">{brand.title}</p>
                {brand.subtitle ? <p className="truncate text-[13px] text-slate-500">{brand.subtitle}</p> : null}
              </div>
              <ul className="flex flex-col gap-0.5 py-2">{moreItems.map((i) => listLink(i, () => setMoreOpen(false)))}</ul>
              {footer ? <div className="border-t border-slate-100 pt-2">{footer}</div> : null}
            </div>
          )}
        </div>
      </aside>

      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white pr-2 pl-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-600 text-sm font-bold text-white" aria-hidden>{brand.initial}</span>
          <p className="truncate text-sm font-semibold text-slate-900">{brand.title}</p>
        </div>
        <IconButton icon={<Menu />} label="Mở menu" onClick={() => setDrawerOpen(true)} />
      </header>

      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>

      <dialog
        ref={drawer}
        onCancel={(e) => { e.preventDefault(); setDrawerOpen(false) }}
        onClick={(e) => { if (e.target === drawer.current) setDrawerOpen(false) }}
        className="ui-dialog m-0 h-dvh max-h-none w-[min(320px,86vw)] max-w-none flex-col border-r border-slate-200 bg-white p-0 shadow-modal open:flex md:hidden"
        aria-label="Menu"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 pr-2 pl-4">
          <p className="truncate text-sm font-semibold">{brand.title}</p>
          <IconButton icon={<X />} label="Đóng menu" onClick={() => setDrawerOpen(false)} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-0.5">{items.map((i) => listLink(i, () => setDrawerOpen(false)))}</ul>
          <p className="mt-4 mb-1.5 px-3 text-xs font-medium tracking-wide text-slate-500 uppercase">Thiết lập</p>
          <ul className="flex flex-col gap-0.5">{[...bottomItems, ...moreItems].map((i) => listLink(i, () => setDrawerOpen(false)))}</ul>
        </div>
        {footer ? <div className="shrink-0 border-t border-slate-200 px-3 py-3">{footer}</div> : null}
      </dialog>
    </div>
  )
}
