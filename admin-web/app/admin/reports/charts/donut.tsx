import { donutArcs } from '@/lib/reports/chart-geometry'

export type DonutSlice = { label: string; value: number; color: string }

const R = 70
const C = 2 * Math.PI * R

export function Donut({ slices, center, caption, size = 176 }: { slices: DonutSlice[]; center: string; caption: string; size?: number }) {
  const arcs = donutArcs(slices.map((s) => s.value), C, 2)
  return (
    <svg viewBox="0 0 190 190" width={size} height={size} className="shrink-0" role="img" aria-label={`${center} ${caption}`}>
      {/* Vòng nền để kỳ rỗng vẫn có hình */}
      <circle cx="95" cy="95" r={R} fill="none" stroke="var(--secondary)" strokeWidth="26" />
      {arcs.map((a, i) => (
        <circle key={i} cx="95" cy="95" r={R} fill="none" stroke={slices[i].color} strokeWidth="26"
          strokeDasharray={`${a.length} ${C}`} strokeDashoffset={a.offset} transform="rotate(-90 95 95)" />
      ))}
      <text x="95" y="92" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--foreground)">{center}</text>
      <text x="95" y="112" textAnchor="middle" fontSize="10.5" fontWeight="600" letterSpacing=".5" fill="var(--muted)">{caption}</text>
    </svg>
  )
}
