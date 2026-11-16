'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, Download, Layers, Scale, TrendingUp, Undo2, Users, Utensils, Wallet, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { cn } from '@/lib/utils'
import { REPORT_PRESETS, type ReportPreset } from '@/lib/reports/period'
import type { RevenueGrain } from '@/lib/reports/finance'
import type { ReportTab } from '@/lib/reports/tabs'

export type ReportQueryState = { tab: ReportTab; preset: ReportPreset; from: string; to: string; grain?: RevenueGrain }

/**
 * Query mới giữ các khoá còn lại. Kỳ chọn nhanh chỉ mang `period` (tự tính lại theo hôm nay); Tuỳ chọn mang thêm from/to.
 * `grain=month` chỉ đi theo tab Doanh thu (sang tab khác thì bỏ, quay lại Doanh thu là Ngày).
 */
export function reportQuery(current: ReportQueryState, patch: Partial<ReportQueryState>): string {
  const next = { ...current, ...patch }
  const q = new URLSearchParams({ tab: next.tab, period: next.preset })
  if (next.preset === 'custom') {
    q.set('from', next.from)
    q.set('to', next.to)
  }
  if (next.tab === 'revenue' && next.grain === 'month') q.set('grain', 'month')
  return q.toString()
}

const GRAINS: { value: RevenueGrain; label: string }[] = [{ value: 'day', label: 'Ngày' }, { value: 'month', label: 'Tháng' }]

const TAB_ICONS: Record<ReportTab, LucideIcon> = {
  item: Utensils, category: Layers, hour: Clock, voids: Undo2,
  revenue: TrendingUp, cashflow: Wallet, pnl: Scale, debts: Users,
}
const SALES_TABS: ReportTab[] = ['item', 'category', 'hour', 'voids']

// Nút trong thanh phân đoạn (kỳ, Ngày|Tháng): chọn = nền cam nhạt + viền.
const segBtn = 'h-9 cursor-pointer rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-focus'
const segOn = 'bg-primary-light text-primary ring-1 ring-accent-border'
const segOff = 'text-foreground/70 hover:text-foreground'

// toolbarKey sống ở lib (server component reports-screen gọi nó — hàm trong file 'use client' không gọi được từ server).
export { toolbarKey } from '@/lib/reports/toolbar-key'

// Thanh chọn kỳ + loại báo cáo + Xuất Excel. Cùng lý do với ReportDatePicker của trang Hoá đơn:
// ở TRANG ĐẦY ĐỦ đổi bằng tải cứng (điều hướng mềm bị route chặn @modal/(.)reports bắt → hộp thoại đè lên chính
// trang); trong hộp thoại thì điều hướng mềm để POS phía sau không bị gỡ.
export default function ReportToolbar({ periodText, tab, grain = 'day', preset, from, to, today, tabs, inModal, exportHref }: {
  /** Nhãn kỳ đang xem (đã định dạng) — hiện trong ô ngày. */
  periodText: string
  tab: ReportTab
  /** Chỉ tab Doanh thu: xem theo ngày hay 12 tháng. */
  grain?: RevenueGrain
  preset: ReportPreset
  from: string
  to: string
  /** Ngày kinh doanh hiện tại — `max` của ô chọn ngày. */
  today: string
  tabs: { value: ReportTab; label: string }[]
  inModal: boolean
  /** null = tab chưa có Excel: ẩn nút. */
  exportHref: string | null
}) {
  const router = useRouter()
  const [showCustom, setShowCustom] = useState(preset === 'custom')
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const current: ReportQueryState = { tab, preset, from, to, grain }

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

  const salesTabs = tabs.filter((t) => SALES_TABS.includes(t.value))
  const financeTabs = tabs.filter((t) => !SALES_TABS.includes(t.value))

  const tabButton = (t: { value: ReportTab; label: string }) => {
    const Icon = TAB_ICONS[t.value]
    const selected = t.value === tab
    return (
      <button
        key={t.value}
        type="button"
        aria-pressed={selected}
        onClick={() => go({ tab: t.value })}
        className={cn(
          'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium whitespace-nowrap outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-focus',
          selected ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
        {t.label}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Không dùng <Tabs>: 6 lựa chọn không vừa 375px mà Tabs thì cuộn ngang, giấu mất "Tuỳ chọn". Ở đây xuống dòng. */}
        <div role="group" aria-label="Kỳ báo cáo" className="flex min-w-0 flex-wrap gap-1 self-start rounded-xl border border-border bg-surface p-1">
          {REPORT_PRESETS.map((p) => {
            const selected = (showCustom ? 'custom' : preset) === p.value
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={selected}
                onClick={() => pickPreset(p.value)}
                className={cn(segBtn, selected ? segOn : segOff)}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {tab === 'revenue' ? (
            <div role="group" aria-label="Chế độ xem" className="flex gap-1 rounded-xl border border-border bg-surface p-1">
              {GRAINS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={g.value === grain}
                  onClick={() => go({ grain: g.value })}
                  className={cn(segBtn, g.value === grain ? segOn : segOff)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground outline-hidden hover:bg-button-hover focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Calendar className="size-4 text-muted" aria-hidden />
            <span className="tabular">{periodText}</span>
          </button>
          {exportHref ? (
            <a href={exportHref} download className={cn(getButtonClasses('primary'), 'whitespace-nowrap')}>
              <Download className="size-4" aria-hidden />
              Xuất Excel
            </a>
          ) : null}
        </div>
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

      {/* Một thanh tab duy nhất, xuống dòng khi hẹp (375px không cuộn ngang). Nhãn nhóm chỉ hiện từ md. */}
      <div role="group" aria-label="Loại báo cáo" className="flex flex-wrap items-center gap-1 rounded-[14px] border border-border bg-surface p-1.5">
        {salesTabs.length > 0 ? (
          <>
            <span className="hidden px-2 text-[11px] font-semibold tracking-wide text-muted uppercase md:inline">Bán hàng</span>
            {salesTabs.map(tabButton)}
          </>
        ) : null}
        {financeTabs.length > 0 ? (
          <>
            <span aria-hidden className="mx-2 hidden h-6 w-px bg-border md:block" />
            <span className="hidden px-2 text-[11px] font-semibold tracking-wide text-muted uppercase md:inline">Tài chính</span>
            {financeTabs.map(tabButton)}
          </>
        ) : null}
      </div>
    </div>
  )
}
