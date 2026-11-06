import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTokenStore, type SafeStorageLike } from './token-store'

// Giả lập DPAPI: đảo byte, nên token không bao giờ nằm nguyên trên đĩa
const fakeSafe: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s, 'utf8').reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString('utf8'),
}

describe('token-store', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mevo-token-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('chưa có file thì ra null', () => {
    expect(createTokenStore(dir, fakeSafe).load()).toBeNull()
  })

  it('lưu rồi đọc lại đúng token, trên đĩa không có token gốc', () => {
    const store = createTokenStore(dir, fakeSafe)
    store.save('bi-mat-123')
    expect(store.load()).toBe('bi-mat-123')
    expect(readFileSync(join(dir, 'agent-token.bin')).toString('utf8')).not.toContain('bi-mat-123')
  })

  it('clear xoá file, gọi khi chưa có file cũng không ném', () => {
    const store = createTokenStore(dir, fakeSafe)
    store.save('x')
    store.clear()
    expect(existsSync(join(dir, 'agent-token.bin'))).toBe(false)
    expect(() => store.clear()).not.toThrow()
  })

  it('file hỏng hoặc của user Windows khác: ra null để ghép lại, không ném', () => {
    writeFileSync(join(dir, 'agent-token.bin'), 'rac')
    const store = createTokenStore(dir, {
      ...fakeSafe,
      decryptString: () => {
        throw new Error('decrypt failed')
      },
    })
    expect(store.load()).toBeNull()
  })

  it('máy không mã hoá được: từ chối lưu, không ghi token trần', () => {
    const store = createTokenStore(dir, { ...fakeSafe, isEncryptionAvailable: () => false })
    expect(() => store.save('x')).toThrow()
    expect(existsSync(join(dir, 'agent-token.bin'))).toBe(false)
  })
})
