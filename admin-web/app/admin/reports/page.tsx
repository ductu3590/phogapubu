import ReportsScreen from './reports-screen'

type SearchParams = Promise<{ tab?: string; period?: string; from?: string; to?: string; grain?: string }>

// Trang đầy đủ (mở thẳng URL / F5). Bấm từ POS thì ra bản hộp thoại ở @modal/(config)/(.)reports.
export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ReportsScreen searchParams={searchParams} inModal={false} />
}
