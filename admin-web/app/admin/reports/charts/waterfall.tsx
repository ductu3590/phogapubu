import type { WaterfallStep } from '@/lib/reports/chart-geometry'

const W = 720, H = 300, L = 12, R = 12, T = 34, B = 40

/**
 * Thác nước Doanh thu → Lãi ròng. Cột "total" đi từ trục 0 tới giá trị; cột "delta" trôi từ mức đang chạy.
 * Miền trục luôn gồm 0 nên giá trị âm vẽ xuống dưới trục, không tràn khung.
 */
export function Waterfall({ steps, formatValue }: { steps: WaterfallStep[]; formatValue: (n: number) => string }) {
  let run = 0
  const bars = steps.map((s) => {
    const from = s.kind === 'total' ? 0 : run
    const to = s.kind === 'total' ? s.value : run + s.value
    run = to
    return { ...s, from, to }
  })
  const levels = [0, ...bars.flatMap((b) => [b.from, b.to])]
  const hi = Math.max(...levels), lo = Math.min(...levels)
  const span = hi - lo || 1
  const ih = H - T - B
  const y = (v: number) => T + ((hi - v) / span) * ih
  const zeroY = y(0)
  const slot = (W - L - R) / Math.max(steps.length, 1)
  const bw = Math.min(slot * 0.6, 64)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} data-zero-y={zeroY} role="img">
      <line x1={L} x2={W - R} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" />
      {bars.map((b, i) => {
        const cx = L + slot * i + slot / 2
        const top = y(Math.max(b.from, b.to)), bottom = y(Math.min(b.from, b.to))
        const h = Math.max(bottom - top, b.value === 0 ? 0 : 1)
        const negative = b.value < 0
        const color = b.kind === 'total' ? (negative ? 'var(--critical-dot)' : 'var(--chart-1)') : negative ? 'var(--chart-6)' : 'var(--chart-3)'
        // Nhãn giá trị: trên đỉnh cột; cột âm thì dưới đáy cột (đều kẹp trong khung).
        const labelY = negative ? Math.min(bottom + 14, H - B + 12) : Math.max(top - 6, 12)
        return (
          <g key={i}>
            <rect data-step={b.label} x={cx - bw / 2} y={top} width={bw} height={h} rx="4" fill={color} />
            <text x={cx} y={labelY} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--foreground)">{formatValue(b.value)}</text>
            <text x={cx} y={H - 14} textAnchor="middle" fontSize="11" fill="var(--muted)">{b.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
