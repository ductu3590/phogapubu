import { describe, expect, it } from 'vitest'
import { createBackdropGuard } from './backdrop-dismiss'

describe('đóng popup khi bấm ra nền (2026-11-16)', () => {
  it('nhấn và thả đều trên nền → đóng', () => {
    const g = createBackdropGuard()
    g.down(true)
    expect(g.click(true)).toBe(true)
  })

  it('LỖI CŨ: nhấn trong ô nhập, quét chuột kéo ra nền rồi thả → KHÔNG đóng', () => {
    const g = createBackdropGuard()
    g.down(false) // nhấn trong ô nhập
    expect(g.click(true)).toBe(false) // click rơi vào <dialog> vì là cha chung
  })

  it('nhấn trên nền rồi kéo vào trong khung thả → không đóng', () => {
    const g = createBackdropGuard()
    g.down(true)
    expect(g.click(false)).toBe(false)
  })

  it('bấm bình thường trong khung → không đóng', () => {
    const g = createBackdropGuard()
    g.down(false)
    expect(g.click(false)).toBe(false)
  })

  it('click không có lần nhấn đi kèm (vd. phím Enter/Space trên nút) → không đóng', () => {
    const g = createBackdropGuard()
    expect(g.click(true)).toBe(false)
  })

  it('mỗi lần nhấn chỉ cho đóng một lần — click lạc sau đó không đóng', () => {
    const g = createBackdropGuard()
    g.down(true)
    expect(g.click(true)).toBe(true)
    expect(g.click(true)).toBe(false)
  })

  it('lần nhấn sau ghi đè lần trước: nhấn nền rồi nhấn trong ô, thả trên nền → không đóng', () => {
    const g = createBackdropGuard()
    g.down(true)
    g.down(false)
    expect(g.click(true)).toBe(false)
  })
})
