import type { ReactNode } from 'react'
import { CircleAlert, Info, LoaderCircle, RotateCw, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton } from './button'

// ===== Đang tải =====

/** Vệt chờ. Mượn đúng khuôn của nội dung thật để lúc dữ liệu về trang không nhảy. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-full bg-foreground/[0.06] motion-reduce:animate-none', className)} aria-hidden />
}

const ROW_WIDTHS = ['w-2/5', 'w-1/2', 'w-1/3', 'w-3/5', 'w-1/4']

/** Khung chờ cho danh sách dòng (đơn, bàn, món). `label` đọc cho trình đọc màn hình. */
export function SkeletonList({ rows = 5, label = 'Đang tải', withAvatar = false }: { rows?: number; label?: string; withAvatar?: boolean }) {
  return (
    <div aria-busy="true">
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-3.5">
            {withAvatar ? <Skeleton className="size-9 shrink-0" /> : null}
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn('h-3', ROW_WIDTHS[index % ROW_WIDTHS.length])} />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-3 w-16" />
          </li>
        ))}
      </ul>
      <span className="sr-only" role="status">{label}</span>
    </div>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role={label ? 'status' : undefined}>
      <LoaderCircle className={cn('size-4 animate-spin motion-reduce:animate-none', className)} aria-hidden />
      {label}
    </span>
  )
}

// ===== Rỗng & lỗi tải =====

/**
 * Rỗng: MỘT dòng chữ mờ nói đúng bối cảnh ("Chưa có yêu cầu chờ xử lý").
 * Rỗng do lọc/tìm thì truyền `action` (link chữ "Xoá lọc") làm lối ra.
 */
export function EmptyState({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <p className={cn('px-4 py-8 text-center text-sm text-pretty text-muted', className)}>
      {children}
      {action ? <> {action}</> : null}
    </p>
  )
}

/** Lỗi tải: hai tầng (chuyện gì hỏng · vì sao) + nút Thử lại. Cùng chiều cao với EmptyState. */
export function ErrorState({
  title,
  reason,
  onRetry,
  isRetrying,
  className,
}: {
  title: ReactNode
  reason?: ReactNode
  onRetry?: () => void
  isRetrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}>
      <div>
        <p className="text-sm font-medium text-error-text">{title}</p>
        {reason ? <p className="mt-1 text-sm text-muted">{reason}</p> : null}
      </div>
      {onRetry ? (
        <Button icon={<RotateCw />} onClick={onRetry} isLoading={isRetrying}>
          Thử lại
        </Button>
      ) : null}
    </div>
  )
}

// ===== Banner: tình trạng còn kéo dài (mất kết nối, cần chú ý). Không nổi, không tự tắt. =====

export type BannerTone = 'info' | 'warning' | 'error'

const BANNER_TONES: Record<BannerTone, { box: string; icon: typeof Info; iconClass: string; title: string }> = {
  info: { box: 'border-border bg-background', icon: Info, iconClass: 'text-muted', title: 'text-foreground' },
  warning: { box: 'border-warning-border bg-warning-bg', icon: TriangleAlert, iconClass: 'text-warning', title: 'text-warning' },
  error: { box: 'border-critical-border bg-critical-bg', icon: CircleAlert, iconClass: 'text-critical', title: 'text-critical' },
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  onClose,
  className,
}: {
  tone?: BannerTone
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  /** Banner lỗi không có nút đóng: đứng đó tới khi xử lý xong. */
  onClose?: () => void
  className?: string
}) {
  const config = BANNER_TONES[tone]
  const Icon = config.icon
  const canClose = Boolean(onClose) && tone !== 'error'

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4', config.box, className)}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', config.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', config.title)}>{title}</p>
        {children ? <div className="mt-0.5 text-sm text-pretty text-foreground/80">{children}</div> : null}
      </div>
      {action || canClose ? (
        <div className="flex shrink-0 items-center gap-1 self-center">
          {action}
          {canClose ? <IconButton icon={<X />} label="Đóng thông báo" onClick={onClose} className="size-9 md:size-9" /> : null}
        </div>
      ) : null}
    </div>
  )
}
