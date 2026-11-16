import ReportsScreen from './reports-screen'

type SearchParams = Promise<{ tab?: string; period?: string; from?: string; to?: string; grain?: string }>

// Trang riêng — bấm Báo cáo trên rail là mở trang này, không còn bản hộp thoại đè lên POS (2026-11-16).
export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ReportsScreen searchParams={searchParams} inModal={false} />
}
