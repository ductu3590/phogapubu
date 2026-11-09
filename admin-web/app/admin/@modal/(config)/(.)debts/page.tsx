import DebtsScreen from '../../../debts/debts-screen'

// Bấm link trong ứng dụng → "Công nợ" hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  return <DebtsScreen searchParams={searchParams} inModal />
}
