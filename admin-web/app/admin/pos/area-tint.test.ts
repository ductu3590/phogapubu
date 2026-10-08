import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// PA-3: dải tiêu đề khu trên Timeline lấy MÀU KHU (lib/area-colors), không còn bảng tint theo thứ tự
// (emerald/sky/amber/teal) — các màu đó trùng màu trạng thái bàn, "Trong nhà" tô xanh lá bị đọc thành "đang phục vụ".
describe('màu khu trên POS (PA-3)', () => {
  const src = readFileSync(join(__dirname, 'timeline-view.tsx'), 'utf8')
  it('không còn AREA_TINTS dùng màu trạng thái', () => {
    expect(src).not.toMatch(/AREA_TINTS/)
    expect(src).not.toMatch(/bg-(emerald|sky|amber|teal)-50/)
  })
  it('dùng areaColorClasses', () => {
    expect(src).toMatch(/areaColorClasses\(/)
  })
  it('thanh chọn khu có chấm màu khu', () => {
    expect(readFileSync(join(__dirname, 'area-controls.tsx'), 'utf8')).toMatch(/areaColorClasses\(area\.color\)\.dot/)
  })
})
