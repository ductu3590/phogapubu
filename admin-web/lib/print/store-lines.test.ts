import { describe, expect, it } from 'vitest'
import { cleanStoreText } from './store-lines'

describe('cleanStoreText', () => {
  it('giữ chữ, bỏ khoảng trắng hai đầu', () => {
    expect(cleanStoreText('  236 Bảo Lương, Lào Cai ')).toBe('236 Bảo Lương, Lào Cai')
  })
  it('rỗng / chỉ khoảng trắng / null / undefined → null (không in dòng trống)', () => {
    expect(cleanStoreText('')).toBeNull()
    expect(cleanStoreText('   \n ')).toBeNull()
    expect(cleanStoreText(null)).toBeNull()
    expect(cleanStoreText(undefined)).toBeNull()
  })
})
