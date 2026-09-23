import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrintOrder, { type OrderSlip } from './print-order'

const slip: OrderSlip = {
  storeName: 'Bia lẩu Bảo Lương', storePhone: null, tableLabel: 'Bàn 2',
  createdAt: '2026-09-23T12:00:00.000Z', orderNote: null, orderTotal: 120000,
  sessionTotal: 120000, orderSource: 'reservation_preorder',
  items: [{ name: 'Lẩu gà', quantity: 1, price: 120000, note: null, toppings: [], isGift: false }],
}

describe('PrintOrder — phiếu preorder Bảo Lương', () => {
  it('in giá trên liên bếp để hai liên cùng nội dung tiền, tránh phát nhầm phiếu', () => {
    const kitchenSlip = renderToStaticMarkup(<PrintOrder slip={slip} />).split('<div class="lien">')[1]
    expect(kitchenSlip).toContain('120.000')
  })
})
