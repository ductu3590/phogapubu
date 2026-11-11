import { describe, expect, it } from 'vitest'
import { findPreorderDuplicates } from './order-duplicates'

const beer = { menuItemId: 'bia', variantId: 'thap', toppingIds: [] as string[], quantity: 2 }

describe('findPreorderDuplicates', () => {
  it('gộp đúng món cùng biến thể/topping của lượt đặt trước và bỏ lượt đã hủy', () => {
    const result = findPreorderDuplicates(
      [{ productId: 'ga', variantId: 'lon', toppingIds: ['ot', 'rau'], quantity: 2 }],
      [
        { id: 'preorder', orderSource: 'reservation_preorder', status: 'pending', items: [{ menuItemId: 'ga', variantId: 'lon', toppingIds: ['rau', 'ot'], quantity: 1 }] },
        { id: 'void', orderSource: 'reservation_preorder', status: 'cancelled', items: [{ menuItemId: 'ga', variantId: 'lon', toppingIds: ['ot', 'rau'], quantity: 9 }] },
      ],
    )

    expect(result).toEqual([{ draftIndex: 0, alreadyPreordered: 1 }])
  })

  it('gọi lại món đã gọi ở lượt trước (không phải đặt trước) thì KHÔNG cảnh báo', () => {
    const result = findPreorderDuplicates(
      [{ productId: 'bia', variantId: 'thap', toppingIds: [], quantity: 1 }],
      [
        { id: 'luot-1', orderSource: 'customer_zalo', status: 'confirmed', items: [beer] },
        { id: 'luot-2', orderSource: 'staff', status: 'pending', items: [beer] },
        { id: 'ghi-tay', orderSource: 'pos', status: 'pending', items: [beer] },
      ],
    )

    expect(result).toEqual([])
  })

  it('chỉ cộng số lượng của lượt đặt trước, không cộng các lượt gọi tại bàn', () => {
    const result = findPreorderDuplicates(
      [
        { productId: 'lau', quantity: 1 },
        { productId: 'bia', variantId: 'thap', toppingIds: [], quantity: 3 },
      ],
      [
        { id: 'preorder', orderSource: 'reservation_preorder', status: 'pending', items: [beer] },
        { id: 'luot-1', orderSource: 'customer_zalo', status: 'confirmed', items: [{ ...beer, quantity: 5 }] },
      ],
    )

    expect(result).toEqual([{ draftIndex: 1, alreadyPreordered: 2 }])
  })

  it('khác biến thể hoặc topping thì không coi là trùng món đặt trước', () => {
    const result = findPreorderDuplicates(
      [
        { productId: 'bia', variantId: 'coc', toppingIds: [], quantity: 1 },
        { productId: 'bia', variantId: 'thap', toppingIds: ['da'], quantity: 1 },
      ],
      [{ id: 'preorder', orderSource: 'reservation_preorder', status: 'pending', items: [beer] }],
    )

    expect(result).toEqual([])
  })
})
