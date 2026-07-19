import Link from 'next/link'

// SA-2: chỉ là khung đã gắn auth đúng. Màn chọn bàn/món/topping + checkout CASH/bank_transfer
// (§7 spec) sẽ dựng ở SA-3.
export default function StaffOrderPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <div className="mb-4 text-5xl">🧑‍🍳</div>
      <h1 className="text-lg font-bold text-gray-900">Màn đặt hộ</h1>
      <p className="mt-2 text-sm text-gray-500">
        Bạn đã đăng nhập đúng khu nhân viên. Chức năng chọn bàn, món và thanh toán tại quầy sẽ có ở
        bản cập nhật tới (SA-3).
      </p>
      <Link
        href="/staff/orders"
        className="mt-6 inline-block rounded-xl border border-orange-200 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
      >
        Xem đơn đang xử lý →
      </Link>
    </div>
  )
}
