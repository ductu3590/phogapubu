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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard — MEVO Onboarding Cockpit</h1>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng số quán" value={String(totalStores ?? 0)} icon="🏪" />
        <StatCard label="Đang onboarding" value={String(onboarding)} icon="🚧" />
        <StatCard label="Đã publish" value={String(published)} icon="✅" />
        <StatCard label="Thiếu thanh toán/OA" value={String(Math.max(missingCheckout, missingOa))} icon="⚠️" />
      </div>
      {lastErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-semibold text-red-700">Lỗi deploy/publish gần nhất</p>
          {lastErrors.map((c) => (
            <p key={c.store_id} className="text-sm text-red-600">{c.store_id}: {c.last_error}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-2 text-2xl">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
    </div>
  )
}
