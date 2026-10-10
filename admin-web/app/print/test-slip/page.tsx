import { createClient } from '@/lib/supabase/server'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { buildTestBill } from '@/lib/print/test-bill'
import PrintBill from '@/app/staff/tables/print/print-bill'

// Phiếu in thử 80mm (PA-5), mở từ Cài đặt quán → In ấn. Chỉ chủ quán (tab Cài đặt chỉ chủ quán vào).
// Nằm ngoài /admin như /print/table-qr để không dính thanh bên/vùng cuộn khi in.
// CHỈ ĐỌC bảng stores — không tạo đơn, không mở phiên, không ghi gì.
export default async function PrintTestSlipPage() {
  const operator = await requireAdminPageOrRedirect('owner')
  const supabase = await createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('name, address, phone')
    .eq('id', operator.storeId)
    .single()

  const bill = buildTestBill(
    {
      name: (store?.name as string | null) ?? null,
      address: (store?.address as string | null) ?? null,
      phone: (store?.phone as string | null) ?? null,
    },
    new Date(),
  )
  return <PrintBill bill={bill} testMode />
}
