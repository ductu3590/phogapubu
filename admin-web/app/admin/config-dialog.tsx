'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CalendarDays, ClipboardList, Gift, QrCode, Settings, Ticket, User, Users, UtensilsCrossed, X } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Hộp thoại quản trị đè lên POS — bản Stitch A01–A05 (Pha 4 ST-3, 2026-10-03).
// Mở bằng intercepting route (app/admin/@modal/(.)<trang>): bấm link trong ứng dụng thì trang cấu hình
// hiện trong hộp thoại, trang đang mở phía sau (POS) KHÔNG bị gỡ — đơn mới, chuông vẫn chạy.
// Mở thẳng URL / F5 thì ra trang đầy đủ như cũ (Next không chặn khi tải cứng).

export const CONFIG_TABS = [
  { href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays />, needsReservations: true },
  { href: '/admin/settings', label: 'Cấu hình quán', icon: <Settings /> },
  { href: '/admin/menu', label: 'Thực đơn & Giá', icon: <UtensilsCrossed /> },
  { href: '/admin/tables', label: 'Sơ đồ bàn & QR', icon: <QrCode /> },
  { href: '/admin/orders', label: 'Hoá đơn', icon: <ClipboardList /> },
  { href: '/admin/dashboard', label: 'Báo cáo', icon: <BarChart3 /> },
  { href: '/admin/staff', label: 'Nhân viên', icon: <Users /> },
  { href: '/admin/vouchers', label: 'Ưu đãi', icon: <Ticket /> },
  { href: '/admin/spin', label: 'Vòng quay', icon: <Gift /> },
  { href: '/admin/account', label: 'Tài khoản', icon: <User /> },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: ReactNode; needsReservations?: boolean }>

// Độ dài lịch sử trình duyệt lúc hộp thoại MỞ — đóng là quay về đúng trang nền dù bên trong đã bấm
// lọc (Đơn hàng đổi ngày tạo thêm mục lịch sử). Đổi tab dùng replace nên không cộng thêm.
const BASE_KEY = 'mevo_config_modal_base'

function readBase(): number | null {
  try {
    const v = window.sessionStorage.getItem(BASE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

/** Gọi khi slot @modal rỗng (hộp thoại đã đóng bằng mọi cách, kể cả nút Back). */
export function ModalBaseReset() {
  useEffect(() => {
    try { window.sessionStorage.removeItem(BASE_KEY) } catch { /* bỏ qua */ }
  }, [])
  return null
}

export default function ConfigDialog({ storeName, reservationsEnabled, children }: { storeName: string; reservationsEnabled: boolean; children: ReactNode }) {
  const pathname = usePathname()
  const panel = useRef<HTMLDivElement>(null)
  const tabs = useRef<HTMLElement>(null)
  const active = CONFIG_TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href
  const open = active !== undefined

  useEffect(() => {
    if (!open) return
    try {
      // Lịch sử lúc mở = độ dài hiện tại trừ đi mục vừa được đẩy vào khi bấm link mở hộp thoại.
      if (readBase() === null) window.sessionStorage.setItem(BASE_KEY, String(window.history.length - 1))
    } catch { /* bỏ qua */ }
  }, [open])

  const close = () => {
    const base = readBase()
    try { window.sessionStorage.removeItem(BASE_KEY) } catch { /* bỏ qua */ }
    const steps = base === null ? 1 : Math.max(1, window.history.length - base)
    window.history.go(-steps)
  }

  // Màn hẹp hàng tab cuộn ngang: đưa tab đang chọn vào giữa, không để nó khuất mép.
  useEffect(() => {
    tabs.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [active])

  // Chỉ khoá cuộn trang nền + bắt Esc khi hộp thoại đang hiện (đã ẩn vì sang trang khác thì nhả ra).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  // Bấm sang trang KHÔNG phải cấu hình (POS, Bếp…) khi hộp thoại đang mở: slot @modal giữ nội dung cũ
  // (điều hướng mềm không khớp slot) → tự ẩn. Không dùng route bắt-mọi-đường vì nó làm /admin/<sai> hết 404.
  if (!open) return <ModalBaseReset />

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/60 backdrop-blur-[2px] md:items-center md:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Quản trị & cấu hình quán"
        className="flex h-full w-full max-w-[1280px] flex-col overflow-hidden bg-white shadow-modal outline-none md:h-[min(900px,94dvh)] md:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 md:px-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600 [&>svg]:size-5" aria-hidden><Settings /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">Quản trị &amp; cấu hình quán</h2>
            <p className="truncate text-[13px] text-slate-500">{storeName} · thay đổi áp dụng ngay cho POS và Mini App</p>
          </div>
          <IconButton icon={<X />} label="Đóng (Esc)" onClick={close} className="shrink-0" />
        </header>
        <nav ref={tabs} aria-label="Mục cấu hình" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-2 [scrollbar-width:none] md:px-4 [&::-webkit-scrollbar]:hidden">
          {CONFIG_TABS.filter((t) => !('needsReservations' in t) || reservationsEnabled).map((t) => {
            const isActive = t.href === active
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors [&>svg]:size-4',
                  isActive ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-900',
                )}
              >
                {t.icon}{t.label}
              </Link>
            )
          })}
        </nav>
        <div className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50">{children}</div>
      </div>
    </div>
  )
}
