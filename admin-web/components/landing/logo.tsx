// Logo tạm của MEVO: nét mảnh, hình học (ô vuông bo góc + chữ M một nét). Thay khi có logo chính thức.
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect x="2.5" y="2.5" width="27" height="27" rx="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9.5 21.5v-11l6.5 6.5 6.5-6.5v11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="23" r="1.25" fill="#F97316" />
    </svg>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-white ${className}`}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">MEVO</span>
    </span>
  )
}
