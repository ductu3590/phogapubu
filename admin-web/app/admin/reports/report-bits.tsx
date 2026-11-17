import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatPercent } from './report-format'

// Mảnh giao diện nhỏ dùng chung cho 8 tab báo cáo — một chỗ để các tab trông giống nhau.

/**
 * Chip % so với kỳ trước. null / không hữu hạn → không hiện gì. `inverse`: giảm mới là tốt (giảm giá, huỷ, chi phí, nợ).
 * Mũi tên luôn theo chiều số thật; chỉ màu đổi theo tốt / xấu.
 */
export function DeltaChip({ delta, inverse = false, label }: { delta: number | null | undefined; inverse?: boolean; label?: string }) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null
  const good = inverse ? delta < 0 : delta > 0
  const cls = delta === 0 ? 'bg-secondary text-muted' : good ? 'bg-success-bg text-success' : 'bg-critical-bg text-critical'
  const text = delta === 0 ? '— 0%' : `${delta > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(delta))}`
  return (
    <>
      <span data-delta className={`tabular inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-px text-[12.5px] font-semibold ${cls}`}>{text}</span>
      {label ? <span className="whitespace-nowrap text-xs">{label}</span> : null}
    </>
  )
}

/** Một ô trong dải tóm tắt nền cam nhạt dưới biểu đồ (giờ cao điểm, ngày cao nhất…). Giá trị được xuống dòng, không cắt. */
export function StripCell({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3.5 py-3">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="tabular text-[14.5px] font-bold">{children}</div>
      </div>
    </div>
  )
}

/** Chú giải một dòng: chấm màu + tên (cho biểu đồ đường / thanh xếp chồng). */
export function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  )
}

/** Nhãn nổi bật cạnh một dòng ("Cao nhất", "Cao điểm") — cùng kiểu ở bảng desktop và thẻ điện thoại. */
export function HighlightTag({ children }: { children: ReactNode }) {
  return <span data-highlight className="ml-2 whitespace-nowrap rounded-md bg-primary-light px-1.5 py-px text-[12px] font-semibold text-primary">{children}</span>
}
