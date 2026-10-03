import type { Metadata } from 'next'
import UiKitClient from './ui-kit-client'

export const metadata: Metadata = { title: 'Bộ giao diện MEVO' }

// Trang xem thử design system (UI-1). Nằm dưới /mevo nên chỉ mevo_superadmin vào được (layout chặn).
export default function UiKitPage() {
  return <UiKitClient />
}
