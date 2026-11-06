import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { loadOrderSlip } from '@/lib/print/load-order-slip'
import PrintOrder from './print-order'

// Hai liên cho MỘT đơn khách vừa gọi: phiếu bếp + phiếu bàn (có giá, có ô tick).
// Số liệu đọc thẳng từ DB qua phiên đăng nhập của chủ quán — RLS auth_read_orders (mig 019)
// đã khoá theo đúng quán, và KHÔNG nhận bất kỳ con số nào từ query string.
export default async function PrintOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; job?: string }>
}) {
  const operator = await requireAdminPageOrRedirect('pos')

  const { id, job } = await searchParams
  if (!id && !job) return <p className="p-6 text-sm text-red-600">Thiếu mã đơn.</p>

  const supabase = await createClient()
  const res = await loadOrderSlip(supabase, operator.storeId, job ? { preorderJobId: job } : { orderId: id as string })
  if (!res.ok) return <p className="p-6 text-sm text-red-600">{res.error}</p>

  return <PrintOrder slip={res.slip} />
}
