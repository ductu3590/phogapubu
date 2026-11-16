import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatPercent } from './report-format'

export type KpiTone = 'orange' | 'amber' | 'green' | 'sky' | 'red' | 'violet' | 'slate'

const TONES: Record<KpiTone, string> = {
  orange: 'bg-primary-light text-primary',
  amber: 'bg-warning-bg text-warning',
  green: 'bg-success-bg text-success',
  sky: 'bg-sky-50 text-sky-700',
  red: 'bg-critical-bg text-critical',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-secondary text-muted',
}

/** `delta` là % thay đổi so với kỳ trước (null = không có kỳ trước → ẩn chip). `inverse`: giảm mới là tốt (giảm giá, huỷ). */
export function KpiCard({ icon: Icon, tone, label, value, unit, delta, inverse = false, compareLabel, note, valueClassName = '' }: {
  icon: LucideIcon; tone: KpiTone; label: string; value: string; unit?: string
  delta?: number | null; inverse?: boolean; compareLabel?: string; note?: ReactNode; valueClassName?: string
}) {
  let chip: ReactNode = null
  if (typeof delta === 'number' && Number.isFinite(delta)) {
    const good = inverse ? delta < 0 : delta > 0
    const cls = delta === 0 ? 'bg-secondary text-muted' : good ? 'bg-success-bg text-success' : 'bg-critical-bg text-critical'
    const text = delta === 0 ? '— 0%' : `${delta > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(delta))}`
    chip = (
      <span className="flex items-center gap-1.5">
        <span className={`tabular inline-flex items-center rounded-md px-1.5 py-px text-[12.5px] font-semibold ${cls}`}>{text}</span>
        {compareLabel ? <span>{compareLabel}</span> : null}
      </span>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-surface px-4 py-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${TONES[tone]}`}><Icon className="size-[18px]" aria-hidden /></span>
        <span className="text-[13px] font-medium text-muted">{label}</span>
      </div>
      <div className={`tabular whitespace-nowrap text-[21px] font-bold leading-[1.1] tracking-tight md:text-[28px] ${valueClassName}`}>
        {value}
        {unit ? <small className="ml-px text-[15px] font-semibold text-muted">{unit}</small> : null}
      </div>
      {chip || note ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          {chip}
          {note ? <span>{note}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
