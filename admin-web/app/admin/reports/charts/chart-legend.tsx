import { formatPercent } from '../report-format'

export type LegendItem = { label: string; sub?: string; percent?: number; color: string }

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-3 p-0">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-2.5">
          <span className="mt-1 size-2.5 rounded-full" style={{ background: it.color }} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">{it.label}</div>
            {it.sub ? <div className="tabular text-xs text-muted">{it.sub}</div> : null}
          </div>
          {it.percent !== undefined ? <span className="tabular font-bold">{formatPercent(it.percent)}</span> : null}
        </li>
      ))}
    </ul>
  )
}
