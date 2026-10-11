import { redirect } from 'next/navigation'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'

export default async function AdminRoot() {
  // Chủ quán và thu ngân đều vào thẳng POS (2026-10-11); Báo cáo mở từ hộp thoại cấu hình khi cần.
  await requireAdminPageOrRedirect('pos')
  redirect('/admin/pos')
}
