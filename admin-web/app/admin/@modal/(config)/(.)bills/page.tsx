import Page from '../../../bills/page'

// Bấm link trong ứng dụng → "Hoá đơn & Báo cáo" hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <Page searchParams={searchParams} />
}
