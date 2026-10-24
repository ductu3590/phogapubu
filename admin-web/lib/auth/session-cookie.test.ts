import { describe, expect, it } from 'vitest'
import { hasSupabaseSessionCookie } from './session-cookie'

describe('hasSupabaseSessionCookie', () => {
  it('nhận cookie phiên Supabase, kể cả khi bị chia mảnh', () => {
    expect(hasSupabaseSessionCookie([{ name: 'sb-abc123-auth-token' }])).toBe(true)
    expect(hasSupabaseSessionCookie([{ name: 'sb-abc123-auth-token.0' }, { name: 'sb-abc123-auth-token.1' }])).toBe(true)
  })
  it('không nhận cookie khác hoặc danh sách rỗng', () => {
    expect(hasSupabaseSessionCookie([])).toBe(false)
    expect(hasSupabaseSessionCookie([{ name: '_ga' }, { name: 'sb-abc123-code-verifier' }])).toBe(false)
    expect(hasSupabaseSessionCookie([{ name: 'mevo_device_id' }])).toBe(false)
  })
})
