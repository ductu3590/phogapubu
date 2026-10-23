import { NAV, SITE } from '@/lib/landing/site'
import { Button } from './ui'

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="text-xl font-bold tracking-tight text-foreground" aria-label="MEVO, về đầu trang">
          <span className="text-brand">ME</span>VO
        </a>
        <nav aria-label="Mục chính" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-item-hover hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-item-hover hover:text-foreground sm:inline-block">
            Đăng nhập quản lý
          </a>
          <Button href={SITE.zaloUrl} external className="min-h-10 px-4 text-sm">Nhắn Zalo</Button>
        </div>
      </div>
      {/* Điện thoại: dải chip cuộn ngang thay menu hamburger (không cần JavaScript). */}
      <nav aria-label="Mục chính" className="border-t border-border md:hidden">
        <ul className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {NAV.map((n) => (
            <li key={n.href} className="shrink-0">
              <a href={n.href} className="inline-flex min-h-9 items-center rounded-full bg-secondary px-3.5 text-sm font-medium text-foreground">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
