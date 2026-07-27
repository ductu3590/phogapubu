'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  Ticket,
  Gift,
  Settings,
  QrCode,
  Users,
  User,
  type LucideIcon,
} from 'lucide-react'

type Leaf = { href: string; icon: LucideIcon; label: string }
type Section = { label: string; children: Leaf[] }

// Mục nổi (luôn hiện, không thuộc nhóm)
const DASHBOARD: Leaf = { href: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' }

// 3 nhóm gom theo tần suất dùng: xem hàng ngày → sửa theo tuần → dựng một lần
const SECTIONS: Section[] = [
  {
    label: 'Vận hành',
    children: [
      { href: '/admin/orders', icon: ClipboardList, label: 'Đơn hàng' },
      { href: '/admin/kitchen', icon: ChefHat, label: 'Màn hình bếp' },
    ],
  },
  {
    label: 'Kinh doanh',
    children: [
      { href: '/admin/menu', icon: UtensilsCrossed, label: 'Quản lý menu' },
      { href: '/admin/vouchers', icon: Ticket, label: 'Ưu đãi' },
      { href: '/admin/spin', icon: Gift, label: 'Vòng quay' },
    ],
  },
  {
    label: 'Thiết lập quán',
    children: [
      { href: '/admin/settings', icon: Settings, label: 'Cài đặt quán' },
      { href: '/admin/tables', icon: QrCode, label: 'Bàn & QR' },
      { href: '/admin/staff', icon: Users, label: 'Nhân viên' },
    ],
  },
]

// Mục lẻ cuối danh sách
const ACCOUNT: Leaf = { href: '/admin/account', icon: User, label: 'Tài khoản' }

export default function AdminNav() {
  const path = usePathname()

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      <NavLink leaf={DASHBOARD} active={path.startsWith(DASHBOARD.href)} />

      {SECTIONS.map((sec) => (
        <div key={sec.label} className="pt-3">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {sec.label}
          </p>
          <div className="ml-[1.35rem] space-y-0.5 border-l border-gray-100 pl-2">
            {sec.children.map((leaf) => (
              <NavLink key={leaf.href} leaf={leaf} active={path.startsWith(leaf.href)} />
            ))}
          </div>
        </div>
      ))}

      <div className="pt-3">
        <NavLink leaf={ACCOUNT} active={path.startsWith(ACCOUNT.href)} />
      </div>
    </nav>
  )
}

function NavLink({ leaf, active }: { leaf: Leaf; active: boolean }) {
  const Icon = leaf.icon
  return (
    <Link
      href={leaf.href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/25'
          : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
      }`}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      {leaf.label}
    </Link>
  )
}
