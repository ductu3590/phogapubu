'use client'

import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Chọn ngày xem báo cáo — không cho chọn ngày tương lai (max = hôm nay giờ VN, tính ở server).
// `hardNavigate`: ở TRANG ĐẦY ĐỦ (mở thẳng URL) đổi ngày bằng tải lại trang. Điều hướng mềm ở đó bị route chặn
// @modal/(.)bills bắt → hiện thêm bản hộp thoại đè lên chính trang (lỗi 2026-10-12). Trong hộp thoại thì vẫn mềm
// để POS phía sau không bị gỡ.
export default function ReportDatePicker({ value, max, showRefresh, hardNavigate = false }: { value: string; max: string; showRefresh: boolean; hardNavigate?: boolean }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2">
      <input
        type="date" value={value} max={max} aria-label="Ngày báo cáo"
        onChange={(e) => {
          if (!e.target.value) return
          if (hardNavigate) window.location.replace(`?date=${e.target.value}`)
          else router.replace(`?date=${e.target.value}`)
        }}
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
      />
      {showRefresh && <Button type="button" icon={<RotateCw />} onClick={() => router.refresh()}>Làm mới</Button>}
    </div>
  )
}
