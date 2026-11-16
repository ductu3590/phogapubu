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

describe('Waterfall', () => {
  it('lãi ròng âm: không NaN, y/height >= 0, cột lãi ròng dưới trục 0', () => {
    const html = renderToStaticMarkup(
      <Waterfall formatValue={fmt} steps={[
        { label: 'Doanh thu', value: 100, kind: 'total' }, { label: 'Giá vốn', value: -130, kind: 'delta' },
        { label: 'Lãi gộp', value: -30, kind: 'total' }, { label: 'Chi phí', value: -20, kind: 'delta' },
        { label: 'Huỷ + khác', value: 0, kind: 'delta' }, { label: 'Lãi ròng', value: -50, kind: 'total' },
      ]} />,
    )
    expect(html).not.toContain('NaN')
    for (const m of html.matchAll(/<rect[^>]*\s(?:y|height)="(-?[\d.]+)"/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(0)
    const zero = Number(/data-zero-y="([\d.]+)"/.exec(html)![1])
    const rects = [...html.matchAll(/<rect[^>]*data-step="Lãi ròng"[^>]*>/g)]
    expect(rects.length).toBe(1)
    expect(Number(/ y="([\d.]+)"/.exec(rects[0][0])![1])).toBeGreaterThanOrEqual(zero)
  })
})

describe('KpiCard', () => {
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
