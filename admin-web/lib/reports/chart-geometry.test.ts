import { describe, expect, it } from 'vitest'
import { donutArcs, niceMax, smoothPath } from './chart-geometry'
import { shortMoney } from '@/app/admin/reports/report-format'

describe('niceMax', () => {
  it('làm tròn lên mốc đẹp', () => {
    expect(niceMax(4_260_000)).toBe(6_000_000)
    expect(niceMax(18)).toBe(20)
  })
  it('<= 0 trả 1', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(-5)).toBe(1)
  })
})

describe('smoothPath', () => {
  it('0 điểm → rỗng, 1 điểm → M', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([[0, 0]])).toBe('M0,0')
  })
  it('3 điểm → 2 đoạn cong', () => {
    const d = smoothPath([[0, 10], [10, 0], [20, 10]])
    expect(d.startsWith('M0,10 C')).toBe(true)
    expect(d.split(' C').length - 1).toBe(2)
  })
})

describe('smoothPath kẹp điểm điều khiển', () => {
  const ys = (d: string) => [...d.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) /g)].flatMap((m) => [Number(m[2]), Number(m[4])])
  it('không vọt ra ngoài khoảng y của đoạn', () => {
    for (const pts of [[[0, 0], [10, 100], [20, 100]], [[0, 100], [10, 0], [20, 0]], [[0, 100], [10, 0], [20, 100]]] as [number, number][][]) {
      const d = smoothPath(pts)
      for (const y of ys(d)) {
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('donutArcs', () => {
  it('chia theo tỉ lệ', () => {
    expect(donutArcs([1, 1], 100, 0)).toEqual([{ length: 50, offset: 0 }, { length: 50, offset: -50 }])
  })
  it('tổng 0 → rỗng', () => {
    expect(donutArcs([0, 0], 100)).toEqual([])
  })
})

describe('shortMoney', () => {
  it('rút gọn', () => {
    expect(shortMoney(17_800_000)).toBe('17,8tr')
    expect(shortMoney(56_000)).toBe('56k')
    expect(shortMoney(0)).toBe('0')
    expect(shortMoney(-1_500_000)).toBe('-1,5tr')
  })
})
