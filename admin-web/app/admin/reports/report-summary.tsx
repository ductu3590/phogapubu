import { Banner } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { discountGap, type SalesSummary } from '@/lib/reports/sales'
import { formatQty } from './report-format'

// Khối tóm tắt chung của 3 tab bán hàng (Theo món / danh mục / giờ). Số lấy nguyên từ server (report_sales_summary).
// Tiền món − Giảm giá phải đúng bằng Doanh thu (= A04); lệch là đơn cũ có total_amount không khớp dòng món.
export default function SalesSummaryBlock({ summary }: { summary: SalesSummary }) {
  const gap = discountGap(summary)
  return (
    <div className="space-y-3">
      {summary.openTablesCount > 0 ? (
        <p className="text-[13px] text-muted">Chưa gồm {formatQty(summary.openTablesCount)} bàn đang mở</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tiền món" value={formatVND(summary.itemsAmount)} />
        <Stat label="Giảm giá" value={formatVND(summary.discountTotal)} />
        <Stat label="Doanh thu" value={formatVND(summary.revenue)} />
        <Stat label="SL bán" value={formatQty(summary.qtySold)} note={summary.qtyGift ? `Tặng ${formatQty(summary.qtyGift)}` : undefined} />
      </div>
      {gap !== 0 ? (
        <Banner tone="warning" title={`Chênh lệch ${formatVND(gap)} do dữ liệu cũ, đối chiếu với Hoá đơn`} />
      ) : null}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3 md:p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular text-foreground md:text-2xl">{value}</p>
      {note ? <p className="mt-0.5 text-[12px] text-muted">{note}</p> : null}
    </div>
  )
}
