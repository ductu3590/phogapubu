'use client'

import { Star } from 'lucide-react'
import type { PinnableView, PosView } from '@/lib/pos-view-pref'

// Nút ghim màn mặc định của máy, đứng cạnh hàng tab POS. Tab Danh sách không ghim được → không vẽ.
// Chữ chỉ hiện từ 2xl: ở 1366 hàng tab còn chứa bộ lọc của Sơ đồ (bố cục A), dưới 2xl chỉ còn ☆/★ có aria-label + title.
export default function DefaultViewPin({
  view,
  defaultView,
  onPin,
}: {
  view: PosView
  defaultView: PinnableView
  onPin: (v: PinnableView) => void
}) {
  if (view === 'list') return null
  const pinned = view === defaultView
  const base = 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium'
  if (pinned) {
    return (
      <span className={`${base} text-amber-600`} title="Mặc định máy này">
        <Star className="size-4 fill-current" aria-hidden />
        <span className="hidden 2xl:inline">Mặc định máy này</span>
      </span>
    )
  }
  const label = 'Đặt làm mặc định máy này'
  return (
    <button
      type="button"
      onClick={() => onPin(view)}
      aria-label={label}
      title={label}
      className={`${base} text-slate-600 hover:bg-slate-100`}
    >
      <Star className="size-4" aria-hidden />
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  )
}
