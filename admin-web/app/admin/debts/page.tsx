import DebtsScreen from './debts-screen'

// Trang đầy đủ (mở thẳng URL / F5). Bấm từ POS thì ra bản hộp thoại ở @modal/(config)/(.)debts.
// /admin/debts?customer=<id> mở thẳng ngăn kéo khách đó (báo cáo Công nợ dẫn sang).
export default function DebtsPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  return <DebtsScreen searchParams={searchParams} inModal={false} />
}
