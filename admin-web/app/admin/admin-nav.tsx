import {
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Gift,
  LayoutGrid,
  QrCode,
  Settings,
  Ticket,
  User,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import type { AppNavGroup, AppNavItem } from '@/components/ui/app-shell'

// Menu khu chủ quán (Pha 4, theo bản Stitch P01): rail icon chỉ giữ mục dùng hằng ngày,
// mục cấu hình nằm trong ô "Thêm" (ST-3 sẽ gom thành hộp thoại A01–A05 đè lên POS).
// Không 'use client': layout server dựng sẵn mảng này (icon là phần tử).
export function adminRailItems(reservationsEnabled = false): AppNavItem[] {
  return [
    { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
    ...(reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []),
    { href: '/admin/kitchen', label: 'Bếp', icon: <ChefHat /> },
    { href: '/admin/menu', label: 'Món', icon: <UtensilsCrossed /> },
    { href: '/admin/orders', label: 'Đơn', icon: <ClipboardList /> },
    { href: '/admin/dashboard', label: 'Báo cáo', icon: <BarChart3 /> },
  ]
}

export function adminMoreItems(): AppNavItem[] {
  return [
    { href: '/admin/settings', label: 'Cài đặt quán', icon: <Settings /> },
    { href: '/admin/tables', label: 'Bàn & QR', icon: <QrCode /> },
    { href: '/admin/staff', label: 'Nhân viên', icon: <Users /> },
    { href: '/admin/vouchers', label: 'Ưu đãi', icon: <Ticket /> },
    { href: '/admin/spin', label: 'Vòng quay', icon: <Gift /> },
    { href: '/admin/account', label: 'Tài khoản', icon: <User /> },
  ]
}

/** Toàn bộ mục (cho dò mục đang chọn và test). */
export function adminNavGroups(reservationsEnabled = false): AppNavGroup[] {
  return [{ items: adminRailItems(reservationsEnabled) }, { items: adminMoreItems() }]
}
