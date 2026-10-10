import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// AudioContext giả: đếm số nốt được phát + mô phỏng trạng thái bị trình duyệt treo (suspended/interrupted).
class FakeCtx {
  static last: FakeCtx | null = null
  state: string = 'running'
  currentTime = 0
  destination = {}
  oscillators = 0
  resumes = 0
  constructor() { FakeCtx.last = this }
  async resume() { this.resumes += 1; this.state = 'running' }
  createOscillator() {
    this.oscillators += 1
    return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }
  }
}

const listeners = new Map<string, Set<() => void>>()
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  FakeCtx.last = null
  listeners.clear()
  vi.stubGlobal('window', {
    AudioContext: FakeCtx,
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: (t: string, fn: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(fn) },
    removeEventListener: (t: string, fn: () => void) => { listeners.get(t)?.delete(fn) },
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('chuông khi tablet vừa ngủ dậy', () => {
  it('context bị treo → playBell tự resume rồi vẫn kêu (màn bếp không câm)', async () => {
    const bell = await import('./bell')
    await bell.unlockBell()
    const ctx = FakeCtx.last!
    ctx.state = 'interrupted'
    bell.playBell()
    await vi.runAllTimersAsync()
    expect(ctx.resumes).toBeGreaterThan(0)
    expect(ctx.oscillators).toBeGreaterThan(0)
  })
})

describe('nhắc đặt bàn không dùng chuông lặp', () => {
  it('kiểu repeat: ringBellOnce chỉ kêu một lần, không lặp', async () => {
    const bell = await import('./bell')
    await bell.unlockBell()
    bell.setBellStyle('repeat')
    bell.ringBellOnce()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(FakeCtx.last!.oscillators).toBe(2)
  })
})
