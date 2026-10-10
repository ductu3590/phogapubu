'use client'

import { useSyncExternalStore } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { previewBell } from '@/lib/bell'
import { readVolume, writeVolume, DEFAULT_VOLUME } from '@/lib/bell-settings'

function store() {
  try { return window.localStorage } catch { return null }
}

// Báo cho mọi thanh trượt đang mở (Cài đặt + POS) khi âm lượng đổi — cùng đọc một chỗ localStorage.
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

// Âm lượng chuông TRÊN MÁY NÀY (localStorage) + nút Nghe thử. Lưu ngay khi kéo, không cần nút Lưu.
// Server không biết localStorage → lần vẽ phía server dùng mặc định, trình duyệt đọc giá trị thật.
export default function BellVolumeControl() {
  const volume = useSyncExternalStore(subscribe, () => readVolume(store()), () => DEFAULT_VOLUME)

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3">
        {volume === 0 ? <VolumeX className="size-5 shrink-0 text-slate-400" aria-hidden /> : <Volume2 className="size-5 shrink-0 text-slate-600" aria-hidden />}
        <span className="sr-only">Âm lượng trên máy này</span>
        <input
          type="range" min={0} max={100} step={5} value={volume}
          onChange={(e) => { writeVolume(store(), Number(e.target.value)); listeners.forEach((l) => l()) }}
          className="h-2 w-full cursor-pointer accent-orange-600"
        />
        <span className="w-11 shrink-0 text-right text-sm font-medium text-slate-700 tabular">{volume}%</span>
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-slate-500">Mỗi máy chỉnh riêng</p>
        <Button type="button" onClick={() => previewBell()}>Nghe thử</Button>
      </div>
    </div>
  )
}
