import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileLog } from './file-log'

describe('file-log', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mevo-log-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const read = () => readFileSync(join(dir, 'agent.log'), 'utf8')

  it('mỗi lần ghi một dòng có giờ, dòng sau nối tiếp', () => {
    const log = createFileLog(join(dir, 'agent.log'))
    log('lần một')
    log('lần hai\nnhiều dòng')
    const lines = read().trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* lần một$/)
    expect(lines[1]).toContain('lần hai nhiều dòng')
  })

  it('che chuỗi hex dài như token thiết bị và token trang in', () => {
    const token = 'a1b2c3d4'.repeat(8)
    createFileLog(join(dir, 'agent.log'))(`lỗi ${token} ở đây`)
    expect(read()).not.toContain(token)
    expect(read()).toContain('lỗi [đã ẩn] ở đây')
  })

  it('giữ nguyên mã phiếu dạng uuid để còn dò được', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    createFileLog(join(dir, 'agent.log'))(`phiếu ${id}`)
    expect(read()).toContain(id)
  })

  it('tin dài bị cắt, không phình file', () => {
    createFileLog(join(dir, 'agent.log'))('x '.repeat(5000))
    expect(read().length).toBeLessThan(700)
  })

  it('không ghi được thì không ném, in lỗi không được làm chết vòng lặp', () => {
    const log = createFileLog(join(dir, 'khong-co-thu-muc', 'agent.log'))
    expect(() => log('x')).not.toThrow()
  })
})
