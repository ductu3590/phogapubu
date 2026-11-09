import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { isBackOfficeRole } from '@/lib/auth/roles'
import { loadDebtList } from '@/lib/actions/debt-reads'
import { ErrorState } from '@/components/ui/feedback'
import DebtsView from './debts-view'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Công nợ khách hàng (mig 123). Dùng chung cho trang đầy đủ (page.tsx) và bản hộp thoại đè lên POS (@modal/(.)debts).
// Guard 'pos': thu ngân xem và thu nợ được; huỷ lần trả, thêm / sửa / ngừng khách chỉ chủ quán + quản lý (isBackOfficeRole)
// — action + RPC kiểm lại, ẩn nút chỉ là giao diện. Tải cả khách đã hết nợ / đã ngừng: lọc ở trang (công tắc).
export default async function DebtsScreen({ searchParams, inModal }: {
  searchParams: Promise<{ customer?: string }>
  inModal: boolean
}) {
  const operator = await requireAdminPageOrRedirect('pos')
  const canManage = isBackOfficeRole(operator.role)
  const sp = await searchParams
  const initialCustomerId = typeof sp.customer === 'string' && UUID.test(sp.customer) ? sp.customer : null
  const list = await loadDebtList(operator.storeId, false)

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
        {inModal ? null : (
          <header className="mb-4">
            <h1 className="text-xl font-bold text-foreground">Công nợ</h1>
            <p className="text-sm text-muted">Khách ghi nợ khi thu tiền bàn và các lần trả nợ.</p>
          </header>
        )}
        {list.ok ? (
          <DebtsView customers={list.customers} canManage={canManage} initialCustomerId={initialCustomerId} />
        ) : (
          <ErrorState title="Không tải được công nợ" reason={list.error} />
        )}
      </div>
    </div>
  )
}
