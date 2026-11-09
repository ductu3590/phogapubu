import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { isBackOfficeRole } from '@/lib/auth/roles'
import { inventoryToday, readStockLevels } from '@/lib/inventory-server'
import { ErrorState } from '@/components/ui/feedback'
import { ToastProvider } from '@/components/ui/toast'
import InventoryTabs from './inventory-tabs'

// Kho (mig 118). Dùng chung cho trang đầy đủ (page.tsx) và bản hộp thoại đè lên POS (@modal/(.)inventory).
// Guard 'pos': thu ngân vào được để XEM tồn; nút ghi chỉ hiện với chủ quán + quản lý (isBackOfficeRole) — RPC kiểm
// lại bằng is_store_back_office nên ẩn nút chỉ là giao diện, không phải khoá.
export default async function InventoryScreen({ inModal }: { inModal: boolean }) {
  const operator = await requireAdminPageOrRedirect('pos')
  const canEdit = isBackOfficeRole(operator.role)
  const [stock, today] = await Promise.all([readStockLevels(operator.storeId), inventoryToday(operator.storeId)])

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
        {/* Hộp thoại đã có tiêu đề "Kho" ở vỏ; trang đầy đủ tự có tiêu đề. */}
        {inModal ? null : (
          <header className="mb-4">
            <h1 className="text-xl font-bold text-foreground">Kho</h1>
            <p className="text-sm text-muted">
              {canEdit ? 'Tồn kho, nhập hàng, kiểm kho, xuất huỷ.' : 'Xem tồn kho hiện tại. Nhập, kiểm, huỷ do chủ quán hoặc quản lý làm.'}
            </p>
          </header>
        )}
        {stock.ok ? (
          <ToastProvider>
            <InventoryTabs canEdit={canEdit} today={today} initialStock={stock.rows} />
          </ToastProvider>
        ) : (
          <ErrorState title="Không tải được kho" reason={stock.error} />
        )}
      </div>
    </div>
  )
}
