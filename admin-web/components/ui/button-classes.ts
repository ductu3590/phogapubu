import { cn } from '@/lib/utils'

// Tách khỏi button.tsx (client component) để trang server cũng gọi được, ví dụ cho <Link> trông như nút.
export type ButtonVariant = 'outline' | 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'default' | 'touch'

export function getButtonClasses(variant: ButtonVariant = 'outline', size: ButtonSize = 'default'): string {
  return cn(
    'relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium',
    'max-w-full text-center leading-tight [overflow-wrap:anywhere] transition-colors outline-hidden',
    'focus-visible:ring-2 focus-visible:ring-focus',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress',
    size === 'touch' ? 'min-h-12 px-5 py-2 text-base' : 'min-h-11 px-4 py-2 text-sm md:min-h-10',
    variant === 'outline' && 'border border-border-strong bg-surface text-foreground hover:bg-button-hover',
    variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary-hover',
    variant === 'secondary' && 'bg-secondary text-foreground hover:bg-secondary-hover',
    variant === 'ghost' && 'bg-transparent text-muted hover:bg-foreground/5 hover:text-foreground',
    variant === 'danger' && 'bg-danger-bg text-danger hover:bg-danger-bg-hover',
  )
}
