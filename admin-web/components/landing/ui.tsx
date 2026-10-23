import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'

// Mọi link ra ngoài (Zalo) mở tab mới.
type BtnProps = { href: string; children: ReactNode; variant?: 'primary' | 'outline' | 'ghost'; external?: boolean; className?: string }

const BTN_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const BTN_VARIANT = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  outline: 'border border-border-strong bg-surface text-foreground hover:bg-button-hover',
  ghost: 'text-primary hover:bg-primary-light',
} as const

export function Button({ href, children, variant = 'primary', external, className = '' }: BtnProps) {
  return (
    <a
      href={href}
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${className}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}

export function Section({
  id, eyebrow, title, intro, tone = 'white', children,
}: { id: string; eyebrow: string; title: string; intro?: string; tone?: 'white' | 'soft'; children: ReactNode }) {
  return (
    <section id={id} className={tone === 'soft' ? 'bg-background' : 'bg-surface'}>
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-2xl font-bold leading-tight text-foreground sm:text-3xl">{title}</h2>
        {intro ? <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">{intro}</p> : null}
        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </section>
  )
}

// Khung chờ ảnh chụp màn hình thật: nhìn là biết chưa có ảnh, không giả làm ảnh thật.
export function ShotPlaceholder({ label, ratio = 'aspect-[4/3]' }: { label: string; ratio?: string }) {
  return (
    <div
      role="img"
      aria-label={`Khung chờ ảnh chụp màn hình: ${label}`}
      className={`${ratio} flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-background px-4 text-center`}
    >
      <ImageIcon aria-hidden className="size-7 text-neutral-dot" />
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="text-xs text-neutral-dot">Ảnh chụp màn hình sẽ bổ sung</p>
    </div>
  )
}
