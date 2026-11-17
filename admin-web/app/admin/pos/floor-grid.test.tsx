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

function render(over: { views?: Record<string, GridTileView>; groups?: GridGroup[]; showGroupHeaders?: boolean } = {}) {
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
      showGroupHeaders={over.showGroupHeaders ?? true}
    />,
  )
}

describe('FloorGrid', () => {
  it('vẽ tiêu đề nhóm "A · 2 bàn" khi showGroupHeaders', () => {
    expect(render()).toContain('A · 2 bàn')
    expect(render({ showGroupHeaders: false })).not.toContain('A · 2 bàn')
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
  it('groups rỗng → "Không có bàn nào khớp bộ lọc."', () => {
    expect(render({ groups: [] })).toContain('Không có bàn nào khớp bộ lọc.')
  })
  it('grid dùng repeat(auto-fill, minmax(104px, 1fr))', () => {
    expect(render()).toContain('repeat(auto-fill, minmax(104px, 1fr))')
  })
})

describe('FloorGridFilters', () => {
  it('hiện "Sắp có khách đặt" kèm số đếm và nút khu có số', () => {
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
    expect(html).toContain('Khu A')
    expect(html).toContain('NutSapXep')
  })
})
