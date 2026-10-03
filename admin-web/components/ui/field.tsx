import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ô nhập: luôn nền trắng (không trong suốt), viền --border-strong, focus = viền màu nhấn + quầng mờ.
// 44px trên mobile (vừa ngón tay, chữ 16px để iOS không tự phóng to), 40px từ md.
const controlBase =
  'w-full rounded-lg border bg-surface text-base text-foreground outline-hidden transition-colors placeholder:text-muted md:text-sm ' +
  'disabled:cursor-not-allowed disabled:bg-background disabled:text-muted'

function stateClasses(invalid?: boolean) {
  return invalid
    ? 'border-error focus:ring-2 focus:ring-error-ring'
    : 'border-border-strong focus:border-focus focus:ring-2 focus:ring-focus'
}

export function Input({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(controlBase, 'h-11 px-3.5 md:h-10', stateClasses(invalid), className)} {...rest} />
}

export function Textarea({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn(controlBase, 'min-h-24 px-3.5 py-2.5', stateClasses(invalid), className)} {...rest} />
}

/** Select gốc đã tô: hợp mobile (bung bánh xe chọn của máy). Danh sách dài cần tìm thì dựng combobox riêng. */
export function Select({ invalid, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(controlBase, 'h-11 cursor-pointer appearance-none pr-10 pl-3.5 md:h-10', stateClasses(invalid), className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  )
}

/** Nhãn trên ô + gợi ý / câu lỗi dưới ô. Dòng dưới luôn giữ chỗ để lỗi hiện ra không làm form nhảy. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block w-fit cursor-pointer text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-error-text" aria-hidden>*</span> : null}
      </label>
      {children}
      <p id={`${htmlFor}-message`} className={cn('min-h-4 text-xs', error ? 'text-error-text' : 'text-muted')}>
        {error ?? hint}
      </p>
    </div>
  )
}
