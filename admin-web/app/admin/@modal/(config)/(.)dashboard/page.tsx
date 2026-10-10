import Page from '../../../dashboard/page'

// Bấm link trong ứng dụng → Báo cáo ngày hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <Page searchParams={searchParams} />
}
