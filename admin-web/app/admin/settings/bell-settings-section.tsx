'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import BellVolumeControl from '@/components/bell-volume-control'
import { previewBell, setBellStyle } from '@/lib/bell'
import { BELL_STYLES, type BellStyle } from '@/lib/bell-settings'
import { saveBellStyle } from '@/lib/actions/store'
import { cn } from '@/lib/utils'

export default function BellSettingsSection({ initial }: { initial: BellStyle }) {
  const [style, setStyle] = useState<BellStyle>(initial)
  const [saved, setSaved] = useState<BellStyle>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () => start(async () => {
    setError(null)
    const res = await saveBellStyle(style)
    if (!res.ok) { setError(res.error); return }
    setSaved(style)
    setBellStyle(style)
  })

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Kiểu chuông của quán</legend>
        {BELL_STYLES.map((s) => (
          <label key={s.value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', style === s.value ? 'border-orange-600 bg-orange-50' : 'border-border')}>
            <input type="radio" name="bell_style" value={s.value} checked={style === s.value} onChange={() => { setStyle(s.value); previewBell(s.value) }} className="mt-1 accent-orange-600" />
            <span>
              <span className="block text-sm font-medium text-foreground">{s.label}</span>
              <span className="block text-[13px] text-muted">{s.hint}</span>
            </span>
          </label>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <Button type="button" variant="primary" disabled={pending || style === saved} onClick={save}>
            {pending ? 'Đang lưu…' : 'Lưu kiểu chuông'}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : style === saved ? <p className="text-[13px] text-muted">Áp dụng cho mọi máy của quán</p> : null}
        </div>
      </fieldset>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Âm lượng trên máy này</p>
        <BellVolumeControl />
      </div>
    </div>
  )
}
