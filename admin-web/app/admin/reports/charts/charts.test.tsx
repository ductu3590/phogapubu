import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Receipt } from 'lucide-react'
import { Donut } from './donut'
import { AreaChart } from './area-chart'
import { Waterfall } from './waterfall'
import { KpiCard } from '../kpi-card'

const fmt = (n: number) => `${n}!`

describe('Donut', () => {
  it('3 lát, chữ tâm, caption', () => {
    const html = renderToStaticMarkup(
      <Donut slices={[{ label: 'a', value: 1, color: 'red' }, { label: 'b', value: 2, color: 'blue' }, { label: 'c', value: 3, color: 'green' }]} center="CT" caption="CAP" />,
    )
    expect((html.match(/<circle[^>]*stroke-dasharray/g) ?? []).length).toBe(3)
    expect(html).toContain('CT')
    expect(html).toContain('CAP')
  })
})

describe('AreaChart', () => {
  const labels7 = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  it('2 series, nhãn đỉnh, đủ nhãn x', () => {
    const html = renderToStaticMarkup(
      <AreaChart labels={labels7} formatLeft={fmt} formatRight={fmt}
        series={[{ name: 'x', values: [1, 2, 9, 3, 4, 5, 6], color: '#111' }, { name: 'y', values: [1, 1, 2, 1, 1, 1, 1], color: '#222', axis: 'right' }]} />,
    )
    expect((html.match(/<path[^>]*stroke="/g) ?? []).length).toBe(2)
    expect(html).toContain('9!')
    for (const l of labels7) expect(html).toContain(`>${l}</text>`)
  })
  it('24 cột → tối đa 13 nhãn x', () => {
    const labels = Array.from({ length: 24 }, (_, i) => `L${i}h`)
    const html = renderToStaticMarkup(
      <AreaChart labels={labels} formatLeft={fmt} series={[{ name: 'x', values: labels.map((_, i) => i), color: '#111' }]} />,
    )
    expect((html.match(/>L\d+h<\/text>/g) ?? []).length).toBeLessThanOrEqual(13)
  })
  it('toàn 0 → không NaN', () => {
    const html = renderToStaticMarkup(
      <AreaChart labels={labels7} formatLeft={fmt} series={[{ name: 'x', values: [0, 0, 0, 0, 0, 0, 0], color: '#111' }]} />,
    )
    expect(html).not.toContain('NaN')
  })
})

describe('AreaChart nhãn đỉnh và aria', () => {
  it('đỉnh ở cột cuối / cột đầu: nhãn không bị cắt khỏi viewBox', () => {
    for (const vals of [[1, 2, 3, 4, 9], [9, 4, 3, 2, 1]]) {
      const html = renderToStaticMarkup(
        <AreaChart labels={['a', 'b', 'c', 'd', 'e']} formatLeft={fmt} formatRight={fmt}
          series={[{ name: 'x', values: vals, color: '#111' }, { name: 'y', values: vals, color: '#222', axis: 'right' }]} />,
      )
      const rects = [...html.matchAll(/<rect[^>]*>/g)].map((m) => m[0])
      expect(rects.length).toBe(2)
      for (const r of rects) {
        const rx = Number(/ x="(-?[\d.]+)"/.exec(r)![1])
        const rw = Number(/ width="([\d.]+)"/.exec(r)![1])
        expect(rx).toBeGreaterThanOrEqual(0)
        expect(rx + rw).toBeLessThanOrEqual(1040)
      }
    }
  })
  it('có aria-label mặc định và tuỳ chỉnh', () => {
    const base = { labels: ['a'], formatLeft: fmt, series: [{ name: 'x', values: [1], color: '#111' }] }
    expect(renderToStaticMarkup(<AreaChart {...base} />)).toContain('aria-label="Biểu đồ theo thời gian"')
    expect(renderToStaticMarkup(<AreaChart {...base} ariaLabel="X" />)).toContain('aria-label="X"')
  })
})

describe('Waterfall', () => {
  it('có aria-label', () => {
    const steps = [{ label: 'a', value: 1, kind: 'total' as const }]
    expect(renderToStaticMarkup(<Waterfall steps={steps} formatValue={fmt} />)).toContain('aria-label="Từ doanh thu đến lãi ròng"')
  })
  it('lãi ròng âm: không NaN, y/height >= 0, cột lãi ròng dưới trục 0', () => {
    const html = renderToStaticMarkup(
      <Waterfall formatValue={fmt} steps={[
        { label: 'Doanh thu', value: 100, kind: 'total' }, { label: 'Giá vốn', value: -130, kind: 'delta' },
        { label: 'Lãi gộp', value: -30, kind: 'total' }, { label: 'Chi phí', value: -20, kind: 'delta' },
        { label: 'Huỷ + khác', value: 0, kind: 'delta' }, { label: 'Lãi ròng', value: -50, kind: 'total' },
      ]} />,
    )
    expect(html).not.toContain('NaN')
    const PLOT_BOTTOM = 260 // H - B trong waterfall.tsx
    const rects = [...html.matchAll(/<rect[^>]*>/g)].map((m) => m[0])
    expect(rects.length).toBe(6)
    for (const r of rects) {
      const ry = Number(/ y="(-?[\d.]+)"/.exec(r)![1])
      const rh = Number(/ height="(-?[\d.]+)"/.exec(r)![1])
      expect(ry).toBeGreaterThanOrEqual(0)
      expect(rh).toBeGreaterThanOrEqual(0)
      expect(ry + rh).toBeLessThanOrEqual(PLOT_BOTTOM + 0.001)
    }
    const zero = Number(/data-zero-y="([\d.]+)"/.exec(html)![1])
    const net = [...html.matchAll(/<rect[^>]*data-step="Lãi ròng"[^>]*>/g)]
    expect(net.length).toBe(1)
    expect(Number(/ y="([\d.]+)"/.exec(net[0][0])![1])).toBeGreaterThanOrEqual(zero)
  })
})

describe('KpiCard', () => {
  it('giá trị tiền dài: cỡ chữ theo màn và tự xuống dòng trong thẻ, không tràn ở 375px', () => {
    const html = renderToStaticMarkup(<KpiCard icon={Receipt} tone="orange" label="DT" value="350.000.000đ" />)
    const valueDiv = html.slice(html.indexOf('350.000.000đ') - 200, html.indexOf('350.000.000đ'))
    for (const c of ['text-lg', 'sm:text-[21px]', 'md:text-[28px]', '[overflow-wrap:anywhere]']) expect(valueDiv).toContain(c)
    expect(valueDiv).not.toContain('whitespace-nowrap')
    expect(html).toContain('min-w-0')
  })

  const render = (p: Partial<Parameters<typeof KpiCard>[0]>) =>
    renderToStaticMarkup(<KpiCard icon={Receipt} tone="orange" label="DT" value="1" compareLabel="so với kỳ trước" {...p} />)
  it('tăng = tốt', () => {
    const h = render({ delta: 8.2 })
    expect(h).toContain('↑ 8,2%')
    expect(h).toContain('text-success')
    expect(h).toContain('so với kỳ trước')
  })
  it('inverse → xấu', () => {
    expect(render({ delta: 8.2, inverse: true })).toContain('text-critical')
  })
  it('null → không chip, không compareLabel', () => {
    const h = render({ delta: null })
    expect(h).not.toContain('%')
    expect(h).not.toContain('so với kỳ trước')
  })
  it('0 → — 0%', () => {
    expect(render({ delta: 0 })).toContain('— 0%')
  })
})

describe('AreaChart trục đếm và nhãn x (rà soát cuối)', () => {
  it('số đếm nhỏ: 5 mốc trục phải là số nguyên phân biệt', () => {
    for (const v of [1, 2, 5, 9, 18]) {
      const html = renderToStaticMarkup(
        <AreaChart labels={['a', 'b']} formatLeft={fmt} formatRight={(n) => `${n}c`}
          series={[{ name: 'x', values: [1, 2], color: '#111' }, { name: 'y', values: [v, v], color: '#222', axis: 'right' }]} />,
      )
      const ticks = [...html.matchAll(/fill="var\(--muted\)">([\d.]+)c<\/text>/g)].map((m) => m[1])
      expect(ticks.length, String(v)).toBe(5)
      expect(new Set(ticks).size, `${v}: ${ticks}`).toBe(5)
      for (const t of ticks) expect(Number.isInteger(Number(t)), `${v}: ${ticks}`).toBe(true)
    }
  })
  it('30 điểm trên khung 420: không hai nhãn x gần nhau hơn `every` bước', () => {
    const labels = Array.from({ length: 30 }, (_, i) => `N${i}`)
    const html = renderToStaticMarkup(
      <AreaChart labels={labels} formatLeft={fmt} width={420} height={280} series={[{ name: 'x', values: labels.map((_, i) => i), color: '#111' }]} />,
    )
    const idx = [...html.matchAll(/>N(\d+)<\/text>/g)].map((m) => Number(m[1]))
    const every = Math.ceil(30 / 12)
    expect(idx[idx.length - 1]).toBe(29)
    for (let i = 1; i < idx.length; i++) expect(idx[i] - idx[i - 1], idx.join(',')).toBeGreaterThanOrEqual(every)
  })
})
