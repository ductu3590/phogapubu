import { useId } from 'react'
import { niceCountMax, niceMax, smoothPath } from '@/lib/reports/chart-geometry'
import { tintBg } from './palette'

export type AreaSeries = { name: string; values: number[]; color: string; axis?: 'left' | 'right' }

export function AreaChart({
  labels, series, formatLeft, formatRight, width = 1040, height = 300, ariaLabel = 'Biểu đồ theo thời gian',
}: {
  labels: string[]
  series: AreaSeries[]
  formatLeft: (n: number) => string
  formatRight?: (n: number) => string
  width?: number
  height?: number
  ariaLabel?: string
}) {
  const uid = useId().replace(/:/g, '')
  const W = width, H = height
  const L = 48, R = formatRight ? 40 : 16, T = 26, B = 30
  const iw = W - L - R, ih = H - T - B
  const n = labels.length
  const x = (i: number) => (n <= 1 ? L + iw / 2 : L + (i * iw) / (n - 1))
  const maxOf = (right: boolean) =>
    // Trục phải luôn là SỐ ĐẾM → mốc nguyên (bội của 4); trục trái là tiền → mốc "đẹp".
    (right ? niceCountMax : niceMax)(Math.max(0, ...series.filter((s) => (s.axis === 'right') === right).flatMap((s) => s.values)))
  const maxL = maxOf(false)
  const maxR = formatRight ? maxOf(true) : 1
  const every = Math.max(1, Math.ceil(n / 12))

  const lines = series.map((s) => {
    const mx = s.axis === 'right' && formatRight ? maxR : maxL
    return s.values.map((v, i): [number, number] => [x(i), T + ih - (Math.max(v, 0) / mx) * ih])
  })

  // Đỉnh của series đầu; nhãn nằm trên điểm cao nhất của mọi series tại cột đó.
  const s0 = series[0]
  const pi = s0 && s0.values.length ? s0.values.indexOf(Math.max(...s0.values)) : -1
  const peak = pi >= 0 ? (() => {
    const [px, py] = lines[0][pi]
    const topY = Math.min(...lines.map((l) => l[pi]?.[1] ?? py))
    const labelY = Math.max(topY - 32, 2)
    // Kẹp nhãn trong khung [0, W] để không bị cắt ở cột đầu / cột cuối.
    const labelX = Math.min(Math.max(px - 34, 0), W - 68)
    return { px, py, topY, labelY, labelX }
  })() : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={ariaLabel}>
      {[0, 1, 2, 3, 4].map((k) => {
        const yy = T + ih - (k * ih) / 4
        return (
          <g key={k}>
            <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray={k ? '3 4' : undefined} />
            <text x={L - 8} y={yy + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{formatLeft((maxL * k) / 4)}</text>
            {formatRight ? <text x={W - R + 8} y={yy + 4} fontSize="11" fill="var(--muted)">{formatRight((maxR * k) / 4)}</text> : null}
          </g>
        )
      })}
      {labels.map((lb, i) =>
        // Nhãn cuối luôn giữ; nhãn thường nằm sát nhãn cuối (< every bước) thì bỏ để không đè nhau.
        i === n - 1 || (i % every === 0 && n - 1 - i >= every) ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{lb}</text>
        ) : null,
      )}
      {series.map((s, si) => {
        const pts = lines[si]
        if (pts.length === 0) return null
        const id = `${uid}g${si}`
        const d = smoothPath(pts)
        return (
          <g key={si}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={si === 0 ? 0.22 : 0.16} />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${d} L${pts[pts.length - 1][0]},${T + ih} L${pts[0][0]},${T + ih} Z`} fill={`url(#${id})`} />
            <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )
      })}
      {peak && s0 ? (
        <g>
          <line x1={peak.px} x2={peak.px} y1={peak.topY} y2={T + ih} stroke="var(--neutral-dot)" strokeDasharray="3 3" />
          <circle cx={peak.px} cy={peak.py} r="5" fill="#fff" stroke={s0.color} strokeWidth="2.5" />
          {/* Nhãn nền nhạt + viền màu + chữ đậm (chữ trắng trên nền xanh lá chỉ ~2,5:1). */}
          <rect x={peak.labelX} y={peak.labelY} width="68" height="22" rx="6" stroke={s0.color} strokeWidth="1.5" style={{ fill: tintBg(s0.color) }} />
          <text x={peak.labelX + 34} y={peak.labelY + 15} textAnchor="middle" fontSize="11.5" fontWeight="700" style={{ fill: 'var(--foreground)' }}>{formatLeft(s0.values[pi])}</text>
          {series.slice(1).map((s, k) => {
            const [qx, qy] = lines[k + 1][pi] ?? [peak.px, peak.py]
            const fmt = s.axis === 'right' && formatRight ? formatRight : formatLeft
            const bx = Math.min(Math.max(qx + 10, 0), W - 36)
            return (
              <g key={k}>
                <circle cx={qx} cy={qy} r="4.5" fill="#fff" stroke={s.color} strokeWidth="2.5" />
                <rect x={bx} y={qy - 10} width="36" height="20" rx="6" stroke={s.color} strokeWidth="1.5" style={{ fill: tintBg(s.color) }} />
                <text x={bx + 18} y={qy + 4} textAnchor="middle" fontSize="11" fontWeight="700" style={{ fill: 'var(--foreground)' }}>{fmt(s.values[pi])}</text>
              </g>
            )
          })}
        </g>
      ) : null}
    </svg>
  )
}
