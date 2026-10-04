import Page from '../../../orders/page'

// Bấm link trong ứng dụng → Đơn hàng hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: Promise<{ date?: string; unpaid?: string }> }) {
  return <Page searchParams={searchParams} />
}
