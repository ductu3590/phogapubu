import { CircleCheck, Construction, Store, TriangleAlert } from 'lucide-react'
import { Banner } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createAdminClient } from '@/lib/supabase/server'

export default async function MevoDashboard() {
  const admin = createAdminClient()

  const { count: totalStores } = await admin.from('stores').select('id', { count: 'exact', head: true })
  const { data: appConfigs } = await admin.from('store_app_configs').select('onboarding_status, deployment_status, last_error, store_id')
  const { data: checkoutConfigs } = await admin.from('store_checkout_configs').select('store_id, is_enabled')
  const { data: zaloConfigs } = await admin.from('store_zalo_configs').select('store_id, is_enabled')

  const published = (appConfigs ?? []).filter((c) => c.deployment_status === 'published').length
  const onboarding = (appConfigs ?? []).filter((c) => c.onboarding_status !== 'live').length
  const missingCheckout = (totalStores ?? 0) - (checkoutConfigs ?? []).filter((c) => c.is_enabled).length
  const missingOa = (totalStores ?? 0) - (zaloConfigs ?? []).filter((c) => c.is_enabled).length
  const lastErrors = (appConfigs ?? []).filter((c) => c.last_error)

  const thieu = Math.max(missingCheckout, missingOa)

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <PageHeader title="Tổng quan" description="MEVO Onboarding Cockpit — tình trạng dựng và vận hành các quán." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Tổng số quán" value={String(totalStores ?? 0)} icon={<Store />} />
          <StatCard label="Đang onboarding" value={String(onboarding)} icon={<Construction />} />
          <StatCard label="Đã publish" value={String(published)} icon={<CircleCheck />} />
          <StatCard label="Thiếu thanh toán/OA" value={String(thieu)} icon={<TriangleAlert />} attention={thieu > 0} />
        </div>
        {lastErrors.length > 0 && (
          <Banner tone="error" title="Lỗi deploy/publish gần nhất">
            <ul className="space-y-0.5">
              {lastErrors.map((c) => (
                <li key={c.store_id}><span className="font-mono text-[13px]">{c.store_id}</span>: {c.last_error}</li>
              ))}
            </ul>
          </Banner>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, attention = false }: { label: string; value: string; icon: React.ReactNode; attention?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4', attention ? 'border-warning-border' : 'border-border')}>
      <span className={cn('grid size-9 place-items-center rounded-lg [&>svg]:size-[18px]', attention ? 'bg-warning-bg text-warning' : 'bg-secondary text-muted')} aria-hidden>
        {icon}
      </span>
      <p className="mt-3 text-2xl font-semibold text-foreground tabular">{value}</p>
      <p className="mt-0.5 text-[13px] text-muted">{label}</p>
    </div>
  )
}
