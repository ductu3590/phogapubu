import {
  LayoutDashboard,
  Calculator,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  Ticket,
  Gift,
  CalendarDays,
  Settings,
  QrCode,
  Users,
  User,
} from 'lucide-react'
import type { AppNavGroup } from '@/components/ui/app-shell'

// Menu khu chủ quán cho AppShell. Gom theo tần suất dùng: xem hàng ngày → sửa theo tuần → dựng một lần.
// Không 'use client': layout server dựng sẵn mảng này (icon là phần tử), AppShell tự tô mục đang mở.
export function adminNavGroups(reservationsEnabled = false): AppNavGroup[] {
  return [
    { items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> }] },
    {
      label: 'Vận hành',
      items: [
        { href: '/admin/cashier', label: 'Thu ngân (POS)', icon: <Calculator /> },
        { href: '/admin/orders', label: 'Đơn hàng', icon: <ClipboardList /> },
        { href: '/admin/kitchen', label: 'Màn hình bếp', icon: <ChefHat /> },
        ...(reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []),
      ],
    },
    {
      label: 'Kinh doanh',
      items: [
        { href: '/admin/menu', label: 'Quản lý menu', icon: <UtensilsCrossed /> },
        { href: '/admin/vouchers', label: 'Ưu đãi', icon: <Ticket /> },
        { href: '/admin/spin', label: 'Vòng quay', icon: <Gift /> },
      ],
    },
    {
      label: 'Thiết lập quán',
      items: [
        { href: '/admin/settings', label: 'Cài đặt quán', icon: <Settings /> },
        { href: '/admin/tables', label: 'Bàn & QR', icon: <QrCode /> },
        { href: '/admin/staff', label: 'Nhân viên', icon: <Users /> },
      ],
    },
    { items: [{ href: '/admin/account', label: 'Tài khoản', icon: <User /> }] },
  ]
}
