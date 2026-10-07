import { describe, expect, it, vi } from 'vitest'
import { createRepeater, parseBellStyle, peakGain, readVolume, writeVolume, DEFAULT_VOLUME, VOLUME_KEY } from './bell-settings'

function memory(init: Record<string, string> = {}) {
  const data = { ...init }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v }, data }
}
const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }

describe('kiểu chuông', () => {
  it('nhận đúng 3 kiểu, rác thì về double', () => {
    expect(parseBellStyle('soft')).toBe('soft')
    expect(parseBellStyle('repeat')).toBe('repeat')
    expect(parseBellStyle('double')).toBe('double')
    expect(parseBellStyle('xyz')).toBe('double')
    expect(parseBellStyle(null)).toBe('double')
  })
})

describe('âm lượng theo máy', () => {
  it('chưa chỉnh → 80', () => expect(readVolume(memory())).toBe(DEFAULT_VOLUME))
  it('không có storage / storage ném lỗi → 80', () => {
    expect(readVolume(null)).toBe(80)
    expect(readVolume(broken)).toBe(80)
  })
  it('giá trị rác → 80; ngoài khoảng → kẹp', () => {
    expect(readVolume(memory({ [VOLUME_KEY]: 'abc' }))).toBe(80)
    expect(readVolume(memory({ [VOLUME_KEY]: '250' }))).toBe(100)
    expect(readVolume(memory({ [VOLUME_KEY]: '-5' }))).toBe(0)
    expect(readVolume(memory({ [VOLUME_KEY]: '35' }))).toBe(35)
  })
  it('ghi kẹp 0–100, làm tròn, storage hỏng không ném', () => {
    const m = memory()
    expect(writeVolume(m, 120.4)).toBe(100)
    expect(m.data[VOLUME_KEY]).toBe('100')
    expect(writeVolume(m, 42.6)).toBe(43)
    expect(() => writeVolume(broken, 50)).not.toThrow()
  })
})

describe('độ to đỉnh', () => {
  it('âm lượng 0 → im hẳn', () => expect(peakGain('double', 0)).toBe(0))
  it('80% kiểu chuẩn ≈ tiếng cũ (0.25)', () => expect(peakGain('double', 80)).toBeCloseTo(0.25, 5))
  it('gõ nhẹ nhỏ hơn chuẩn cùng âm lượng', () => expect(peakGain('soft', 80)).toBeLessThan(peakGain('double', 80)))
  it('không vượt 0.32 ở 100%', () => expect(peakGain('double', 100)).toBeLessThanOrEqual(0.32))
})

describe('chuông lặp (kiểu repeat)', () => {
  function rig() {
    let t = 0
    const timers = new Map<number, { fn: () => void; at: number }>()
    let id = 0
    const play = vi.fn()
    const r = createRepeater({
      play, intervalMs: 3000, maxMs: 300_000, now: () => t,
      setTimer: (fn, ms) => { id += 1; timers.set(id, { fn, at: t + ms }); return id },
      clearTimer: (h) => { timers.delete(h as number) },
    })
    const advance = (ms: number) => {
      const end = t + ms
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        timers.delete(next[0]); t = next[1].at; next[1].fn()
      }
      t = end
    }
    return { r, play, advance }
  }

  it('kêu ngay rồi lặp mỗi 3 giây', () => {
    const { r, play, advance } = rig()
    r.start()
    expect(play).toHaveBeenCalledTimes(1)
    advance(9000)
    expect(play).toHaveBeenCalledTimes(4)
  })
  it('stop là im, start lần 2 khi đang chạy không nhân đôi', () => {
    const { r, play, advance } = rig()
    r.start(); r.start()
    expect(play).toHaveBeenCalledTimes(1)
    r.stop()
    advance(10_000)
    expect(play).toHaveBeenCalledTimes(1)
    expect(r.running()).toBe(false)
  })
  it('trần an toàn 5 phút: tự dừng dù không ai bấm', () => {
    const { r, advance } = rig()
    r.start()
    advance(301_000)
    expect(r.running()).toBe(false)
  })
})
