import { describe, expect, it } from 'vitest'
import { badgeLabel, MENU_BADGES, parseBadge, parseManualSku, parsePrefix, stripVietnamese } from './sku'

describe('bỏ dấu', () => {
  it('bỏ dấu đủ chữ Việt', () => expect(stripVietnamese('Đặc biệt ẩm thực Ỷ')).toBe('Dac biet am thuc Y'))
})

describe('mã món', () => {
  it('mã gõ tay', () => {
    expect(parseManualSku('  bia-thap-03 ')).toEqual({ ok: true, sku: 'BIA-THAP-03' })
    expect(parseManualSku('')).toEqual({ ok: true, sku: null })
    expect(parseManualSku('bia tháp')).toMatchObject({ ok: false })
    expect(parseManualSku('-ABC')).toMatchObject({ ok: false })
    expect(parseManualSku('A'.repeat(21))).toMatchObject({ ok: false })
  })
  it('tiền tố gõ tay', () => {
    expect(parsePrefix(' bia ')).toEqual({ ok: true, prefix: 'BIA' })
    expect(parsePrefix('')).toEqual({ ok: true, prefix: null })
    expect(parsePrefix('BIA-1')).toMatchObject({ ok: false })
    expect(parsePrefix('ABCDEFG')).toMatchObject({ ok: false })
  })
})

describe('nhãn món', () => {
  it('2 nhãn, giá trị lạ → null', () => {
    expect(MENU_BADGES.map((b) => b.value)).toEqual(['best_seller', 'signature'])
    expect(parseBadge('signature')).toBe('signature')
    expect(parseBadge('hot')).toBeNull()
    expect(parseBadge('')).toBeNull()
    expect(badgeLabel('best_seller')).toBe('Best seller')
    expect(badgeLabel('signature')).toBe('Món của quán')
    expect(badgeLabel(null)).toBeNull()
  })
})
