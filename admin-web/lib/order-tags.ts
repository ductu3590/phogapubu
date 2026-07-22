// Nhãn phân loại đơn cho Admin Đơn hàng — thuần, test được.
//  • Nguồn đơn (order_source): khách tự quét QR đặt vs nhân viên đặt hộ.
//  • Loại đơn (order_type): tại bàn / mang về / ship.
// Dữ liệu đã có sẵn trên orders (mig 028 order_source, order_type từ trước).

export type OrderTag = { label: string; tone: 'source' | 'type' }

export function orderSourceTag(orderSource: string | null): OrderTag | null {
  if (orderSource === 'staff') return { label: '🧑‍🍳 Nhân viên đặt', tone: 'source' }
  if (orderSource === 'customer_zalo') return { label: '📱 Khách tự đặt', tone: 'source' }
  return null
}

export function orderTypeTag(orderType: string | null): OrderTag | null {
  if (orderType === 'dine_in') return { label: '🍽️ Tại bàn', tone: 'type' }
  if (orderType === 'pickup') return { label: '🥡 Mang về', tone: 'type' }
  if (orderType === 'delivery') return { label: '🛵 Ship', tone: 'type' }
  return null
}

// Danh sách nhãn hiển thị cho một đơn (nguồn trước, loại sau; bỏ nhãn không xác định).
export function orderTags(orderSource: string | null, orderType: string | null): OrderTag[] {
  return [orderSourceTag(orderSource), orderTypeTag(orderType)].filter(
    (t): t is OrderTag => t !== null,
  )
}
