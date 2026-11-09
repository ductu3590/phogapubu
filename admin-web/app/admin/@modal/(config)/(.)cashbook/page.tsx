import CashbookScreen, { type CashbookSearchParams } from '../../../cashbook/cashbook-screen'

// Bấm link trong ứng dụng → "Sổ thu chi" hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: CashbookSearchParams }) {
  return <CashbookScreen searchParams={searchParams} inModal />
}
