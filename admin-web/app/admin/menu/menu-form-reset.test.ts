import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vá review PA-4: React 19 TỰ RESET <form action={…}> khi action chạy xong — kể cả khi action TRẢ lỗi
// (mã món trùng…). Chủ quán gõ tên, giá, mô tả, mã… rồi bị báo trùng là mất hết chữ đã gõ.
// Form món + form danh mục phải submit bằng onSubmit (preventDefault) để giữ nguyên chữ khi báo lỗi.
describe('form thực đơn không bị xoá trắng khi báo lỗi (PA-4)', () => {
  const src = readFileSync(join(__dirname, 'menu-client.tsx'), 'utf8')
  it('ItemForm không dùng action={onSubmit}', () => {
    expect(src).not.toMatch(/action=\{onSubmit\}/)
  })
  it('form thêm / sửa danh mục không dùng action={async (fd) …}', () => {
    expect(src).not.toMatch(/action=\{async \(fd\) => \{\s*setFormError/)
  })
  it('có helper submit giữ form', () => {
    expect(src).toMatch(/function submitKeepingForm/)
  })
})
