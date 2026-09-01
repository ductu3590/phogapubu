import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { getSessionsBill } from '@/lib/actions/table-session'
import PrintBill from './print-bill'

// Trang in hoá đơn 80mm. Mở bằng window.open từ màn Bàn, in qua máy in đã cài trên PC quầy
// (print CSS, không đụng ESC/POS — quán đã có sẵn máy in nối PC).
// Tiền lấy từ RPC get_sessions_bill, KHÔNG nhận số từ client.
export default async function PrintBillPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  await requireStaffAreaOrRedirect()
  const { ids } = await searchParams
  const sessionIds = (ids ?? '').split(',').filter(Boolean)

  const res = await getSessionsBill(sessionIds)
  if (!res.ok) {
    return (
      <div className="p-6 text-sm text-red-600">
        Không lấy được hoá đơn: {res.error}
      </div>
    )
  }

  return <PrintBill bill={res.bill} />
}
