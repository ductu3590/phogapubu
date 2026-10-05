import { describe, expect, it } from 'vitest'
import { normalizeMapsUrl } from './maps-url'

describe('normalizeMapsUrl — ô "Link Google Maps" ở Cài đặt quán', () => {
  it('bỏ khoảng trắng hai đầu, giữ link https', () => {
    expect(normalizeMapsUrl('  https://maps.app.goo.gl/abc123  ')).toEqual({ ok: true, value: 'https://maps.app.goo.gl/abc123' })
  })
  it('rỗng → xoá (null)', () => {
    expect(normalizeMapsUrl('   ')).toEqual({ ok: true, value: null })
    expect(normalizeMapsUrl(null)).toEqual({ ok: true, value: null })
  })
  it('không phải https → báo lỗi, không lưu (chặn http:, javascript:, chữ thường)', () => {
    for (const bad of ['http://maps.google.com', 'javascript:alert(1)', 'maps.app.goo.gl/abc']) {
      expect(normalizeMapsUrl(bad)).toEqual({ ok: false, error: 'Link Google Maps phải bắt đầu bằng https://' })
    }
  })
})
