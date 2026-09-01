import { describe, it, expect } from 'vitest'
import { buildCartItemId } from './cart-key'

// Khoá dòng giỏ quyết định món nào gộp với món nào. Sai khoá = khách chọn
// đĩa to rồi chọn đĩa nhỏ lại bị cộng dồn thành 2 đĩa to → tính sai tiền.
const mon = (over: Partial<Parameters<typeof buildCartItemId>[0]> = {}) => ({
  productId: 'pho-ga',
  selectedVariants: [],
  ...over,
})

describe('buildCartItemId', () => {
  it('món thường: khoá là chính productId', () => {
    expect(buildCartItemId(mon())).toBe('pho-ga')
  })

  it('hai biến thể khác nhau cho ra hai khoá khác nhau', () => {
    const to = buildCartItemId(mon({ variant: { id: 'v-to', name: 'Đĩa to', price: 80000 } }))
    const nho = buildCartItemId(mon({ variant: { id: 'v-nho', name: 'Đĩa nhỏ', price: 50000 } }))
    expect(to).not.toBe(nho)
  })

  it('cùng biến thể cùng topping cho ra cùng khoá (để gộp số lượng)', () => {
    const a = mon({
      variant: { id: 'v-to', name: 'Đĩa to', price: 80000 },
      selectedVariants: [{ groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'Trứng', extraPrice: 10000 }],
    })
    expect(buildCartItemId(a)).toBe(buildCartItemId({ ...a }))
  })

  it('thứ tự tích topping không làm đổi khoá', () => {
    const t1 = { groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'A', extraPrice: 0 }
    const t2 = { groupId: 'topping', groupTitle: 'Topping', optionId: 't2', optionName: 'B', extraPrice: 0 }
    expect(buildCartItemId(mon({ selectedVariants: [t1, t2] })))
      .toBe(buildCartItemId(mon({ selectedVariants: [t2, t1] })))
  })

  it('cùng biến thể khác topping = hai dòng riêng', () => {
    const v = { id: 'v-to', name: 'Đĩa to', price: 80000 }
    const a = buildCartItemId(mon({ variant: v, selectedVariants: [] }))
    const b = buildCartItemId(mon({
      variant: v,
      selectedVariants: [{ groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'Trứng', extraPrice: 10000 }],
    }))
    expect(a).not.toBe(b)
  })

  it('món có topping nhưng KHÔNG biến thể: giữ đúng khoá cũ để không phá giỏ đã lưu', () => {
    // Khoá cũ (trước khi có biến thể) là `${productId}|${toppingIds}`.
    // Đổi format = giỏ khách đang lưu trong 6h sẽ đẻ dòng trùng khi thêm lại cùng món.
    const key = buildCartItemId(mon({
      selectedVariants: [
        { groupId: 'topping', groupTitle: 'Topping', optionId: 't2', optionName: 'B', extraPrice: 0 },
        { groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'A', extraPrice: 0 },
      ],
    }))
    expect(key).toBe('pho-ga|t1,t2')
  })

  it('đoạn biến thể không lẫn với đoạn topping', () => {
    const theoBienThe = buildCartItemId(mon({ variant: { id: 'x', name: 'To', price: 1 } }))
    const theoTopping = buildCartItemId(mon({
      selectedVariants: [{ groupId: 'topping', groupTitle: 'Topping', optionId: 'x', optionName: 'X', extraPrice: 0 }],
    }))
    expect(theoBienThe).not.toBe(theoTopping)
  })
})
