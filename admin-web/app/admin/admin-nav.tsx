import {
  CalendarDays,
  ChefHat,
  ReceiptText,
  LayoutGrid,
  QrCode,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import type { AppNavGroup, AppNavItem } from '@/components/ui/app-shell'
import type { OperatorRole } from '@/lib/auth/roles'

// Menu khu chủ quán (Pha 4, theo bản Stitch P01): rail icon chỉ giữ mục dùng hằng ngày,
// mục cấu hình nằm trong ô "Thêm" và mở thành hộp thoại đè lên POS (ST-3).
// Không 'use client': layout server dựng sẵn mảng này (icon là phần tử).
//
// - Đặt bàn KHÔNG còn trên rail (2026-10-04): nhận khách / xác nhận / hoãn / huỷ đã làm ngay trên POS;
//   phần còn lại (lịch các ngày tới, đổi giờ / đổi bàn, duyệt yêu cầu đổi) mở trong hộp thoại.
// - Bếp chỉ hiện với quán dùng màn hình bếp. Quán "thu ngân xác nhận rồi in phiếu"
//   (kitchen_release_policy = pos_confirmation, mô hình Bảo Lương) không có màn bếp nào để mở.
export function adminRailItems(kitchenEnabled = true, role: OperatorRole = 'store_owner'): AppNavItem[] {
  // Thu ngân (PA-2): chỉ việc ở quầy — POS + Hoá đơn & Báo cáo (A04).
  if (role === 'store_cashier') {
    return [
      { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
      { href: '/admin/bills', label: 'Hoá đơn', icon: <ReceiptText /> },
    ]
  }
  return [
    { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
    ...(kitchenEnabled ? [{ href: '/admin/kitchen', label: 'Bếp', icon: <ChefHat /> }] : []),
    { href: '/admin/menu', label: 'Món', icon: <UtensilsCrossed /> },
    // A04 (2026-10-13): "Hoá đơn & Báo cáo" thay hẳn 2 mục Đơn + Báo cáo cũ.
    { href: '/admin/bills', label: 'Hoá đơn', icon: <ReceiptText /> },
  ]
}

export function adminMoreItems(reservationsEnabled = false, role: OperatorRole = 'store_owner'): AppNavItem[] {
  const booking = reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []
  // Thu ngân: Đặt bàn · Thực đơn (chỉ bật/tắt Tạm hết) · Bảo mật (tài khoản của mình).
  if (role === 'store_cashier') {
    return [
      ...booking,
      { href: '/admin/menu', label: 'Thực đơn (Tạm hết)', icon: <UtensilsCrossed /> },
      { href: '/admin/account', label: 'Bảo mật', icon: <ShieldCheck /> },
    ]
  }
  return [
    ...booking,
    { href: '/admin/tables', label: 'Bàn & QR', icon: <QrCode /> },
    { href: '/admin/staff', label: 'Nhân viên', icon: <Users /> },
    { href: '/admin/vouchers', label: 'Ưu đãi & Vòng quay', icon: <Ticket /> },
    { href: '/admin/account', label: 'Bảo mật', icon: <ShieldCheck /> },
  ]
}

// Nút ⚙ Cài đặt (PA-1, 2026-10-07): nằm riêng ngay trên ô "Thêm" — chủ quán mở cấu hình
// thường xuyên hơn các mục trong Thêm, không bắt bấm 2 lần.
export function adminBottomItems(role: OperatorRole = 'store_owner'): AppNavItem[] {
  if (role === 'store_cashier') return []
  return [{ href: '/admin/settings', label: 'Cài đặt', icon: <Settings /> }]
}

/** Toàn bộ mục (cho dò mục đang chọn và test). */
export function adminNavGroups(reservationsEnabled = false, kitchenEnabled = true, role: OperatorRole = 'store_owner'): AppNavGroup[] {
  return [
    { items: adminRailItems(kitchenEnabled, role) },
    { items: adminBottomItems(role) },
    { items: adminMoreItems(reservationsEnabled, role) },
  ]
}
