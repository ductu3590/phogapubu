import { createClient, createAdminClient } from '@/lib/supabase/server'
import TablesClient from './tables-client'
import { generateTableQR } from '@/lib/qr'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'

export default async function TablesPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data: storeRow } = await supabase.from('stores').select('slug').eq('id', storeId).single()
  const storeSlug = storeRow?.slug ?? ''

  // zalo_mini_app_id nằm trong store_checkout_configs (không phải stores) — RLS bảng đó
  // không cho authenticated đọc (chỉ service role), nên phải dùng admin client. Chỉ chọn
  // đúng cột này, KHÔNG bao giờ select zalo_checkout_secret_key ở đây.
  const admin = createAdminClient()
  const { data: checkoutConfig } = await admin
    .from('store_checkout_configs')
    .select('zalo_mini_app_id')
    .eq('store_id', storeId)
    .single()
  const zaloAppId = checkoutConfig?.zalo_mini_app_id ?? ''

  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('store_id', storeId)

  // Sắp xếp tự nhiên A→Z: số hiểu theo giá trị nên "Bàn 2" đứng trước "Bàn 10"
  // (order theo chuỗi thô của Postgres sẽ ra 1, 10, 2, 3... — không đúng ý người dùng)
  const sortedTables = (tables ?? []).slice().sort((a, b) =>
    a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' })
  )

  // Sinh sẵn QR (data URL) phía server để hiển thị luôn trên trang, khỏi chờ client vẽ.
  // Nếu quán chưa cấu hình zalo_mini_app_id thì để trống, client hiện placeholder.
  const tablesWithQr = await Promise.all(
    sortedTables.map(async (t) => ({
      ...t,
      qrDataUrl: zaloAppId ? await generateTableQR(zaloAppId, storeSlug, t.id) : '',
    }))
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🪑 Quản lý bàn & QR</h1>
        <p className="text-sm text-gray-500">Tạo bàn, tải QR về in dán lên bàn</p>
      </div>
      <TablesClient
        tables={tablesWithQr}
        storeId={storeId}
        storeSlug={storeSlug}
        zaloAppId={zaloAppId}
      />
    </div>
  )
}
