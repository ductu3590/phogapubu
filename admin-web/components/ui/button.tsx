'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getButtonClasses, type ButtonSize, type ButtonVariant } from './button-classes'

export type { ButtonSize, ButtonVariant } from './button-classes'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Mặc định `outline`. `primary` chỉ cho MỘT hành động chính của mỗi khu. */
  variant?: ButtonVariant
  /** `touch` = cao 48px cho POS / màn chạm; `default` = 44px mobile, 40px desktop. */
  size?: ButtonSize
  /** Icon lucide dạng phần tử (`icon={<Plus />}`) để trang server cũng truyền được. Nằm bên trái chữ. */
  icon?: ReactNode
  /** Đang gửi: spinner thế chỗ icon, chặn bấm bằng aria-disabled (không `disabled` để giữ focus). */
  isLoading?: boolean
  children?: ReactNode
}

function iconSlotClass(size: ButtonSize) {
  return cn('inline-flex shrink-0', size === 'touch' ? '[&>svg]:size-5' : '[&>svg]:size-4')
}

export function Button({
  variant = 'outline',
  size = 'default',
  icon,
  isLoading = false,
  className,
  children,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) {
  const spinnerSize = size === 'touch' ? 'size-5' : 'size-4'
  const hasIcon = icon !== undefined && icon !== null

  return (
    <button
      type={type}
      aria-disabled={isLoading || undefined}
      aria-busy={isLoading || undefined}
      onClick={(event) => {
        if (isLoading) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      className={cn(getButtonClasses(variant, size), className)}
      {...rest}
    >
      {hasIcon ? (
        isLoading ? (
          <LoaderCircle className={cn(spinnerSize, 'shrink-0 animate-spin motion-reduce:animate-none')} aria-hidden />
        ) : (
          <span className={iconSlotClass(size)} aria-hidden>
            {icon}
          </span>
        )
      ) : isLoading ? (
        // Nút chỉ chữ: spinner nằm giữa, chữ ẩn đi nhưng vẫn giữ bề rộng.
        <LoaderCircle className={cn(spinnerSize, 'absolute inset-0 m-auto animate-spin motion-reduce:animate-none')} aria-hidden />
      ) : null}
      <span className={cn(!hasIcon && isLoading && 'invisible')}>{children}</span>
    </button>
  )
}

/** Nút chỉ có icon: vuông, cao bằng nút chữ cạnh nó, luôn có aria-label. */
export function IconButton({
  icon,
  label,
  size = 'default',
  className,
  type = 'button',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: ReactNode
  label: string
  size?: ButtonSize
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors outline-hidden',
        'hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'touch' ? 'size-12' : 'size-11 md:size-10',
        className,
      )}
      {...rest}
    >
      <span className={iconSlotClass(size)} aria-hidden>
        {icon}
      </span>
    </button>
  )
}
