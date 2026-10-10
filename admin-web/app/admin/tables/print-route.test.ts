import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tablesVersion } from '@/lib/table-groups'

// Vá review PA-3: tờ in QR nằm TRONG khung admin (main overflow-auto, h-dvh overflow-hidden) thì
// Chrome không chia sang trang 2 → quán > 12 bàn chỉ in được trang đầu. Trang in phải ở NGOÀI /admin.
describe('trang in QR nằm ngoài khung admin (vá review PA-3)', () => {
  const root = join(__dirname, '..', '..')
  it('route /print/table-qr tồn tại, /admin/tables/print-qr đã bỏ', () => {
    expect(existsSync(join(root, 'print', 'table-qr', 'page.tsx'))).toBe(true)
    expect(existsSync(join(__dirname, 'print-qr', 'page.tsx'))).toBe(false)
  })
  it('link in trỏ đúng route mới', () => {
    const src = readFileSync(join(__dirname, 'tables-client.tsx'), 'utf8')
    expect(src).toMatch(/\/print\/table-qr\?/)
    expect(src).not.toMatch(/\/admin\/tables\/print-qr/)
  })
  it('tờ in không cố định chiều cao khi in', () => {
    const sheet = readFileSync(join(root, 'print', 'table-qr', 'qr-sheet.tsx'), 'utf8')
    expect(sheet).not.toMatch(/fixed inset-0/)
  })
})

// Vá review PA-3: danh sách bàn giữ state từ props lần đầu → Thêm bàn xong không thấy bàn mới.
describe('khoá làm mới danh sách bàn', () => {
  const t = (id: string, area: string | null = null, active = true) => ({ id, table_number: id, area_id: area, is_active: active })
  it('đổi khi thêm / xoá / đổi khu / bật tắt bàn', () => {
    const base = tablesVersion([t('1'), t('2')])
    expect(tablesVersion([t('1'), t('2'), t('3')])).not.toBe(base)
    expect(tablesVersion([t('1')])).not.toBe(base)
    expect(tablesVersion([t('1', 'a1'), t('2')])).not.toBe(base)
    expect(tablesVersion([t('1', null, false), t('2')])).not.toBe(base)
  })
  it('không đổi khi chỉ khác thứ tự', () => {
    expect(tablesVersion([t('2'), t('1')])).toBe(tablesVersion([t('1'), t('2')]))
  })
})
