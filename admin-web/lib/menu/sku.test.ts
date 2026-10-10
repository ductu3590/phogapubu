import { describe, expect, it } from 'vitest'
import { badgeLabel, formatSku, MENU_BADGES, nextSkuNumber, parseBadge, parseManualSku, parsePrefix, skuPrefixFromName, stripVietnamese, uniquePrefix } from './sku'

describe('tiền tố mã món từ tên danh mục', () => {
  it.each([
    ['Món ngon tuần này', 'MNTN'],
    ['Các món quê', 'CMQ'],
    ['Các món trâu - bò', 'CMTB'],
    ['Cơm rang - Mỳ xào', 'CRMX'],
    ['Đồ ăn nhanh', 'DAN'],
    ['Đồ khô', 'DK'],
    ['Đồ uống', 'DU'],
    ['Bia & Đồ uống', 'BDU'],
    ['Lẩu riêu cua bắp bò sườn sụn', 'LRCB'],
    ['🍺 !!!', 'MON'],
    ['  ', 'MON'],
  ])('%s → %s', (name, prefix) => expect(skuPrefixFromName(name)).toBe(prefix))
  it('bỏ dấu đủ chữ Việt', () => expect(stripVietnamese('Đặc biệt ẩm thực Ỷ')).toBe('Dac biet am thuc Y'))
  it('trùng tiền tố → thêm số, tối đa 6 ký tự', () => {
    expect(uniquePrefix('DU', [])).toBe('DU')
    expect(uniquePrefix('DU', ['DU'])).toBe('DU2')
    expect(uniquePrefix('DU', ['DU', 'DU2'])).toBe('DU3')
    expect(uniquePrefix('MNTN', ['MNTN', 'MNTN2', 'MNTN3', 'MNTN4', 'MNTN5', 'MNTN6', 'MNTN7', 'MNTN8', 'MNTN9'])).toBe('MNTN10')
    expect(uniquePrefix('ABCDEF', ['ABCDEF'])).toBe('ABCDE2')
  })
})

describe('mã món', () => {
  it('định dạng 3 chữ số', () => {
    expect(formatSku('DU', 1)).toBe('DU-001')
    expect(formatSku('DU', 1234)).toBe('DU-1234')
  })
  it('số kế tiếp bỏ qua mã sửa tay không đúng mẫu', () => {
    expect(nextSkuNumber('DU', [])).toBe(1)
    expect(nextSkuNumber('DU', ['DU-001', 'DU-007', 'DU-ABC', 'DUX-050', 'BIA-THAP'])).toBe(8)
  })
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
