import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { isBackOfficeRole } from '@/lib/auth/roles'
import { loadCashBookCategories, loadCashBookList } from '@/lib/actions/cash-book-reads'
import { resolveReportDay } from '@/lib/actions/bills-report'
import { parseCashbookFilters } from '@/lib/cash-book'
import { ErrorState } from '@/components/ui/feedback'
import CashbookView from './cashbook-view'

export type CashbookSearchParams = Promise<{ from?: string; to?: string; kind?: string; method?: string; category?: string }>

// Sổ thu chi (mig 122). Dùng chung cho trang đầy đủ (page.tsx) và bản hộp thoại đè lên POS (@modal/(.)cashbook).
// Guard 'pos' (hợp đồng chung YG): thu ngân vào được, cash_book_list chỉ trả phiếu do họ ghi; nút ghi / huỷ / danh mục
// chỉ hiện với chủ quán + quản lý (isBackOfficeRole) — action + RPC kiểm lại, ẩn nút chỉ là giao diện.
// "Hôm nay" = ngày kinh doanh của quán (mig 111), không phải ngày lịch.
export default async function CashbookScreen({ searchParams, inModal }: { searchParams: CashbookSearchParams; inModal: boolean }) {
  const operator = await requireAdminPageOrRedirect('pos')
  const canManage = isBackOfficeRole(operator.role)
  const sp = await searchParams
  const { today } = await resolveReportDay(undefined, new Date())
  const filters = parseCashbookFilters(sp, today)
  const [list, categories] = await Promise.all([
    loadCashBookList(operator.storeId, filters),
    loadCashBookCategories(operator.storeId),
  ])

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
        {inModal ? null : (
          <header className="mb-4">
            <h1 className="text-xl font-bold text-foreground">Sổ thu chi</h1>
            <p className="text-sm text-muted">Khoản thu / chi ngoài bán hàng — tiền mặt và chuyển khoản.</p>
          </header>
        )}
        {list.ok ? (
          <CashbookView
            list={{ entries: list.entries, totals: list.totals, truncated: list.truncated }}
            categories={categories}
            filters={filters}
            today={today}
            inModal={inModal}
            canManage={canManage}
          />
        ) : (
          <ErrorState title="Không tải được sổ thu chi" reason={list.error} />
        )}
      </div>
    </div>
  )
}
