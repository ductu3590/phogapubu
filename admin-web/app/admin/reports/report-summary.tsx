import { Package, Receipt, Tag, Utensils } from 'lucide-react'
import { Banner } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { deltaPercent } from '@/lib/reports/compare'
import { discountGap, percentOf, type SalesSummary } from '@/lib/reports/sales'
import { KpiCard } from './kpi-card'
import { formatPercent, formatQty } from './report-format'

// Khối tóm tắt chung của 3 tab bán hàng (Theo món / danh mục / giờ). Số lấy nguyên từ server (report_sales_summary).
// Tiền món − Giảm giá phải đúng bằng Doanh thu (= A04); lệch là đơn cũ có total_amount không khớp dòng món.
// `prev` = tóm tắt kỳ trước cùng tab (null / thiếu → không hiện chip so sánh).
export default function SalesSummaryBlock({ summary, prev, compareLabel }: {
  summary: SalesSummary; prev?: SalesSummary | null; compareLabel?: string
}) {
  const gap = discountGap(summary)
  const d = (cur: number, p: number | undefined) => deltaPercent(cur, p)
  return (
    <div className="space-y-3">
      {summary.openTablesCount > 0 ? (
        <p className="text-[13px] text-muted">Chưa gồm {formatQty(summary.openTablesCount)} bàn đang mở</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={Receipt} tone="orange" label="Doanh thu" value={formatVND(summary.revenue)}
          delta={d(summary.revenue, prev?.revenue)} compareLabel={compareLabel} />
        <KpiCard icon={Utensils} tone="amber" label="Tiền món" value={formatVND(summary.itemsAmount)}
          delta={d(summary.itemsAmount, prev?.itemsAmount)} compareLabel={compareLabel} />
        <KpiCard icon={Tag} tone="violet" label="Giảm giá" value={formatVND(summary.discountTotal)} inverse
          delta={d(summary.discountTotal, prev?.discountTotal)} compareLabel={compareLabel}
          note={`${formatPercent(percentOf(summary.discountTotal, summary.itemsAmount))} tiền món`} />
        <KpiCard icon={Package} tone="green" label="SL bán" value={formatQty(summary.qtySold)}
          delta={d(summary.qtySold, prev?.qtySold)} compareLabel={compareLabel}
          note={summary.qtyGift ? `Tặng ${formatQty(summary.qtyGift)}` : undefined} />
      </div>
      {gap !== 0 ? (
        <Banner tone="warning" title={`Chênh lệch ${formatVND(gap)} do dữ liệu cũ, đối chiếu với Hoá đơn`} />
      ) : null}
    </div>
  )
}
