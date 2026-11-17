import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { isBackOfficeRole } from '@/lib/auth/roles'
import { loadDebtList } from '@/lib/actions/debt-reads'
import { loadSupplierList } from '@/lib/actions/supplier-reads'
import { ErrorState } from '@/components/ui/feedback'
import DebtsTabs from './debts-tabs'
import DebtsView from './debts-view'
import SuppliersView from './suppliers-view'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Công nợ: tab Khách hàng (mig 123) + tab Nhà cung cấp (mig 143–145). Dùng chung cho trang đầy đủ (page.tsx) và bản hộp
// thoại đè lên POS (@modal/(.)debts). Guard 'pos': thu ngân xem và thu nợ khách được; huỷ lần trả, thêm / sửa / ngừng
// khách và CẢ tab Nhà cung cấp chỉ chủ quán + quản lý (isBackOfficeRole) — action + RPC kiểm lại, ẩn chỉ là giao diện.
// ?tab=suppliers mở sẵn tab NCC; ?customer=<id> mở sẵn ngăn kéo khách (luôn ở tab Khách hàng).
export default async function DebtsScreen({ searchParams, inModal }: {
  searchParams: Promise<{ customer?: string; tab?: string }>
  inModal: boolean
}) {
  const operator = await requireAdminPageOrRedirect('pos')
  const canManage = isBackOfficeRole(operator.role)
  const sp = await searchParams
  const initialCustomerId = typeof sp.customer === 'string' && UUID.test(sp.customer) ? sp.customer : null
  const initialTab = sp.tab === 'suppliers' && !initialCustomerId ? 'suppliers' : 'customers'
  const [list, suppliers] = await Promise.all([
    loadDebtList(operator.storeId, false),
    canManage ? loadSupplierList(operator.storeId) : Promise.resolve(null),
  ])

  const customersPanel = list.ok ? (
    <DebtsView customers={list.customers} canManage={canManage} initialCustomerId={initialCustomerId} />
  ) : (
    <ErrorState title="Không tải được công nợ" reason={list.error} />
  )
  const suppliersPanel = suppliers === null ? null : suppliers.ok ? (
    <SuppliersView suppliers={suppliers.suppliers} />
  ) : (
    <ErrorState title="Không tải được công nợ nhà cung cấp" reason={suppliers.error} />
  )

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
        {inModal ? null : (
          <header className="mb-4">
            <h1 className="text-xl font-bold text-foreground">Công nợ</h1>
            <p className="text-sm text-muted">
              {canManage ? 'Khách ghi nợ, nợ nhà cung cấp và các lần trả nợ.' : 'Khách ghi nợ khi thu tiền bàn và các lần trả nợ.'}
            </p>
          </header>
        )}
        <DebtsTabs initialTab={initialTab} customers={customersPanel} suppliers={suppliersPanel} />
      </div>
    </div>
  )
}
