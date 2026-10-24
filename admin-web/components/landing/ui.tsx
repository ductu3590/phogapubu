import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'

type BtnProps = { href: string; children: ReactNode; external?: boolean; className?: string }

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

function linkProps(external?: boolean) {
  return external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}

export function PrimaryButton({ href, children, external, className = '' }: BtnProps) {
  return (
    <a href={href} className={`${BASE} bg-white text-black hover:bg-gray-200 ${className}`} {...linkProps(external)}>
      {children}
    </a>
  )
}

export function SecondaryButton({ href, children, external, className = '' }: BtnProps) {
  return (
    <a href={href} className={`${BASE} border border-white/5 bg-[#1F1F22] text-white hover:bg-[#2A2A2D] ${className}`} {...linkProps(external)}>
      {children}
    </a>
  )
}

const BADGE_TONE = {
  neutral: 'text-gray-300',
  amber: 'text-amber-300',
  emerald: 'text-emerald-300',
  orange: 'text-orange-300',
} as const

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof BADGE_TONE }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium backdrop-blur-sm ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  )
}

// Phần chữ in nghiêng có chân, dùng để nhấn một cụm trong tiêu đề.
export function Em({ children }: { children: ReactNode }) {
  return <span className="font-[family-name:var(--font-landing-serif)] font-normal italic">{children}</span>
}

export function SectionHeading({ eyebrow, title, intro, center }: { eyebrow?: ReactNode; title: ReactNode; intro?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? <div className="mb-5">{eyebrow}</div> : null}
      <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white md:text-5xl">{title}</h2>
      {intro ? <p className="mt-5 text-[16px] leading-relaxed text-gray-400">{intro}</p> : null}
    </div>
  )
}

// Khung chờ ảnh chụp màn hình thật: nhìn là biết chưa có ảnh, không giả làm ảnh thật.
export function ShotPlaceholder({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={`Khung chờ ảnh chụp màn hình: ${label}`}
      className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.10),transparent_60%)] px-4 text-center"
    >
      <ImageIcon aria-hidden className="size-6 text-gray-400" />
      <p className="text-sm font-medium text-gray-300">{label}</p>
      <p className="text-xs text-gray-400">Ảnh chụp màn hình sẽ bổ sung</p>
    </div>
  )
}
