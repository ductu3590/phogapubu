import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'
import { CLIENT_CACHE_SECONDS, createCacheHitDetector, isNavigationRscRequest, navKey } from './revisit-refresh'

describe('createCacheHitDetector — trang hiện từ cache thì tải bản mới phía sau', () => {
  it('tải cứng lần đầu → không tải lại', () => {
    const d = createCacheHitDetector()
    expect(d.arrived('/admin/pos', 0)).toBe(false)
  })

  it('điều hướng có request RSC cho đúng trang (máy chủ vừa trả bản mới) → không tải lại', () => {
    const d = createCacheHitDetector()
    d.arrived('/admin/pos', 0)
    d.fetched('/admin/menu', 100)
    expect(d.arrived('/admin/menu', 900)).toBe(false)
  })

  it('điều hướng KHÔNG có request (Next lấy từ cache) → tải lại phía sau', () => {
    const d = createCacheHitDetector()
    d.arrived('/admin/pos', 0)
    d.fetched('/admin/menu', 100)
    d.arrived('/admin/menu', 900)
    d.fetched('/admin/bills', 1_000)
    d.arrived('/admin/bills', 1_800)
    expect(d.arrived('/admin/menu', 5_000)).toBe(true)
  })

  it('cache bị xoá (refresh / Realtime) → Next tự hỏi máy chủ → không tải thêm lần nữa', () => {
    const d = createCacheHitDetector()
    d.arrived('/admin/pos', 0)
    d.fetched('/admin/bills', 100); d.arrived('/admin/bills', 500)
    d.fetched('/admin/menu', 600); d.arrived('/admin/menu', 900)
    d.fetched('/admin/bills', 1_000) // quay lại Hoá đơn: cache đã bị xoá nên có request
    expect(d.arrived('/admin/bills', 1_900)).toBe(false)
  })

  it('request cũ của chính trang đó (trước lần rời trang) không tính', () => {
    const d = createCacheHitDetector()
    d.arrived('/admin/pos', 0)
    d.fetched('/admin/menu', 100); d.arrived('/admin/menu', 500)
    d.fetched('/admin/menu', 700) // refresh trong lúc đang ở Món
    d.arrived('/admin/bills', 1_000)
    expect(d.arrived('/admin/menu', 2_000)).toBe(true)
  })
})

describe('navKey / isNavigationRscRequest', () => {
  it('bỏ _rsc, sắp query', () => {
    expect(navKey('/admin/reports', '?tab=item&_rsc=abc&period=today')).toBe('/admin/reports?period=today&tab=item')
    expect(navKey('/admin/menu', '')).toBe('/admin/menu')
    expect(navKey('/admin/menu', '?_rsc=x')).toBe('/admin/menu')
  })
  it('chỉ request RSC không phải prefetch', () => {
    expect(isNavigationRscRequest(new Headers({ RSC: '1' }))).toBe(true)
    expect(isNavigationRscRequest(new Headers({ RSC: '1', 'Next-Router-Prefetch': '1' }))).toBe(false)
    expect(isNavigationRscRequest(new Headers())).toBe(false)
  })
  it('next.config.ts giữ trang động đúng CLIENT_CACHE_SECONDS', () => {
    expect(nextConfig.experimental?.staleTimes?.dynamic).toBe(CLIENT_CACHE_SECONDS)
  })
})
