export type ComparableOrderItem = {
  menuItemId: string | null
  variantId?: string | null
  toppingIds?: string[]
  quantity: number
}

export type ComparableSessionOrder = {
  id: string
  orderSource: string
  status: string
  items: ComparableOrderItem[]
}

export type ComparableDraftItem = {
  productId: string
  variantId?: string | null
  toppingIds?: string[]
  quantity: number
}

// Lượt "món đặt trước" kèm đặt bàn — orders.order_source do get_table_session_bill trả về.
export const PREORDER_SOURCE = 'reservation_preorder'

function signature(item: Pick<ComparableDraftItem, 'productId' | 'variantId' | 'toppingIds'>) {
  return [item.productId, item.variantId ?? '', [...(item.toppingIds ?? [])].sort().join(',')].join('|')
}

// Nhắc khách đã ĐẶT TRƯỚC món này (kèm đặt bàn) trước khi gọi thêm đúng món đó.
// CHỈ so với lượt đặt trước: quán nhậu gọi lại cùng một món nhiều lượt là chuyện thường
// (bia, đồ nhắm) — so với mọi lượt đã gọi thì lượt thứ hai nào cũng bật hộp hỏi.
// Chỉ là cảnh báo trước khi gửi: khách VẪN có quyền gọi lại cùng món.
export function findPreorderDuplicates(
  draftItems: ComparableDraftItem[],
  sessionOrders: ComparableSessionOrder[],
): { draftIndex: number; alreadyPreordered: number }[] {
  const totals = new Map<string, number>()
  for (const order of sessionOrders) {
    if (order.orderSource !== PREORDER_SOURCE) continue
    if (order.status === 'cancelled') continue
    for (const item of order.items) {
      if (!item.menuItemId) continue
      const key = signature({ productId: item.menuItemId, variantId: item.variantId, toppingIds: item.toppingIds })
      totals.set(key, (totals.get(key) ?? 0) + item.quantity)
    }
  }
  const result: { draftIndex: number; alreadyPreordered: number }[] = []
  draftItems.forEach((item, draftIndex) => {
    const alreadyPreordered = totals.get(signature(item)) ?? 0
    if (alreadyPreordered > 0) result.push({ draftIndex, alreadyPreordered })
  })
  return result
}
