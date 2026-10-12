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

describe('PrintOrder — phiếu bàn ngắn gọn (2026-10-12, thay quyết định PA-5 in địa chỉ trên phiếu bàn)', () => {
  const lienBan = (s: OrderSlip) => renderToStaticMarkup(<PrintOrder slip={s} />).split('<div class="lien">')[2]
  const lienBep = (s: OrderSlip) => renderToStaticMarkup(<PrintOrder slip={s} />).split('<div class="lien">')[1]
  const day = { ...slip, storeAddress: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai', storePhone: '0826325523' }

  it('phiếu bàn KHÔNG in địa chỉ / SĐT / lời dặn dài; phiếu bếp cũng không', () => {
    const ban = lienBan(day)
    expect(ban).not.toContain('236 Bảo Lương')
    expect(ban).not.toContain('0826325523')
    expect(ban).not.toContain('KHÔNG phải hoá đơn')
    expect(lienBep(day)).not.toContain('236 Bảo Lương')
  })

  it('phiếu bàn có tên quán, bàn, ô tick, tiền lần này + cả bàn, và dòng mevo.vn', () => {
    const ban = lienBan(day)
    expect(ban).toContain('Bia lẩu Bảo Lương')
    expect(ban).toContain('Bàn 2')
    expect(ban).toContain('☐ Lẩu gà x1')
    expect(ban).toContain('Lần này')
    expect(ban).toContain('Cả bàn (tạm tính)')
    expect(ban).toContain('mevo.vn')
  })

  it('phiếu bếp không có quảng cáo MEVO', () => {
    expect(lienBep(day)).not.toContain('mevo.vn')
  })
})
