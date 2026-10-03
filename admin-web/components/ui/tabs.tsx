'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TabItem<T extends string> = { value: T; label: ReactNode; count?: number }

/**
 * Thanh tab, đúng một mục đang chọn.
 * - `boxed` (mặc định): trạng thái trên bảng/danh sách (Tất cả / Chờ duyệt / Đã xong).
 * - `underline`: chia nội dung khối lớn, trang cài đặt.
 * - `segmented`: 2–4 lựa chọn ngắn đổi cách xem (Timeline / Sơ đồ bàn).
 * Không xuống dòng: màn hẹp thì cuộn ngang.
 */
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  variant = 'boxed',
  label,
  className,
}: {
  items: TabItem<T>[]
  value: T
  onValueChange: (value: T) => void
  variant?: 'boxed' | 'underline' | 'segmented'
  label: string
  className?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  function focusAndSelect(index: number) {
    const item = items[(index + items.length) % items.length]
    onValueChange(item.value)
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[(index + items.length) % items.length]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((item) => item.value === value)
    if (event.key === 'ArrowRight') focusAndSelect(current + 1)
    else if (event.key === 'ArrowLeft') focusAndSelect(current - 1)
    else if (event.key === 'Home') focusAndSelect(0)
    else if (event.key === 'End') focusAndSelect(items.length - 1)
    else return
    event.preventDefault()
  }

  return (
    <div className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex w-max min-w-full',
          variant === 'boxed' && 'gap-1 py-0.5',
          variant === 'underline' && 'gap-2 shadow-[inset_0_-1px_0_var(--border)]',
          variant === 'segmented' && 'w-max min-w-0 gap-1 rounded-lg bg-secondary p-1',
        )}
      >
        {items.map((item) => {
          const isSelected = item.value === value
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-focus',
                variant === 'boxed' && 'h-9 rounded-lg px-3',
                variant === 'boxed' && (isSelected ? 'bg-secondary text-foreground' : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground'),
                variant === 'underline' &&
                  'relative h-11 rounded-md px-2 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full',
                variant === 'underline' && (isSelected ? 'text-foreground after:bg-primary' : 'text-foreground/70 hover:text-foreground'),
                variant === 'segmented' && 'h-9 rounded-md px-3',
                variant === 'segmented' &&
                  (isSelected ? 'bg-surface text-foreground shadow-[0_0_0_1px_rgb(15_23_42/0.05),0_1px_2px_rgb(15_23_42/0.08)]' : 'text-foreground/70 hover:text-foreground'),
              )}
            >
              {item.label}
              {item.count !== undefined ? <span className="text-xs font-normal tabular-nums text-foreground/70">{item.count}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
