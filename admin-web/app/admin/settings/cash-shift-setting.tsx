'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { saveRequireCashShift } from '@/lib/actions/cash-shift'

// Công tắc "Bắt buộc mở ca" (mig 122). Lưu ngay khi gạt; lỗi (vd. còn ca đang mở mà tắt) thì trả công tắc về cũ.
export default function CashShiftSetting({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, startSave] = useTransition()

  const toggle = (next: boolean) => {
    const previous = enabled
    setEnabled(next)
    setError(null)
    setJustSaved(false)
    startSave(async () => {
      const res = await saveRequireCashShift(next)
      if (!res.ok) {
        setEnabled(previous)
        setError(res.error)
        return
      }
      setEnabled(res.requireCashShift)
      setJustSaved(true)
    })
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Ca thu ngân</h2>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="text-sm font-medium text-foreground">Bắt buộc mở ca trước khi thu tiền</span>
        <Switch
          checked={enabled}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          aria-label="Bắt buộc mở ca trước khi thu tiền"
        />
      </label>
      <p className="mt-2 text-[13px] text-muted">
        Bật thì thu ngân phải mở ca mới thu được tiền. Cuối ca đếm két và in phiếu bàn giao.
      </p>
      <div className="mt-2 min-h-5" aria-live="polite">
        {error ? <p className="text-sm text-red-600">{error}</p>
          : pending ? <p className="text-[13px] text-muted">Đang lưu…</p>
            : justSaved ? <p className="text-[13px] text-muted">Đã lưu</p> : null}
      </div>
    </section>
  )
}
