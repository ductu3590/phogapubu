'use client'

import { Star } from 'lucide-react'
import type { PinnableView, PosView } from '@/lib/pos-view-pref'

// Nút ghim màn mặc định của máy, đứng cạnh hàng tab POS. Tab Danh sách không ghim được → không vẽ.
// Chỉ có icon ☆/★, không hiện chữ ở mọi cỡ màn (anh Tú 2026-11-17). Chữ vẫn đọc được bằng trình đọc
// màn hình (sr-only) và hiện khi rê chuột (title).
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
  const base = 'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium'
  if (pinned) {
    return (
      <span className={`${base} text-amber-600`} title="Mặc định máy này">
        <Star className="size-4 fill-current" aria-hidden />
        <span className="sr-only">Mặc định máy này</span>
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
      <span className="sr-only">{label}</span>
    </button>
  )
}
