/** Thanh tỉ trọng 0..1 (kẹp). */
export function ShareBar({ ratio, color = 'var(--chart-1)', className = '' }: { ratio: number; color?: string; className?: string }) {
  const r = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0
  return (
    <span className={`block h-1.5 overflow-hidden rounded-full bg-secondary ${className}`}>
      <i className="block h-full rounded-full" style={{ width: `${r * 100}%`, background: color }} />
    </span>
  )
}
