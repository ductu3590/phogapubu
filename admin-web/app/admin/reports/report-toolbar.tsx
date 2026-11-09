'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { REPORT_PRESETS, type ReportPreset } from '@/lib/reports/period'
import type { ReportTab } from '@/lib/reports/tabs'

export type ReportQueryState = { tab: ReportTab; preset: ReportPreset; from: string; to: string }

/** Query mới giữ các khoá còn lại. Kỳ chọn nhanh chỉ mang `period` (tự tính lại theo hôm nay); Tuỳ chọn mang thêm from/to. */
export function reportQuery(current: ReportQueryState, patch: Partial<ReportQueryState>): string {
  const next = { ...current, ...patch }
  const q = new URLSearchParams({ tab: next.tab, period: next.preset })
  if (next.preset === 'custom') {
    q.set('from', next.from)
    q.set('to', next.to)
  }
  return q.toString()
}

/**
 * Key cho <ReportToolbar>: đổi kỳ trong HỘP THOẠI dùng router.replace — component không bị gỡ nên ô ngày nháp
 * (state copy từ props một lần) sẽ giữ ngày cũ. Gắn key theo kỳ để kỳ mới là toolbar mới.
 */
export const toolbarKey = (r: { preset: ReportPreset; from: string; to: string }): string => `${r.preset}|${r.from}|${r.to}`

// Thanh chọn kỳ + loại báo cáo + Xuất Excel. Cùng lý do với ReportDatePicker của trang Hoá đơn:
// ở TRANG ĐẦY ĐỦ đổi bằng tải cứng (điều hướng mềm bị route chặn @modal/(.)reports bắt → hộp thoại đè lên chính
// trang); trong hộp thoại thì điều hướng mềm để POS phía sau không bị gỡ.
export default function ReportToolbar({ tab, preset, from, to, today, tabs, inModal, exportHref }: {
  tab: ReportTab
  preset: ReportPreset
  from: string
  to: string
  /** Ngày kinh doanh hiện tại — `max` của ô chọn ngày. */
  today: string
  tabs: { value: ReportTab; label: string }[]
  inModal: boolean
  exportHref: string
}) {
  const router = useRouter()
  const [showCustom, setShowCustom] = useState(preset === 'custom')
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const current: ReportQueryState = { tab, preset, from, to }

  const go = (patch: Partial<ReportQueryState>) => {
    const href = `?${reportQuery(current, patch)}`
    if (inModal) router.replace(href)
    else window.location.replace(href)
  }

  const pickPreset = (value: ReportPreset) => {
    if (value === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    go({ preset: value })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Không dùng <Tabs>: 6 lựa chọn không vừa 375px mà Tabs thì cuộn ngang, giấu mất "Tuỳ chọn". Ở đây xuống dòng. */}
        <div role="group" aria-label="Kỳ báo cáo" className="flex min-w-0 flex-wrap gap-1 self-start rounded-lg bg-secondary p-1">
          {REPORT_PRESETS.map((p) => {
            const selected = (showCustom ? 'custom' : preset) === p.value
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={selected}
                onClick={() => pickPreset(p.value)}
                className={cn(
                  'h-9 cursor-pointer rounded-md px-3 text-sm font-medium whitespace-nowrap outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                  selected
                    ? 'bg-surface text-foreground shadow-[0_0_0_1px_rgb(15_23_42/0.05),0_1px_2px_rgb(15_23_42/0.08)]'
                    : 'text-foreground/70 hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <a href={exportHref} download className={cn(getButtonClasses('outline'), 'self-start whitespace-nowrap md:self-auto')}>
          <FileSpreadsheet className="size-4 text-emerald-600" aria-hidden />
          Xuất Excel
        </a>
      </div>

      {showCustom ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draftFrom && draftTo) go({ preset: 'custom', from: draftFrom, to: draftTo })
          }}
        >
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Từ ngày
            <input
              type="date" value={draftFrom} max={today} required onChange={(e) => setDraftFrom(e.target.value)}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-focus"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Đến ngày
            <input
              type="date" value={draftTo} max={today} required onChange={(e) => setDraftTo(e.target.value)}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-focus"
            />
          </label>
          <Button type="submit" variant="primary">Xem</Button>
        </form>
      ) : null}

      {/* md trở lên: tab gạch chân. Dưới md: lưới 2 cột để cả 4 loại đều đọc được ở 375px (Tabs sẽ cuộn ngang, giấu mất tab cuối). */}
      <Tabs label="Loại báo cáo" variant="underline" items={tabs} value={tab} onValueChange={(value) => go({ tab: value })} className="hidden md:block" />
      <div role="group" aria-label="Loại báo cáo (điện thoại)" className="grid grid-cols-2 gap-2 md:hidden">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={t.value === tab}
            onClick={() => go({ tab: t.value })}
            className={cn(
              'min-h-11 cursor-pointer rounded-lg border px-3 text-sm font-medium outline-hidden focus-visible:ring-2 focus-visible:ring-focus',
              t.value === tab ? 'border-primary bg-primary-light text-foreground' : 'border-border bg-surface text-foreground/70',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
