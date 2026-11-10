'use client'

// Giảm giá theo món / danh mục (mig 115). Ba chỗ dùng:
//   • <TargetDiscounts>   — khối trong hộp Sửa món / Sửa danh mục
//   • <DiscountOverview>  — mục "Giảm giá" ở thanh trái trang Thực đơn
//   • <DiscountRuleForm>  — form thêm/sửa dùng chung
// Ghi qua server action trả {ok,error}; trạng thái "Đang áp dụng" lấy từ server (active_ids).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import {
  addMenuDiscount,
  deleteMenuDiscount,
  setMenuDiscountActive,
  updateMenuDiscount,
} from '@/lib/actions/menu-discounts'
import {
  RULE_STATUS_LABEL,
  WEEKDAYS,
  describeSchedule,
  discountAmount,
  discountBadge,
  ruleStatus,
  vnToday,
  type DiscountType,
  type MenuDiscountRow,
  type RuleStatus,
} from '@/lib/menu/menu-discount'
import { formatVndTyping, parseVnd } from '@/lib/money'
import { formatVND } from '@/lib/utils'

const STATUS_TONE: Record<RuleStatus, string> = {
  active: 'bg-green-50 text-green-700 ring-green-200',
  off: 'bg-secondary text-muted ring-border',
  expired: 'bg-secondary text-muted ring-border',
  upcoming: 'bg-amber-50 text-amber-700 ring-amber-200',
  outside: 'bg-amber-50 text-amber-700 ring-amber-200',
}

function StatusChip({ status }: { status: RuleStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ${STATUS_TONE[status]}`}>
      {RULE_STATUS_LABEL[status]}
    </span>
  )
}

// ─── Form thêm / sửa ─────────────────────────────────────────────────────────

export function DiscountRuleForm({
  initial,
  previewPrice,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: MenuDiscountRow
  previewPrice?: number | null
  submitLabel: string
  onSubmit: (fd: FormData) => Promise<string | null> // trả lỗi hoặc null
  onCancel: () => void
}) {
  const hasSchedule = Boolean(
    initial && (initial.starts_on || initial.ends_on || initial.time_from || (initial.days_of_week?.length ?? 0) > 0),
  )
  const [type, setType] = useState<DiscountType>(initial?.discount_type ?? 'percent')
  const [value, setValue] = useState(
    initial ? (initial.discount_type === 'amount' ? formatVndTyping(String(initial.value)) : String(initial.value)) : '',
  )
  const [scheduled, setScheduled] = useState(hasSchedule)
  const [days, setDays] = useState<number[]>(initial?.days_of_week ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsedValue = parseVnd(value) ?? 0
  const sample = previewPrice && previewPrice > 0 ? previewPrice : 100_000
  const preview = parsedValue > 0 && (type === 'amount' || parsedValue <= 100) ? sample - discountAmount(sample, type, parsedValue) : null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setBusy(true)
        setError(null)
        void onSubmit(fd).then((err) => {
          setBusy(false)
          if (err) setError(err)
        })
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3"
    >
      <input type="hidden" name="discount_type" value={type} />
      <input type="hidden" name="schedule" value={scheduled ? 'scheduled' : 'always'} />

      <div className="flex gap-2">
        <div className="flex shrink-0 rounded-lg border border-border-strong p-0.5" role="group" aria-label="Kiểu giảm">
          {(['percent', 'amount'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => {
                setType(t)
                setValue('')
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${type === t ? 'bg-primary text-white' : 'text-muted hover:text-foreground'}`}
            >
              {t === 'percent' ? '%' : 'VNĐ'}
            </button>
          ))}
        </div>
        <input
          name="value"
          value={value}
          onChange={(e) => setValue(type === 'amount' ? formatVndTyping(e.target.value) : e.target.value.replace(/\D/g, '').slice(0, 3))}
          inputMode="numeric"
          required
          placeholder={type === 'percent' ? 'VD: 10' : 'VD: 5.000'}
          aria-label={type === 'percent' ? 'Phần trăm giảm' : 'Số tiền giảm'}
          className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-focus"
        />
      </div>

      <input name="name" defaultValue={initial?.name ?? ''} maxLength={60} placeholder="Tên chương trình (tuỳ chọn, VD: Happy hour)" className="input" />

      <div className="flex gap-1" role="group" aria-label="Thời gian áp dụng">
        {[
          [false, 'Luôn áp dụng'],
          [true, 'Đặt lịch'],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={scheduled === v}
            onClick={() => setScheduled(v as boolean)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${scheduled === v ? 'bg-primary text-white' : 'bg-secondary text-muted hover:text-foreground'}`}
          >
            {label as string}
          </button>
        ))}
      </div>

      {scheduled && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Từ ngày
              <input type="date" name="starts_on" defaultValue={initial?.starts_on ?? ''} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Đến hết ngày
              <input type="date" name="ends_on" defaultValue={initial?.ends_on ?? ''} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Từ giờ
              <input type="time" name="time_from" defaultValue={initial?.time_from?.slice(0, 5) ?? ''} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Đến giờ
              <input type="time" name="time_to" defaultValue={initial?.time_to?.slice(0, 5) ?? ''} className="input mt-1" />
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted">Ngày trong tuần (không chọn = mọi ngày)</p>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.value)
                return (
                  <label key={d.value} className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[13px] font-medium ${on ? 'border-primary bg-primary-light text-primary' : 'border-border-strong text-muted'}`}>
                    <input
                      type="checkbox"
                      name="days"
                      value={d.value}
                      checked={on}
                      onChange={() => setDays((prev) => (on ? prev.filter((x) => x !== d.value) : [...prev, d.value]))}
                      className="sr-only"
                    />
                    {d.label}
                  </label>
                )
              })}
            </div>
          </div>
          <p className="text-xs text-muted">
            Để trống ô nào thì không giới hạn theo ô đó. Khung giờ qua nửa đêm được (VD 22:00 → 02:00). Giờ Việt Nam.
          </p>
        </div>
      )}

      {preview !== null && (
        <p className="text-xs text-muted">
          {previewPrice ? 'Giá món' : 'VD món'} {formatVND(sample)} → <span className="font-semibold text-primary">{formatVND(preview)}</span>
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-border-strong py-2 text-sm font-medium text-foreground hover:bg-button-hover">Huỷ</button>
        <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-40">{submitLabel}</button>
      </div>
    </form>
  )
}

