import {
  CalendarDays,
  ChartColumn,
  ChefHat,
  HandCoins,
  ReceiptText,
  LayoutGrid,
  Package,
  Settings,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import type { AppNavGroup, AppNavItem } from '@/components/ui/app-shell'
import type { OperatorRole } from '@/lib/auth/roles'

// Menu khu chủ quán: MỘT thanh icon dọc (2026-10-13 — bỏ ô "Thêm"). Nhãn chỉ 1–2 chữ cho vừa rail 76px.
// Mục quản lý hằng ngày nằm thẳng trên rail; Sơ đồ bàn & QR · Nhân viên · Ưu đãi · Bảo mật gom vào ⚙ Cài đặt
// (tab trong hộp thoại, xem settingsTabs ở config-dialog.tsx). Mục vẫn mở thành hộp thoại đè lên POS (ST-3),
// hộp thoại chừa rail ra để bấm chuyển mục — TRỪ Báo cáo: đứng cuối rail và mở thành trang riêng (anh Tú
// 2026-11-16: bảng báo cáo rộng, xem lâu, không cần hộp thoại đè lên POS).
// Không 'use client': layout server dựng sẵn mảng này (icon là phần tử).
//
// - Bếp chỉ hiện với quán dùng màn hình bếp. Quán "thu ngân xác nhận rồi in phiếu"
//   (kitchen_release_policy = pos_confirmation, mô hình Bảo Lương) không có màn bếp nào để mở.
// - Đặt bàn chỉ hiện khi quán bật đặt bàn.
export function adminRailItems(kitchenEnabled = true, reservationsEnabled = false, role: OperatorRole = 'store_owner'): AppNavItem[] {
  // Quản lý (QL, mig 116): POS · Đặt bàn · Món (chỉ bật/tắt Tạm hết) · Hoá đơn · Công nợ · Thu chi · Kho · Báo cáo; không Bếp, không Bàn QR.
  // Module KHO / CA / NO / BC thêm mục của mình vào nhánh này VÀ nhánh chủ quán bên dưới.
  if (role === 'store_manager') {
    return [
      { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
      ...(reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []),
      { href: '/admin/menu', label: 'Món', icon: <UtensilsCrossed /> },
      { href: '/admin/bills', label: 'Hoá đơn', icon: <ReceiptText /> },
      { href: '/admin/debts', label: 'Công nợ', icon: <HandCoins /> },
      { href: '/admin/cashbook', label: 'Thu chi', icon: <Wallet /> },
      { href: '/admin/inventory', label: 'Kho', icon: <Package /> },
      { href: '/admin/reports', label: 'Báo cáo', icon: <ChartColumn /> },
    ]
  }
  // Thu ngân (PA-2): POS · Món (chỉ bật/tắt Tạm hết) · Hoá đơn · Công nợ · Thu chi (chỉ phiếu của mình, không
  // ghi / huỷ ở trang) · Kho (chỉ xem tồn) · Báo cáo (4 tab bán hàng); Cài đặt ở chân rail.
  if (role === 'store_cashier') {
    return [
      { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
      { href: '/admin/menu', label: 'Món', icon: <UtensilsCrossed /> },
      { href: '/admin/bills', label: 'Hoá đơn', icon: <ReceiptText /> },
      { href: '/admin/debts', label: 'Công nợ', icon: <HandCoins /> },
      { href: '/admin/cashbook', label: 'Thu chi', icon: <Wallet /> },
      { href: '/admin/inventory', label: 'Kho', icon: <Package /> },
      { href: '/admin/reports', label: 'Báo cáo', icon: <ChartColumn /> },
    ]
  }
  return [
    { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
    ...(kitchenEnabled ? [{ href: '/admin/kitchen', label: 'Bếp', icon: <ChefHat /> }] : []),
    ...(reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []),
    { href: '/admin/menu', label: 'Món', icon: <UtensilsCrossed /> },
    { href: '/admin/bills', label: 'Hoá đơn', icon: <ReceiptText /> },
    { href: '/admin/debts', label: 'Công nợ', icon: <HandCoins /> },
    { href: '/admin/cashbook', label: 'Thu chi', icon: <Wallet /> },
    { href: '/admin/inventory', label: 'Kho', icon: <Package /> },
    { href: '/admin/reports', label: 'Báo cáo', icon: <ChartColumn /> },
  ]
}

// Nút ⚙ Cài đặt ở chân rail, ngay trên Đăng xuất.
// - Chủ quán: Cài đặt chung · Sơ đồ bàn & QR · Nhân viên · Ưu đãi · Bảo mật (tab trong hộp thoại) → sáng ở cả 5 trang.
// - Thu ngân, quản lý: không sửa được cài đặt quán → ⚙ là cấu hình tài khoản của chính mình (Bảo mật).
export function adminBottomItems(role: OperatorRole = 'store_owner'): AppNavItem[] {
  if (role !== 'store_owner') return [{ href: '/admin/account', label: 'Cài đặt', icon: <Settings /> }]
  return [{ href: '/admin/settings', label: 'Cài đặt', icon: <Settings />, alsoActive: ['/admin/tables', '/admin/staff', '/admin/vouchers', '/admin/account'] }]
}

/** Toàn bộ mục (cho dò mục đang chọn và test). */
export function adminNavGroups(reservationsEnabled = false, kitchenEnabled = true, role: OperatorRole = 'store_owner'): AppNavGroup[] {
  return [
    { items: adminRailItems(kitchenEnabled, reservationsEnabled, role) },
    { items: adminBottomItems(role) },
  ]
}
