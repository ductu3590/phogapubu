import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Nút bật/tắt dạng công tắc. Bên dưới vẫn là <input type="checkbox"> thật (ẩn) nên giữ nguyên
// name/checked/disabled cho form, bàn phím (Space) và trình đọc màn hình (role="switch").
// Đặt trong <label> để bấm cả dòng chữ cũng bật/tắt được.
export function Switch({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  return (
    <span className={cn('relative inline-flex h-6 w-11 flex-shrink-0', className)}>
      <input type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
      />
    </span>
  )
}