// ─── Một dòng chương trình ───────────────────────────────────────────────────

function RuleLine({
  rule,
  activeIds,
  targetLabel,
  previewPrice,
  onOpenTarget,
}: {
  rule: MenuDiscountRow
  activeIds: Set<string>
  targetLabel?: string
  previewPrice?: number | null
  onOpenTarget?: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const status = ruleStatus(rule, activeIds, vnToday())

  if (editing) {
    return (
      <DiscountRuleForm
        initial={rule}
        previewPrice={previewPrice}
        submitLabel="Lưu"
        onCancel={() => setEditing(false)}
        onSubmit={async (fd) => {
          const res = await updateMenuDiscount(rule.id, fd)
          if (!res.ok) return res.error
          setEditing(false)
          router.refresh()
          return null
        }}
      />
    )
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) alert(res.error)
      router.refresh()
    })

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-sm font-bold text-primary tabular">{discountBadge(rule)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words text-foreground">
          {onOpenTarget && targetLabel ? (
            <button type="button" onClick={onOpenTarget} className="hover:text-primary hover:underline" title="Mở hộp sửa">{targetLabel}</button>
          ) : (targetLabel ?? rule.name ?? 'Giảm giá')}
          {targetLabel && rule.name && <span className="font-normal text-muted"> · {rule.name}</span>}
        </p>
        <p className="text-xs text-muted">{describeSchedule(rule)}</p>
      </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
      <StatusChip status={status} />
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => run(() => setMenuDiscountActive(rule.id, !rule.is_active))}
        disabled={isPending}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${rule.is_active ? 'bg-primary' : 'bg-border-strong'} disabled:opacity-40`}
        title={rule.is_active ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}
        aria-label={rule.is_active ? 'Tắt chương trình' : 'Bật chương trình'}
      >
        <span className={`absolute top-[2px] h-5 w-5 rounded-full bg-surface shadow-sm transition-all ${rule.is_active ? 'left-[22px]' : 'left-[2px]'}`} />
      </button>
      <button type="button" onClick={() => setEditing(true)} disabled={isPending} className="rounded-lg p-1.5 text-muted hover:bg-item-hover hover:text-foreground disabled:opacity-40" title="Sửa" aria-label="Sửa giảm giá">
        <Pencil className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          if (!confirm('Xoá chương trình giảm giá này? Đơn đã đặt vẫn giữ giá đã giảm.')) return
          run(() => deleteMenuDiscount(rule.id))
        }}
        disabled={isPending}
        className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-40"
        title="Xoá"
        aria-label="Xoá giảm giá"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      </div>
    </div>
  )
}

// ─── Khối trong hộp Sửa món / Sửa danh mục ───────────────────────────────────

export function TargetDiscounts({
  target,
  rules,
  activeIds,
  previewPrice,
}: {
  target: { menuItemId: string } | { categoryId: string }
  rules: MenuDiscountRow[]
  activeIds: Set<string>
  previewPrice?: number | null
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const isItem = 'menuItemId' in target
  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <p className="font-semibold text-foreground/80">{isItem ? 'Giảm giá món' : 'Giảm giá cả danh mục'}</p>
      <p className="mt-1 text-xs text-muted">
        {isItem
          ? 'Áp cho món này (cả mọi lựa chọn giá). Có giảm giá riêng ở món thì bỏ qua giảm giá của danh mục.'
          : 'Áp cho mọi món trong danh mục, trừ món đã có giảm giá riêng đang chạy.'}{' '}
        Nhiều chương trình cùng lúc thì khách được mức giảm cao nhất, không cộng dồn. Topping giữ giá.
      </p>
      <div className="mt-3 space-y-2">
        {rules.map((r) => (
          <RuleLine key={`${r.id}:${r.is_active}:${r.value}:${r.discount_type}`} rule={r} activeIds={activeIds} previewPrice={previewPrice} />
        ))}
        {rules.length === 0 && !adding && <p className="px-1 py-2 text-center text-sm text-muted">Chưa có giảm giá.</p>}
      </div>
      {adding ? (
        <div className="mt-3">
          <DiscountRuleForm
            previewPrice={previewPrice}
            submitLabel="Thêm"
            onCancel={() => setAdding(false)}
            onSubmit={async (fd) => {
              const res = await addMenuDiscount(isItem ? { menuItemId: target.menuItemId } : { categoryId: target.categoryId }, fd)
              if (!res.ok) return res.error
              setAdding(false)
              router.refresh()
              return null
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 w-full rounded-xl border border-dashed border-primary py-2 text-sm font-semibold text-primary hover:bg-primary-light">
          + Thêm giảm giá
        </button>
      )}
    </div>
  )
}

// ─── Mục "Giảm giá" ở thanh trái ────────────────────────────────────────────

export function DiscountOverview({
  rules,
  activeIds,
  itemNames,
  categoryNames,
  itemPrices,
  onOpenItem,
  onOpenCategory,
}: {
  rules: MenuDiscountRow[]
  activeIds: Set<string>
  itemNames: Map<string, string>
  categoryNames: Map<string, string>
  itemPrices: Map<string, number>
  onOpenItem: (id: string) => void
  onOpenCategory: (id: string) => void
}) {
  const byItem = rules.filter((r) => r.menu_item_id)
  const byCategory = rules.filter((r) => r.category_id)
  const activeCount = rules.filter((r) => ruleStatus(r, activeIds, vnToday()) === 'active').length

  const section = (title: string, list: MenuDiscountRow[], kind: 'item' | 'category') => (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground/80">{title} ({list.length})</p>
      <div className="space-y-2">
        {list.map((r) => {
          const id = (kind === 'item' ? r.menu_item_id : r.category_id) as string
          const label = (kind === 'item' ? itemNames.get(id) : categoryNames.get(id)) ?? '(đã xoá)'
          return (
            <RuleLine
              key={`${r.id}:${r.is_active}:${r.value}:${r.discount_type}`}
              rule={r}
              activeIds={activeIds}
              targetLabel={label}
              previewPrice={kind === 'item' ? itemPrices.get(id) ?? null : null}
              onOpenTarget={itemNames.has(id) || categoryNames.has(id) ? () => (kind === 'item' ? onOpenItem(id) : onOpenCategory(id)) : undefined}
            />
          )
        })}
        {list.length === 0 && <p className="text-xs text-muted">Chưa có.</p>}
      </div>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <p className="font-semibold text-foreground/80">Giảm giá</p>
        <p className="text-xs text-muted">
          {activeCount} chương trình đang áp dụng. Thêm giảm giá trong hộp <b>Sửa món</b> hoặc <b>Sửa danh mục</b> (bút chì).
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {section('Theo món', byItem, 'item')}
        {section('Theo danh mục', byCategory, 'category')}
      </div>
    </div>
  )
}
