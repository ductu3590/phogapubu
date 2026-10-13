import BillsScreen from './bills-screen'

// Trang đầy đủ (mở thẳng URL / F5). Bấm từ POS thì ra bản hộp thoại ở @modal/(config)/(.)bills.
export default function BillsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <BillsScreen searchParams={searchParams} inModal={false} />
}
