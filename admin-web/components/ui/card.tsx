import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Card: nền trắng, viền mảnh, bo 12px, KHÔNG bóng (bóng chỉ cho lớp nổi).
 * `flush`: thân là danh sách dòng có nền rê → card không padding ngang, dòng tự lo.
 */
export function Card({
  title,
  description,
  action,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  flush?: boolean
  className?: string
  children?: ReactNode
}) {
  const hasHeader = Boolean(title || action)

  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface', flush ? 'py-4' : 'p-4 md:p-5', className)}>
      {hasHeader ? (
        <header className={cn('flex items-start justify-between gap-3', flush ? 'px-4 md:px-5' : 'mb-4', flush && 'mb-2')}>
          <div className={cn('min-w-0', action && 'flex min-h-10 flex-col justify-center')}>
            {title ? <h2 className="text-base font-semibold text-balance text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {action ? <div className="flex min-h-10 shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1', flush && 'px-1 md:px-2')}>{children}</div>
    </section>
  )
}

/** Đầu trang: tiêu đề + mô tả bên trái, nhóm nút bên phải. Màn hẹp thì nút xuống dưới. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-balance text-foreground md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-pretty text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
    </div>
  )
}
