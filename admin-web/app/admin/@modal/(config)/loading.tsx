import { SkeletonList } from '@/components/ui/feedback'

// Bấm tab là thấy khung chờ ngay trong hộp thoại, trong lúc server dựng nội dung tab.
export default function ConfigTabLoading() {
  return (
    <div className="p-6" data-loading>
      <div className="mb-5 h-7 w-56 animate-pulse rounded-md bg-slate-200" aria-hidden />
      <SkeletonList rows={6} label="Đang tải" />
    </div>
  )
}
