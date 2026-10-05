import Link from 'next/link'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { STATUS_TONE_CLASSES as STATUS_TONE, type StatusTone } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import type { MevoStoreCard } from '@/lib/mevo-overview'

// Thẻ quán theo bản Stitch A06 ("Danh sách Cơ sở Quán"): tên + trạng thái, khối định danh,
// mô hình vận hành, các mục onboarding. Chỉ hiện dữ liệu thật của quán.

const ONBOARDING: Record<NonNullable<MevoStoreCard['onboardingStatus']> | 'none', { label: string; tone: StatusTone }> = {
  live: { label: 'Đang hoạt động', tone: 'success' },
  ready: { label: 'Sẵn sàng go-live', tone: 'info' },
  in_progress: { label: 'Đang onboarding', tone: 'warning' },
  draft: { label: 'Bản nháp', tone: 'neutral' },
  none: { label: 'Chưa có hồ sơ app', tone: 'neutral' },
}

const DEPLOY: Record<string, string> = {
  published: 'Đã publish',
  deployed: 'Đã deploy',
  not_deployed: 'Chưa deploy',
  failed: 'Lỗi deploy',
}

export function storeStatus(store: Pick<MevoStoreCard, 'isActive' | 'onboardingStatus'>): { label: string; tone: StatusTone } {
  if (!store.isActive) return { label: 'Tạm dừng', tone: 'critical' }
  return ONBOARDING[store.onboardingStatus ?? 'none']
}

/** "Trả sau · Thu ngân duyệt + in phiếu · Có đặt bàn" — mô tả mô hình vận hành bằng lời. */
export function workflowSummary(store: Pick<MevoStoreCard, 'paymentTiming' | 'kitchenPolicy' | 'reservationsEnabled'>): string {
  return [
    store.paymentTiming === 'postpay' ? 'Trả sau' : 'Trả trước',
    store.kitchenPolicy === 'pos_confirmation' ? 'Thu ngân duyệt + in phiếu' : 'Màn hình bếp',
    store.reservationsEnabled ? 'Có đặt bàn' : null,
  ].filter(Boolean).join(' · ')
}

/** "Bia lẩu Bảo Lương" → "BL": chữ đầu của từ đầu + từ cuối. */
export function storeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const picked = words.length >= 2 ? [words[0], words[words.length - 1]] : words
  return picked.map((w) => w[0]).join('').toLocaleUpperCase('vi') || '?'
}

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[tone].badge)}>
      <span className={cn('size-1.5 rounded-full', STATUS_TONE[tone].dot)} aria-hidden />
      {label}
    </span>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className={cn('font-medium', ok ? 'text-emerald-700' : 'text-slate-400')}>{ok ? 'Đã có' : 'Chưa có'}</span>
    </li>
  )
}

export function StoreCard({ store }: { store: MevoStoreCard }) {
  const status = storeStatus(store)
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug text-slate-900">{store.name}</h3>
          <p className="mt-0.5 truncate text-[13px] text-slate-500">{store.address || 'Chưa nhập địa chỉ'}</p>
        </div>
        <StatusPill {...status} />
      </div>

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-[13px]">
        <div className="min-w-0">
          <dt className="text-slate-500">Slug</dt>
          <dd className="truncate font-mono font-semibold text-brand">{store.slug}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-500">Bàn · đang mở</dt>
          <dd className="font-semibold text-slate-900 tabular-nums">{store.tableCount} bàn · {store.openSessions} phiên</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Mô hình vận hành</dt>
          <dd className="font-medium text-slate-900">{workflowSummary(store)}</dd>
        </div>
      </dl>

      <ul className="mt-3 space-y-1 text-[13px]">
        <Check ok={!!store.miniAppId} label="Zalo Mini App ID" />
        <Check ok={store.ownerCount > 0} label="Tài khoản chủ quán" />
        {store.paymentTiming === 'prepay' ? <Check ok={store.checkoutEnabled} label="Thanh toán Zalo Checkout" /> : null}
        <Check ok={store.oaEnabled} label="Zalo OA (thông báo)" />
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Mini App</span>
          <span className={cn('font-medium', store.deploymentStatus === 'failed' ? 'text-red-700' : 'text-slate-900')}>
            {DEPLOY[store.deploymentStatus] ?? store.deploymentStatus}
          </span>
        </li>
      </ul>

      {store.lastError ? (
        <p className="mt-3 flex gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-[13px] text-red-800">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{store.lastError}</span>
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <Link
          href={`/mevo/stores/${store.id}`}
          className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Mở hồ sơ quán<ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}
