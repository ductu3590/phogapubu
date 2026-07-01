import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function MevoStoresPage() {
  const admin = createAdminClient()
  const { data: stores } = await admin
    .from('stores')
    .select('id, name, slug, is_active')
    .order('created_at', { ascending: false })

  const { data: appConfigs } = await admin.from('store_app_configs').select('store_id, onboarding_status, deployment_status')
  const { data: checkoutConfigs } = await admin.from('store_checkout_configs').select('store_id, is_enabled, zalo_mini_app_id')
  const { data: zaloConfigs } = await admin.from('store_zalo_configs').select('store_id, is_enabled')

  const appMap = new Map((appConfigs ?? []).map((c) => [c.store_id, c]))
  const checkoutMap = new Map((checkoutConfigs ?? []).map((c) => [c.store_id, c]))
  const zaloMap = new Map((zaloConfigs ?? []).map((c) => [c.store_id, c]))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách quán</h1>
        <Link href="/mevo/stores/new" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
          + Tạo quán mới
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Tên quán</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Mini App ID</th>
              <th className="px-4 py-3">Checkout</th>
              <th className="px-4 py-3">OA</th>
              <th className="px-4 py-3">Deploy</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(stores ?? []).map((store) => {
              const checkout = checkoutMap.get(store.id)
              const zalo = zaloMap.get(store.id)
              const app = appMap.get(store.id)
              return (
                <tr key={store.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">{store.name}</td>
                  <td className="px-4 py-3 text-gray-500">{store.slug}</td>
                  <td className="px-4 py-3 text-gray-500">{checkout?.zalo_mini_app_id ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge ok={!!checkout?.is_enabled} okLabel="Đã cấu hình" noLabel="Chưa cấu hình" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge ok={!!zalo?.is_enabled} okLabel="Đã cấu hình" noLabel="Chưa cấu hình" />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{app?.deployment_status ?? 'not_deployed'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/mevo/stores/${store.id}`} className="text-orange-500 hover:underline">Chi tiết →</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Badge({ ok, okLabel, noLabel }: { ok: boolean; okLabel: string; noLabel: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {ok ? okLabel : noLabel}
    </span>
  )
}
