import { Skeleton, SkeletonList } from '@/components/ui/feedback'

// Khung chờ khi chuyển trang trong /admin: sidebar đứng yên, chỉ vùng nội dung thành khung chờ
// (không xoay một vòng giữa màn thay cho cả trang).
export default function AdminLoading() {
  return (
    <div className="flex-1 overflow-hidden p-4 md:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="rounded-xl border border-border bg-surface py-2">
          <SkeletonList rows={6} label="Đang tải trang" />
        </div>
      </div>
    </div>
  )
}
