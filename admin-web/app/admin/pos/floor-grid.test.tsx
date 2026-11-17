import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { GridGroup } from '@/lib/pos-floor-grid'
import { gridAreaCounts } from '@/lib/pos-floor-grid'
import type { GridTileView } from '@/lib/pos-grid-tile'
import FloorGrid, { FloorGridFilters } from './floor-grid'

const t = (id: string, name: string) => ({ id, table_number: name, x: 0, y: 0, pos_x: 0, pos_y: 0, area_id: 'a1' })
const FREE: GridTileView = { visual: 'free', money: null, seated: null, trayIndex: null, pending: 0, heldAt: null, calling: false }
const BUSY: GridTileView = { ...FREE, visual: 'serving', money: 485000, seated: '1g12' }

const groups: GridGroup[] = [{ areaId: 'a1', name: 'A', color: 'violet', tables: [t('t1', 'Bàn A1'), t('t2', 'Bàn A2')] }]

function render(over: { views?: Record<string, GridTileView>; groups?: GridGroup[] } = {}) {
  const views = over.views ?? {}
  return renderToStaticMarkup(
    <FloorGrid
      groups={over.groups ?? groups}
      tile={id => views[id] ?? FREE}
      selectedSessionId={null}
      pickedSessionIds={new Set()}
      pickedTableIds={new Set()}
      sessionIdOf={() => null}
      reservationMode={false}
      reservationTableIds={new Set()}
      disabledReason={() => null}
      onTile={vi.fn()}
    />,
  )
}

describe('FloorGrid', () => {
  it('bố cục A: lưới liền một khối, không tiêu đề khu, thứ tự giữ theo nhóm', () => {
    const two: GridGroup[] = [
      ...groups,
      { areaId: null, name: 'Chưa phân khu', color: null, tables: [{ ...t('t9', 'Bàn X9'), area_id: null }] },
    ]
    const html = render({ groups: two })
    expect(html).not.toContain('<h3')
    expect(html).not.toContain('A · 2 bàn')
    expect(html.match(/minmax\(104px, 1fr\)/g)).toHaveLength(1)
    expect(html.indexOf('Bàn A1')).toBeLessThan(html.indexOf('Bàn A2'))
    expect(html.indexOf('Bàn A2')).toBeLessThan(html.indexOf('Bàn X9'))
  })
  it('ô có chấm màu khu 7px trước tên; bàn chưa phân khu không chấm', () => {
    const two: GridGroup[] = [
      ...groups,
      { areaId: null, name: 'Chưa phân khu', color: null, tables: [{ ...t('t9', 'Bàn X9'), area_id: null }] },
    ]
    const html = render({ groups: two })
    const tileOf = (id: string) => html.match(new RegExp(`<button[^>]*data-table-id="${id}"[\\s\\S]*?</button>`))?.[0] ?? ''
    expect(tileOf('t1')).toMatch(/size-\[7px\][^"]*bg-violet-300|bg-violet-300[^"]*size-\[7px\]/)
    expect(tileOf('t9')).not.toContain('size-[7px]')
  })
  it('ô cao 76px', () => {
    expect(render()).toContain('h-[76px]')
    expect(render()).not.toContain('h-[84px]')
  })
  it('ô có phiên hiện tiền "485.000đ" và "1g12"; ô mâm có "Mâm 2"', () => {
    const html = render({ views: { t1: { ...BUSY, trayIndex: 2 } } })
    expect(html).toContain('485.000đ')
    expect(html).toContain('1g12')
    expect(html).toContain('Mâm 2')
  })
  it('ô đang giữ hiện "Đặt 19:30"; ô trống hiện "Trống"', () => {
    const html = render({ views: { t1: { ...FREE, visual: 'booked', heldAt: '19:30' } } })
    expect(html).toContain('Đặt 19:30')
    expect(html).toContain('Trống')
  })
  it('ô chờ duyệt có nhãn "Chờ duyệt · 2"; ô gọi NV có "Gọi NV"', () => {
    const html = render({ views: { t1: { ...BUSY, visual: 'pending', pending: 2 }, t2: { ...BUSY, calling: true } } })
    expect(html).toContain('Chờ duyệt · 2')
    expect(html).toContain('Gọi NV')
  })
  it('nhãn "Gọi NV" đứng một mình màu đỏ (critical), không phải amber', () => {
    const html = render({ views: { t1: { ...BUSY, calling: true } } })
    const badge = html.match(/<span class="[^"]*">(?:<svg[\s\S]*?<\/svg>)Gọi NV<\/span>/)?.[0] ?? ''
    expect(badge).toContain('bg-red-600')
    expect(badge).not.toContain('amber')
  })
  it('ô vừa chờ duyệt vừa gọi NV: đủ "Chờ duyệt · 2", Gọi NV chỉ còn icon đỏ có aria-label', () => {
    const html = render({ views: { t1: { ...BUSY, visual: 'pending', pending: 2, calling: true } } })
    expect(html).toContain('Chờ duyệt · 2')
    expect(html).not.toContain('Gọi NV')
    const icon = html.match(/<span[^>]*aria-label="Đang gọi nhân viên"[^>]*>/)?.[0] ?? ''
    expect(icon).toContain('title="Đang gọi nhân viên"')
    expect(icon).toContain('bg-red-600')
  })
  it('groups rỗng → "Không có bàn nào khớp bộ lọc."', () => {
    expect(render({ groups: [] })).toContain('Không có bàn nào khớp bộ lọc.')
  })
  it('grid dùng repeat(auto-fill, minmax(104px, 1fr))', () => {
    expect(render()).toContain('repeat(auto-fill, minmax(104px, 1fr))')
  })
})

describe('FloorGridFilters', () => {
  it('hiện "Sắp có khách đặt" kèm số đếm; chọn khu là ô thả xuống "Tên (N)"', () => {
    const html = renderToStaticMarkup(
      <FloorGridFilters
        areaItems={gridAreaCounts([t('t1', 'Bàn A1'), t('t2', 'Bàn A2')], [{ id: 'a1', name: 'Khu A' }])}
        areaFilter="__all__"
        onArea={vi.fn()}
        counts={{ all: 2, busy: 1, free: 1, pending: 0, booked: 3 }}
        status="all"
        onStatus={vi.fn()}
        query=""
        onQuery={vi.fn()}
        trailing={<span>NutSapXep</span>}
      />,
    )
    expect(html).toContain('Sắp có khách đặt')
    expect(html).toContain('>3<')
    expect(html).toContain('<select')
    expect(html).toContain('aria-label="Lọc theo khu"')
    expect(html).toContain('>Tất cả khu (2)</option>')
    expect(html).toContain('>Khu A (2)</option>')
    expect(html).not.toContain('role="group" aria-label="Lọc theo khu"')
    expect(html).toContain('NutSapXep')
  })
})
