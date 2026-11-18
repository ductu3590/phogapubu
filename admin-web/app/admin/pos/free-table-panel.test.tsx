import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PosBillPanel from './bill-panel'

// Bố cục B: bấm bàn trống mở thẳng hộp gọi món, cột phải KHÔNG còn bảng "1 bàn trống" — bill panel không có bill thì không vẽ gì.
describe('PosBillPanel — không còn bảng 1 bàn trống', () => {
  it('không bill → không vẽ gì', () => {
    const html = renderToStaticMarkup(
      <PosBillPanel now={Date.now()} loadDebtCustomers={async () => ({ ok: true, customers: [] })} selected={null} picked={[]} freeTables={[{ id: 't3', table_number: 'Bàn 3' }]} moveTargets={[]} moveAreas={[]}
        onMoveTable={vi.fn()} onMoveTray={vi.fn()} otherSessions={[]} trayColors={new Map()} busy={false}
        onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onAddTable={vi.fn()}
        onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
        onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true} onRestoreOrderItem={vi.fn()} onSetDiscount={async () => true} onClearPick={vi.fn()}
        onDismiss={vi.fn()} preorders={[]} onPrintPreorder={async () => ({ ok: true })} />,
    )
    expect(html).toBe('')
  })
})
