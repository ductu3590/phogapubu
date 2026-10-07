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
// mục cấu hình nằm trong ô "Thêm" và mở thành hộp thoại đè lên POS (ST-3).
// Không 'use client': layout server dựng sẵn mảng này (icon là phần tử).
//
// - Đặt bàn KHÔNG còn trên rail (2026-10-04): nhận khách / xác nhận / hoãn / huỷ đã làm ngay trên POS;
//   phần còn lại (lịch các ngày tới, đổi giờ / đổi bàn, duyệt yêu cầu đổi) mở trong hộp thoại.
// - Bếp chỉ hiện với quán dùng màn hình bếp. Quán "thu ngân xác nhận rồi in phiếu"
//   (kitchen_release_policy = pos_confirmation, mô hình Bảo Lương) không có màn bếp nào để mở.
export function adminRailItems(kitchenEnabled = true): AppNavItem[] {
  return [
    { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
    ...(kitchenEnabled ? [{ href: '/admin/kitchen', label: 'Bếp', icon: <ChefHat /> }] : []),
    { href: '/admin/menu', label: 'Món', icon: <UtensilsCrossed /> },
    { href: '/admin/orders', label: 'Đơn', icon: <ClipboardList /> },
    { href: '/admin/dashboard', label: 'Báo cáo', icon: <BarChart3 /> },
  ]
}

export function adminMoreItems(reservationsEnabled = false): AppNavItem[] {
  return [
    ...(reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []),
    { href: '/admin/tables', label: 'Bàn & QR', icon: <QrCode /> },
    { href: '/admin/staff', label: 'Nhân viên', icon: <Users /> },
    { href: '/admin/vouchers', label: 'Ưu đãi', icon: <Ticket /> },
    { href: '/admin/spin', label: 'Vòng quay', icon: <Gift /> },
    { href: '/admin/account', label: 'Tài khoản', icon: <User /> },
  ]
}

// Nút ⚙ Cài đặt (PA-1, 2026-10-07): nằm riêng ngay trên ô "Thêm" — chủ quán mở cấu hình
// thường xuyên hơn các mục trong Thêm, không bắt bấm 2 lần.
export function adminBottomItems(): AppNavItem[] {
  return [{ href: '/admin/settings', label: 'Cài đặt', icon: <Settings /> }]
}

/** Toàn bộ mục (cho dò mục đang chọn và test). */
export function adminNavGroups(reservationsEnabled = false, kitchenEnabled = true): AppNavGroup[] {
  return [
    { items: adminRailItems(kitchenEnabled) },
    { items: adminBottomItems() },
    { items: adminMoreItems(reservationsEnabled) },
  ]
}
