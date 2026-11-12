import Link from 'next/link'
import { Armchair, CircleAlert, Plus, Rocket, Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadMevoOverview } from '@/lib/mevo-overview'
import { checkPhoneProxy, summarizeZcaRelay, type InfraCheck, type ZcaDeliveryRow } from '@/lib/mevo-infra-health'
import { createAdminClient } from '@/lib/supabase/server'
import { StoreCard } from './store-card'

// Tổng quan MEVO theo bản Stitch A06: đầu trang + 4 thẻ số liệu + lưới thẻ quán.
export default async function MevoDashboard() {
  const [{ stores, totals }, infra] = await Promise.all([loadMevoOverview(), loadInfraHealth()])
  const failed = stores.filter((s) => s.lastError)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-slate-500">/mevo · MEVO Cockpit</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-900">Tổng quan nền tảng</h1>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-medium text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              {totals.active}/{totals.stores} quán đang hoạt động
            </p>
          </div>
          <Link
            href="/mevo/stores/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand/90"
          >
            <Plus className="size-4" aria-hidden />Thêm quán mới
          </Link>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tổng số quán" value={totals.stores} note={`${totals.active} đang hoạt động`} noteTone="success" icon={<Store />} />
          <Stat label="Đang onboarding" value={totals.onboarding} note="chưa go-live" noteTone="warning" icon={<Rocket />} />
          <Stat label="Phiên bàn đang mở" value={totals.openSessions} note="toàn hệ thống, lúc tải trang" noteTone="muted" icon={<Armchair />} />
          <Stat
            label="Chưa đủ hồ sơ"
            value={totals.missingSetup}
            note="thiếu Mini App ID / chủ quán"
            noteTone={totals.missingSetup > 0 ? 'critical' : 'success'}
            icon={<CircleAlert />}
            attention={totals.missingSetup > 0}
          />
        </div>

        <InfraHealth checks={infra} />

        {failed.length > 0 ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Lỗi deploy/publish gần nhất</p>
            <ul className="mt-1 space-y-0.5">
              {failed.map((s) => <li key={s.id}><span className="font-medium">{s.name}</span>: {s.lastError}</li>)}
            </ul>
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Danh sách quán</h2>
              <p className="text-[13px] text-slate-500">Mỗi quán một Mini App riêng, dùng chung lõi MEVO.</p>
            </div>
            <Link href="/mevo/stores" className="text-sm font-medium text-brand underline-offset-4 hover:underline">Xem dạng bảng</Link>
          </div>
          {stores.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Chưa có quán nào. Bấm Thêm quán mới để bắt đầu.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
              {stores.map((store) => <StoreCard key={store.id} store={store} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// Hai dịch vụ chạy trên máy đặt tại Việt Nam; máy tắt là hỏng âm thầm nên phải hiện ở đây.
async function loadInfraHealth(): Promise<InfraCheck[]> {
  const admin = createAdminClient()
  const [phone, deliveries] = await Promise.all([
    checkPhoneProxy(process.env.MEVO_PHONE_PROXY_URL, (url, init) => fetch(url, init)),
    admin
      .from('reservation_notification_deliveries')
      .select('status, created_at, queued_at, processing_started_at')
      .eq('delivery_provider', 'zca_group')
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  return [phone, summarizeZcaRelay((deliveries.data ?? []) as ZcaDeliveryRow[])]
}

const INFRA_TONE = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-700', word: 'Đang chạy' },
  down: { dot: 'bg-red-500', text: 'text-red-700', word: 'Không hoạt động' },
  unknown: { dot: 'bg-slate-400', text: 'text-slate-600', word: 'Chưa rõ' },
} as const

function InfraHealth({ checks }: { checks: InfraCheck[] }) {
  const down = checks.some((c) => c.state === 'down')
  return (
    <section
      role={down ? 'alert' : undefined}
      className={cn('rounded-xl border p-4', down ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}
    >
      <h2 className="text-sm font-semibold text-slate-900">Dịch vụ phụ trợ (máy đặt tại Việt Nam)</h2>
      <ul className="mt-2 grid gap-2 md:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-sm">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', INFRA_TONE[c.state].dot)} aria-hidden />
            <span className="min-w-0">
              <span className="font-medium text-slate-900">{c.label}</span>
              <span className={cn('ml-1.5 font-medium', INFRA_TONE[c.state].text)}>· {INFRA_TONE[c.state].word}</span>
              <span className="block text-[13px] text-slate-600">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const NOTE_TONE = {
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
  muted: 'text-slate-500',
} as const

function Stat({ label, value, note, noteTone, icon, attention = false }: {
  label: string
  value: number
  note: string
  noteTone: keyof typeof NOTE_TONE
  icon: React.ReactNode
  attention?: boolean
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm', attention ? 'border-red-200' : 'border-slate-200')}>
      <div className="min-w-0">
        <p className="text-[13px] text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold sm:text-3xl text-slate-900 tabular-nums">{value}</p>
        <p className={cn('mt-0.5 text-[13px] font-medium', NOTE_TONE[noteTone])}>{note}</p>
      </div>
      <span className={cn('hidden size-10 shrink-0 place-items-center rounded-lg sm:grid [&>svg]:size-5', attention ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-brand')} aria-hidden>
        {icon}
      </span>
    </div>
  )
}
