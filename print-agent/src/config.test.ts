import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseConfig } from './config'

const valid = {
  supabaseUrl: 'https://abc.supabase.co',
  anonKey: 'anon',
  webOrigin: 'https://admin.test',
  pageSizeMode: 'measured',
}

describe('parseConfig', () => {
  it('đọc đủ bốn trường', () => {
    expect(parseConfig(JSON.stringify(valid))).toEqual(valid)
  })

  it('bỏ dấu / cuối URL để ghép đường dẫn không bị //', () => {
    const c = parseConfig(
      JSON.stringify({ ...valid, supabaseUrl: 'https://abc.supabase.co/', webOrigin: 'https://admin.test//' }),
    )
    expect(c.supabaseUrl).toBe('https://abc.supabase.co')
    expect(c.webOrigin).toBe('https://admin.test')
  })

  it.each(['supabaseUrl', 'anonKey', 'webOrigin'])('thiếu %s thì báo lỗi có tên trường', (field) => {
    expect(() => parseConfig(JSON.stringify({ ...valid, [field]: '' }))).toThrow(field)
  })

  it('pageSizeMode lạ thì báo lỗi', () => {
    expect(() => parseConfig(JSON.stringify({ ...valid, pageSizeMode: 'a4' }))).toThrow('pageSizeMode')
  })

  it('URL không hợp lệ thì báo lỗi', () => {
    expect(() => parseConfig(JSON.stringify({ ...valid, webOrigin: 'admin.test' }))).toThrow('webOrigin')
  })

  it('file không phải JSON thì báo lỗi', () => {
    expect(() => parseConfig('{')).toThrow()
  })

  it('bản .example đọc được', () => {
    const raw = readFileSync(join(__dirname, '..', 'agent.config.example.json'), 'utf8')
    expect(parseConfig(raw).pageSizeMode).toBe('measured')
  })
})
