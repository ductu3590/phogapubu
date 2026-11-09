import CashbookScreen, { type CashbookSearchParams } from './cashbook-screen'

// Trang đầy đủ (mở thẳng URL / F5). Bấm từ POS thì ra bản hộp thoại ở @modal/(config)/(.)cashbook.
export default function CashbookPage({ searchParams }: { searchParams: CashbookSearchParams }) {
  return <CashbookScreen searchParams={searchParams} inModal={false} />
}
