import { redirect } from 'next/navigation'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'

export default async function AdminRoot() {
  // Thu ngân (PA-2) vào thẳng POS; chủ quán giữ trang mặc định cũ.
  const operator = await requireAdminPageOrRedirect('pos')
  redirect(operator.role === 'store_cashier' ? '/admin/pos' : '/admin/dashboard')
}
