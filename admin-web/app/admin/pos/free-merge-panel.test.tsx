import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FreeMergePanel } from './bill-panel'
import ManualOrderSheet from './manual-order-sheet'

// Cột phải của chế độ "Ghép bàn trống" (Bố cục B).
const render = (tables: { id: string; table_number: string }[]) =>
  renderToStaticMarkup(<FreeMergePanel tables={tables} busy={false} onCreate={vi.fn()} onExit={vi.fn()} />)

// Nút "Ghép thành một mâm" có disabled không (lấy thẻ <button> chứa chữ đó).
const mergeDisabled = (html: string) => {
  const m = html.match(/<button[^>]*>(?:(?!<\/button>)[^])*Ghép thành một mâm/)
  expect(m).not.toBeNull()
  return /disabled=""/.test(m![0])
}

describe('FreeMergePanel', () => {
  it('0 bàn: tiêu đề, gợi ý chọn, nút ghép bị khoá, có Thoát ghép bàn', () => {
    const html = render([])
    expect(html).toContain('Ghép bàn trống thành một mâm')
    expect(html).toContain('Bấm các bàn trống trên sơ đồ để chọn.')
    expect(mergeDisabled(html)).toBe(true)
    expect(html).toContain('Thoát ghép bàn')
  })
  it('1 bàn: hiện tên bàn, nút ghép vẫn khoá', () => {
    const html = render([{ id: 't1', table_number: 'Bàn 1' }])
    expect(html).toContain('Bàn 1')
    expect(mergeDisabled(html)).toBe(true)
  })
  it('2 bàn: nút ghép mở khoá', () => {
    const html = render([{ id: 't1', table_number: 'Bàn 1' }, { id: 't2', table_number: 'Bàn 2' }])
    expect(html).toContain('Đã chọn 2 bàn')
    expect(mergeDisabled(html)).toBe(false)
  })
})

describe('FreeMergePanel — không chặn lưới', () => {
  it('không có nền mờ fixed inset-0, aside gắn nhãn Ghép bàn trống, nút X đóng ghép bàn', () => {
    const html = render([])
    expect(html).not.toContain('fixed inset-0')
    expect(html).toContain('aria-label="Ghép bàn trống"')
    expect(html).toContain('aria-label="Đóng ghép bàn"')
    expect(html).toContain('max-h-[45dvh]')
  })
})

describe('ManualOrderSheet notice', () => {
  const sheet = (notice?: string | null) => renderToStaticMarkup(
    <ManualOrderSheet tableNumber="Bàn 3" categories={[]} busy={false} onClose={vi.fn()} onSubmit={async () => true} notice={notice} />,
  )
  it('có notice thì hiện đúng chữ', () => {
    expect(sheet('Bàn này có khách đặt lúc 21:00. Vẫn mở bàn được, nhớ báo khách.')).toContain('Bàn này có khách đặt lúc 21:00. Vẫn mở bàn được, nhớ báo khách.')
  })
  it('không có notice thì không có dòng vàng', () => {
    expect(sheet()).not.toContain('role="note"')
  })
})
