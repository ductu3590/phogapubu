'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NAV, SITE } from '@/lib/landing/site'
import { Logo } from './logo'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

    return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${open ? 'bg-black' : scrolled ? 'bg-black/80 backdrop-blur-md' : 'bg-transparent'}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#about" aria-label="MEVO, về đầu trang" onClick={() => setOpen(false)}>
          <Logo />
        </a>

        <nav aria-label="Mục chính" className="hidden items-center gap-8 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm font-medium text-gray-300 transition-colors hover:text-white">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="/login" className="hidden px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:text-white sm:inline-block">
            Đăng nhập
          </a>
          <a
            href={SITE.zaloUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full border border-white/5 bg-[#1F1F22] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2A2A2D] sm:inline-flex"
          >
            Dùng thử
          </a>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full text-white lg:hidden"
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Menu điện thoại: mở bằng grid-rows 0fr → 1fr, bấm link thì cuộn tới mục và tự đóng. */}
      <div
        id="landing-mobile-menu"
        className={`grid transition-[grid-template-rows] duration-300 ease-out lg:hidden ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <nav aria-label="Mục chính" className="flex flex-col gap-1 border-t border-white/5 px-6 pb-6 pt-3" inert={!open}>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg py-3 text-base font-medium text-gray-300 hover:text-white">
                {n.label}
              </a>
            ))}
            <div className="mt-3 flex gap-3">
              <a href={SITE.zaloUrl} target="_blank" rel="noopener noreferrer" className="flex-1 whitespace-nowrap rounded-full bg-white px-5 py-3 text-center text-sm font-medium text-black">
                Dùng thử
              </a>
              <a href="/login" className="flex-1 rounded-full border border-white/10 px-5 py-3 text-center text-sm font-medium text-white">
                Đăng nhập
              </a>
            </div>
          </nav>
        </div>
      </div>
    </header>
  )
}
