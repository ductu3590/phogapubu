import { describe, it, expect } from 'vitest'
import { TRAY_COLORS, assignTrayColors, type TraySessionLike } from './tray-colors'

// Helper dựng phiên rút gọn — chỉ 4 field mà assignTrayColors thật sự đọc.
const phien = (
  id: string,
  tableCount: number,
  openedAt: string,
  status: string = 'open',
): TraySessionLike => ({
  session_id: id,
  status,
  opened_at: openedAt,
  tables: Array.from({ length: tableCount }, (_, i) => ({ id: `${id}-t${i}` })),
})

describe('assignTrayColors', () => {
  it('danh sách rỗng → không gán gì', () => {
    expect(assignTrayColors([]).size).toBe(0)
  })

  it('phiên 1 bàn KHÔNG phải mâm nên không có màu', () => {
    const map = assignTrayColors([phien('a', 1, '2026-09-02T10:00:00Z')])
    expect(map.size).toBe(0)
  })

  it('phiên đã đóng không được gán màu dù nhiều bàn', () => {
    const map = assignTrayColors([phien('a', 3, '2026-09-02T10:00:00Z', 'closed')])
    expect(map.size).toBe(0)
  })

  it('phiên 2 bàn trở lên là mâm — kể cả mâm dựng bằng "Thêm bàn vào mâm"', () => {
    const map = assignTrayColors([phien('a', 2, '2026-09-02T10:00:00Z')])
    expect(map.get('a')?.color).toBeDefined()
  })

  it('mỗi mâm một màu khác nhau khi số mâm không vượt bảng màu', () => {
    const list = Array.from({ length: TRAY_COLORS.length }, (_, i) =>
      phien(`mam-${i}`, 3, `2026-09-02T10:0${i}:00Z`),
    )
    const map = assignTrayColors(list)
    const keys = list.map((s) => map.get(s.session_id)!.color.key)
    expect(new Set(keys).size).toBe(TRAY_COLORS.length)
  })

  it('nhiều mâm hơn số màu thì dùng lại màu, không văng lỗi và vẫn gán đủ', () => {
    const list = Array.from({ length: TRAY_COLORS.length + 3 }, (_, i) =>
      phien(`mam-${i}`, 2, `2026-09-02T1${i}:00:00Z`),
    )
    const map = assignTrayColors(list)
    expect(map.size).toBe(list.length)
    for (const s of list) expect(map.get(s.session_id)!.color).toBeDefined()
  })

  it('số hiệu Mâm đánh theo thứ tự MỞ, không theo thứ tự trong mảng', () => {
    const map = assignTrayColors([
      phien('muon', 2, '2026-09-02T12:00:00Z'),
      phien('som', 2, '2026-09-02T09:00:00Z'),
    ])
    expect(map.get('som')!.index).toBe(1)
    expect(map.get('muon')!.index).toBe(2)
  })

  it('mâm mở trước GIỮ NGUYÊN màu khi có mâm mới ghép thêm sau', () => {
    const cu = phien('cu', 3, '2026-09-02T09:00:00Z')
    const truoc = assignTrayColors([cu]).get('cu')!.color.key
    const sau = assignTrayColors([cu, phien('moi', 2, '2026-09-02T11:00:00Z')]).get('cu')!.color.key
    expect(sau).toBe(truoc)
  })

  it('cùng một session_id luôn ra cùng màu giữa hai màn hình', () => {
    const list = [
      phien('x', 3, '2026-09-02T09:00:00Z'),
      phien('y', 2, '2026-09-02T10:00:00Z'),
      phien('z', 4, '2026-09-02T11:00:00Z'),
    ]
    // Màn Chọn bàn và màn Bàn nhận cùng dữ liệu nhưng có thể khác thứ tự mảng.
    const a = assignTrayColors(list)
    const b = assignTrayColors([...list].reverse())
    for (const s of list) {
      expect(b.get(s.session_id)!.color.key).toBe(a.get(s.session_id)!.color.key)
      expect(b.get(s.session_id)!.index).toBe(a.get(s.session_id)!.index)
    }
  })

  it('class Tailwind viết nguyên chuỗi, không ghép động — build mới không xoá mất màu', () => {
    for (const c of TRAY_COLORS) {
      expect(c.box).toContain(`-${c.key}-`)
      expect(c.chip).toContain(`-${c.key}-`)
      expect(c.bar).toContain(`-${c.key}-`)
      expect(c.label).toContain(`-${c.key}-`)
    }
  })
})
