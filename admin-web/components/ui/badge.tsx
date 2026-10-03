import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASSES, TABLE_STATE, TABLE_STATE_ORDER, type StatusTone, type TableVisualState } from './status'

/** Badge trạng thái: pill nền nhạt + chữ đậm cùng sắc + chấm hoặc icon. Không bao giờ là nút. */
export function Badge({
  tone = 'neutral',
  icon,
  withDot = false,
  className,
  children,
}: {
  tone?: StatusTone
  /** Icon lucide dạng phần tử, thay chấm màu. */
  icon?: ReactNode
  withDot?: boolean
  className?: string
  children: ReactNode
}) {
  const classes = STATUS_TONE_CLASSES[tone]
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[13px] leading-none font-medium whitespace-nowrap',
        classes.badge,
        className,
      )}
    >
      {icon ? (
        <span className="inline-flex shrink-0 [&>svg]:size-3.5" aria-hidden>{icon}</span>
      ) : withDot ? (
        <span className={cn('size-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Chấm màu đứng cạnh chữ (ô bàn, dòng danh sách). Luôn đặt cạnh nhãn, không đứng một mình. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', STATUS_TONE_CLASSES[tone].dot, className)} aria-hidden />
}

export function TableStateBadge({ state, className }: { state: TableVisualState; className?: string }) {
  const { label, tone } = TABLE_STATE[state]
  return (
    <Badge tone={tone} withDot className={className}>
      {label}
    </Badge>
  )
}

/** Chú giải màu trạng thái bàn — một dòng, đặt cạnh sơ đồ/timeline. */
export function TableStateLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted', className)} aria-label="Chú giải màu trạng thái bàn">
      {TABLE_STATE_ORDER.map((state) => (
        <li key={state} className="inline-flex items-center gap-1.5">
          <StatusDot tone={TABLE_STATE[state].tone} />
          {TABLE_STATE[state].label}
        </li>
      ))}
    </ul>
  )
}
