'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { saveBusinessDayStart } from '@/lib/actions/business-day'
import { BUSINESS_DAY_START_OPTIONS } from '@/lib/daily-report'

export default function BusinessDaySection({ initial }: { initial: string }) {
  const [start, setStart] = useState(initial)
  const [savedValue, setSavedValue] = useState(initial)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startSave] = useTransition()

  const save = () => startSave(async () => {
    setError(null)
    setJustSaved(false)
    const res = await saveBusinessDayStart(start)
    if (!res.ok) { setError(res.error); return }
    setSavedValue(start)
    setJustSaved(true)
  })

  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Ngày kinh doanh</h2>
      <label className="block max-w-xs">
        <span className="mb-1 block text-sm font-medium text-foreground">Giờ bắt đầu ngày</span>
        <select
          value={start}
          onChange={(e) => { setStart(e.target.value); setError(null); setJustSaved(false) }}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
        >
          {BUSINESS_DAY_START_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <p className="mt-2 text-[13px] text-muted">
        Giao dịch trước giờ này tính vào ngày hôm trước. Đổi giờ thì báo cáo cũ cũng tính lại theo mốc mới.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="primary" disabled={pending || start === savedValue} onClick={save}>
          {pending ? 'Đang lưu…' : 'Lưu giờ bắt đầu ngày'}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : justSaved ? <p className="text-[13px] text-muted">Đã lưu</p> : null}
      </div>
    </section>
  )
}
