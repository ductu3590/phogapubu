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

function signature(item: Pick<ComparableDraftItem, 'productId' | 'variantId' | 'toppingIds'>) {
  return [item.productId, item.variantId ?? '', [...(item.toppingIds ?? [])].sort().join(',')].join('|')
}

// Chỉ là cảnh báo trước khi gửi: khách VẪN có quyền gọi lại cùng món.
export function findOrderDuplicates(
  draftItems: ComparableDraftItem[],
  sessionOrders: ComparableSessionOrder[],
): { draftIndex: number; alreadyOrdered: number }[] {
  const totals = new Map<string, number>()
  for (const order of sessionOrders) {
    if (order.status === 'cancelled') continue
    for (const item of order.items) {
      if (!item.menuItemId) continue
      const key = signature({ productId: item.menuItemId, variantId: item.variantId, toppingIds: item.toppingIds })
      totals.set(key, (totals.get(key) ?? 0) + item.quantity)
    }
  }
  const result: { draftIndex: number; alreadyOrdered: number }[] = []
  draftItems.forEach((item, draftIndex) => {
    const alreadyOrdered = totals.get(signature(item)) ?? 0
    if (alreadyOrdered > 0) result.push({ draftIndex, alreadyOrdered })
  })
  return result
}
