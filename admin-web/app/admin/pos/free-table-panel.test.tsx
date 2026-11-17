import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PosBillPanel, { type PosBillPanelProps } from './bill-panel'

// Cột phải khi chọn ĐÚNG MỘT bàn trống trên tab Sơ đồ (spec 2026-11-17 §5.5).
type FreeTable = NonNullable<PosBillPanelProps['freeTable']>

const ban3: FreeTable = { id: 't3', table_number: 'Bàn 3', areaName: 'Sân vườn', laterReservationAt: null }

function panel(over: { freeTable?: FreeTable | null; pickedFreeTables?: number; reservationsEnabled?: boolean } = {}) {
  return renderToStaticMarkup(
    <PosBillPanel loadDebtCustomers={async () => ({ ok: true, customers: [] })} selected={null} picked={[]} freeTables={[]} moveTargets={[]} moveAreas={[]}
      onMoveTable={vi.fn()} onMoveTray={vi.fn()} otherSessions={[]} pickedFreeTables={over.pickedFreeTables ?? 1} trayColors={new Map()} busy={false}
      onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onCreateTray={vi.fn()} onAddTable={vi.fn()}
      onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
      onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true} onRestoreOrderItem={vi.fn()} onSetDiscount={async () => true} onClearPick={vi.fn()}
      onDismiss={vi.fn()} preorders={[]} onPrintPreorder={async () => ({ ok: true })}
      freeTable={over.freeTable === undefined ? ban3 : over.freeTable}
      reservationsEnabled={over.reservationsEnabled ?? true}
      onWalkInTable={vi.fn()} onBookTable={vi.fn()} />,
  )
}

describe('PosBillPanel — 1 bàn trống', () => {
  it('1 bàn trống: tiêu đề "Bàn 3", nhãn "Trống", nút "Gọi món & mở bàn", gợi ý ghép mâm', () => {
    const html = panel()
    expect(html).toContain('Bàn 3')
    expect(html).toContain('Trống')
    expect(html).toContain('Sân vườn')
    expect(html).toContain('Gọi món &amp; mở bàn')
    expect(html).toContain('Đặt bàn cho bàn này')
    expect(html).toContain('Bấm thêm bàn trống khác để ghép thành một mâm.')
    expect(html).toContain('Bỏ chọn')
    expect(html).not.toContain('Ghép thành một mâm<')
  })

  it('reservationsEnabled=false thì không có nút "Đặt bàn cho bàn này"', () => {
    const html = panel({ reservationsEnabled: false })
    expect(html).toContain('Gọi món &amp; mở bàn')
    expect(html).not.toContain('Đặt bàn cho bàn này')
  })

  it('có laterReservationAt → dòng "Có khách đặt 21:00"', () => {
    // 21:00 giờ Việt Nam = 14:00 UTC.
    const html = panel({ freeTable: { ...ban3, laterReservationAt: '2026-11-17T14:00:00.000Z' } })
    expect(html).toContain('Có khách đặt 21:00')
    expect(panel()).not.toContain('Có khách đặt')
  })

  it('≥2 bàn trống vẫn là bảng ghép mâm cũ dù có freeTable', () => {
    const html = panel({ pickedFreeTables: 2 })
    expect(html).toContain('Đã chọn 2 bàn trống')
    expect(html).toContain('Ghép thành một mâm')
    expect(html).not.toContain('Gọi món &amp; mở bàn')
  })

  it('không có freeTable thì không vẽ gì (như trước)', () => {
    expect(panel({ freeTable: null })).toBe('')
  })
})
