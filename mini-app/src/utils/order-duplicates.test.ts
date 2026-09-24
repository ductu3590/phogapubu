import { describe, expect, it } from 'vitest'
import { findOrderDuplicates } from './order-duplicates'

describe('findOrderDuplicates', () => {
  it('gộp đúng món cùng biến thể/topping và bỏ món đã hủy', () => {
    const result = findOrderDuplicates(
      [{ productId: 'ga', variantId: 'lon', toppingIds: ['ot', 'rau'], quantity: 2 }],
      [
        { id: 'preorder', orderSource: 'reservation_preorder', status: 'pending', items: [{ menuItemId: 'ga', variantId: 'lon', toppingIds: ['rau', 'ot'], quantity: 1 }] },
        { id: 'void', orderSource: 'customer_zalo', status: 'cancelled', items: [{ menuItemId: 'ga', variantId: 'lon', toppingIds: ['ot', 'rau'], quantity: 9 }] },
      ],
    )

    expect(result).toEqual([{ draftIndex: 0, alreadyOrdered: 1 }])
  })
})
