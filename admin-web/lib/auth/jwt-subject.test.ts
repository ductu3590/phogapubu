import { describe, expect, it } from 'vitest'
import { jwtSubject } from './jwt-subject'

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (payload: unknown) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.chu-ky`

describe('jwtSubject — đoán id người dùng từ access token (không xác thực)', () => {
  it('lấy sub', () => {
    expect(jwtSubject(token({ sub: 'u-123', role: 'authenticated' }))).toBe('u-123')
  })
  it('payload có ký tự base64url (- _) vẫn đọc được', () => {
    expect(jwtSubject(token({ sub: 'u', pad: '>>>???~~~' }))).toBe('u')
  })
  it('không có / sai token → null, không ném', () => {
    expect(jwtSubject(undefined)).toBeNull()
    expect(jwtSubject('')).toBeNull()
    expect(jwtSubject('a.b')).toBeNull()
    expect(jwtSubject('a.!!!.c')).toBeNull()
    expect(jwtSubject(token({ role: 'anon' }))).toBeNull()
    expect(jwtSubject(token({ sub: 42 }))).toBeNull()
  })
})
