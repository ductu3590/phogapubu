import ReportsScreen from '../../../reports/reports-screen'

type SearchParams = Promise<{ tab?: string; period?: string; from?: string; to?: string; grain?: string }>

// Bấm link trong ứng dụng → "Báo cáo" hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: SearchParams }) {
  return <ReportsScreen searchParams={searchParams} inModal />
}
