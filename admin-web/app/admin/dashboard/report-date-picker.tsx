'use client'

import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Chọn ngày xem báo cáo — không cho chọn ngày tương lai (max = hôm nay giờ VN, tính ở server).
export default function ReportDatePicker({ value, max, showRefresh }: { value: string; max: string; showRefresh: boolean }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2">
      <input
        type="date" value={value} max={max} aria-label="Ngày báo cáo"
        onChange={(e) => { if (e.target.value) router.replace(`?date=${e.target.value}`) }}
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
      />
      {showRefresh && <Button type="button" icon={<RotateCw />} onClick={() => router.refresh()}>Làm mới</Button>}
    </div>
  )
}
