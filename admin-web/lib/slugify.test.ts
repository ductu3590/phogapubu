import { describe, expect, it } from 'vitest'
import { suggestSlug, SLUG_RE } from './slugify'

describe('suggestSlug', () => {
  it('bỏ dấu tiếng Việt và kebab-case', () => {
    expect(suggestSlug('Phở Gà Pubu')).toBe('pho-ga-pubu')
    expect(suggestSlug('Căng tin PUBU')).toBe('cang-tin-pubu')
    expect(suggestSlug('Quán Đường Đôi 68')).toBe('quan-duong-doi-68')
  })
  it('gọn ký tự lạ, không gạch đầu/cuối', () => {
    expect(suggestSlug('  Bún!! Chả---Hà Nội  ')).toBe('bun-cha-ha-noi')
    expect(suggestSlug('***')).toBe('')
  })
})

describe('SLUG_RE', () => {
  it('chấp nhận kebab-case, từ chối còn lại', () => {
    expect(SLUG_RE.test('pho-ga-pubu')).toBe(true)
    expect(SLUG_RE.test('Pho-Ga')).toBe(false)
    expect(SLUG_RE.test('pho_ga')).toBe(false)
    expect(SLUG_RE.test('-pho')).toBe(false)
    expect(SLUG_RE.test('')).toBe(false)
  })
})
