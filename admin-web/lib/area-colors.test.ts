import { describe, expect, it } from 'vitest'
import { AREA_COLORS, NO_AREA_BAND, areaColorClasses, nextAreaColor, parseAreaColor } from './area-colors'

describe('màu khu', () => {
  it('đúng 5 màu nhận diện, không màu trạng thái', () => {
    expect(AREA_COLORS.map((c) => c.key)).toEqual(['violet', 'indigo', 'purple', 'fuchsia', 'pink'])
    const all = AREA_COLORS.flatMap((c) => [c.dot, c.chip, c.header, c.bar, c.text]).join(' ')
    expect(all).not.toMatch(/\b(?:bg|text|border|border-l)-(?:green|emerald|lime|teal|sky|cyan|blue|yellow|amber|red|rose|orange|slate|zinc|gray|stone)-/)
  })
  it('class là chuỗi nguyên vẹn (Tailwind v4 không safelist), tông pastel', () => {
    for (const c of AREA_COLORS) expect(c.dot).toMatch(new RegExp(`bg-${c.key}-300`))
  })
  it('dải tên khu: nền -100, chữ -800, gạch đáy -400; chưa phân khu xám', () => {
    for (const c of AREA_COLORS) {
      expect(c.band).toContain(`bg-${c.key}-100`)
      expect(c.band).toContain(`text-${c.key}-800`)
      expect(c.band).toContain(`border-b-${c.key}-400`)
    }
    expect(NO_AREA_BAND).toContain('bg-slate-100')
  })
  it('giá trị rác → tím', () => {
    expect(parseAreaColor('cyan')).toBe('violet')
    expect(parseAreaColor(null)).toBe('violet')
    expect(areaColorClasses('xyz').key).toBe('violet')
    expect(parseAreaColor('pink')).toBe('pink')
  })
  it('khu mới lấy màu chưa dùng, hết thì quay vòng', () => {
    expect(nextAreaColor([])).toBe('violet')
    expect(nextAreaColor(['violet', 'indigo'])).toBe('purple')
    expect(nextAreaColor(['violet', 'indigo', 'purple', 'fuchsia', 'pink'])).toBe('violet')
    expect(nextAreaColor(['violet', 'indigo', 'purple', 'fuchsia', 'pink', 'violet'])).toBe('indigo')
  })
})
