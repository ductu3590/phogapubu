import { describe, expect, it } from 'vitest'
import {
  EMPTY_STATE, disabled, hashPin, isValidPin, parseState, readState, storageKey, verifyPin, withNewPin, writeState,
  type KeyValueStorage,
} from './pos-lock'

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v) },
    removeItem: (k) => { data.delete(k) },
  }
}

describe('pos-lock', () => {
  it('chỉ nhận đúng 4 chữ số', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })

  it('đặt mã rồi kiểm: đúng mã mới qua, sai mã bị chặn', () => {
    const s = withNewPin('2468', true)
    expect(s.status).toBe('on')
    expect(s.locked).toBe(true)
    expect(s.hash).not.toContain('2468')
    expect(verifyPin(s, '2468')).toBe(true)
    expect(verifyPin(s, '2469')).toBe(false)
    expect(verifyPin(disabled(), '2468')).toBe(false)
  })

  it('cùng mã khác muối thì băm khác', () => {
    expect(hashPin('1111', 'a')).not.toBe(hashPin('1111', 'b'))
  })

  it('dữ liệu hỏng hoặc "bật mà không có mã" → chưa đặt, KHÔNG khoá', () => {
    expect(parseState('{oops')).toEqual(EMPTY_STATE)
    expect(parseState(JSON.stringify({ status: 'on', locked: true }))).toEqual(EMPTY_STATE)
    expect(parseState(JSON.stringify({ status: 'off', locked: true })).locked).toBe(false)
  })

  it('mỗi tài khoản một khoá riêng trên cùng máy; chưa đặt thì xoá hẳn khỏi storage', () => {
    const st = memoryStorage()
    writeState(st, 'owner', withNewPin('1234', true))
    expect(readState(st, 'owner').locked).toBe(true)
    expect(readState(st, 'cashier')).toEqual(EMPTY_STATE)
    writeState(st, 'owner', EMPTY_STATE)
    expect(st.data.has(storageKey('owner'))).toBe(false)
  })
})
