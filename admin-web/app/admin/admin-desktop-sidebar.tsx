'use client'

import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { adminDesktopSidebarClass } from './admin-responsive-layout'

export function desktopSidebarWidthClass(collapsed: boolean): string {
  return collapsed ? 'md:w-0' : 'md:w-60'
}

// Giữ trạng thái ở tab hiện tại: thao tác POS rộng hơn ngay, không tạo cấu hình mới cho quán.
export default function AdminDesktopSidebar({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      data-collapsed={collapsed}
      className={`relative hidden h-full shrink-0 transition-[width] duration-200 md:block ${desktopSidebarWidthClass(collapsed)}`}
    >
      {!collapsed && <aside className={adminDesktopSidebarClass}>{children}</aside>}
      <button
        type="button"
        aria-label={collapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        title={collapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        onClick={() => setCollapsed((current) => !current)}
        className={`absolute top-3 z-20 hidden h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 md:flex ${
          collapsed ? 'left-2' : 'right-3'
        }`}
      >
        {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}
