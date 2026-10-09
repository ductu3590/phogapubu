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

describe('PrintOrder — địa chỉ quán (PA-5)', () => {
  const lienBan = (s: OrderSlip) => renderToStaticMarkup(<PrintOrder slip={s} />).split('<div class="lien">')[2]
  const lienBep = (s: OrderSlip) => renderToStaticMarkup(<PrintOrder slip={s} />).split('<div class="lien">')[1]

  it('phiếu bàn in địa chỉ dưới tên quán; phiếu bếp thì không', () => {
    const s = { ...slip, storeAddress: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai', storePhone: '0826325523' }
    const ban = lienBan(s)
    expect(ban).toContain('236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai')
    expect(ban.indexOf('Bia lẩu Bảo Lương')).toBeLessThan(ban.indexOf('236 Bảo Lương'))
    expect(ban.indexOf('236 Bảo Lương')).toBeLessThan(ban.indexOf('ĐT: 0826325523'))
    expect(lienBep(s)).not.toContain('236 Bảo Lương')
  })

  it('địa chỉ dài được phép xuống dòng trong khổ 72mm', () => {
    const ban = lienBan({ ...slip, storeAddress: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai' })
    expect(ban).toMatch(/class="diachi"/)
    expect(renderToStaticMarkup(<PrintOrder slip={slip} />)).toContain('.diachi { text-align: center; overflow-wrap: anywhere; }')
  })

  it('không có địa chỉ → không có dòng địa chỉ rỗng', () => {
    expect(lienBan({ ...slip, storeAddress: null })).not.toMatch(/class="diachi"/)
  })
})
