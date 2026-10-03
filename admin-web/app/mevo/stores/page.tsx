import { ChevronRight, Plus } from 'lucide-react'
import { Badge as StatusBadge } from '@/components/ui/badge'
import { getButtonClasses } from '@/components/ui/button-classes'
import { PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import type { StatusTone } from '@/components/ui/status'
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

  const rows = (stores ?? []).map((store) => ({
    store,
    checkout: checkoutMap.get(store.id),
    zalo: zaloMap.get(store.id),
    deploy: appMap.get(store.id)?.deployment_status ?? 'not_deployed',
  }))

  return (
    <div className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <PageHeader
          title="Danh sách quán"
          actions={<Link href="/mevo/stores/new" className={getButtonClasses('primary')}><Plus className="size-4" aria-hidden />Tạo quán mới</Link>}
        />

        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState>Chưa có quán nào. Bấm Tạo quán mới để bắt đầu.</EmptyState>
          </div>
        ) : (
          <>
            {/* Từ md: bảng đủ cột */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-xs font-medium tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tên quán</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Mini App ID</th>
                    <th className="px-4 py-3 font-medium">Checkout</th>
                    <th className="px-4 py-3 font-medium">OA</th>
                    <th className="px-4 py-3 font-medium">Deploy</th>
                    <th className="px-4 py-3"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(({ store, checkout, zalo, deploy }) => (
                    <tr key={store.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-medium text-foreground">{store.name}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-muted">{store.slug}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-muted">{checkout?.zalo_mini_app_id ?? '—'}</td>
                      <td className="px-4 py-3"><ConfigBadge ok={!!checkout?.is_enabled} /></td>
                      <td className="px-4 py-3"><ConfigBadge ok={!!zalo?.is_enabled} /></td>
                      <td className="px-4 py-3"><DeployBadge status={deploy} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/mevo/stores/${store.id}`} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
                          Chi tiết<ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Điện thoại: mỗi quán một dòng bấm được, không bảng cuộn ngang */}
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface md:hidden">
              {rows.map(({ store, checkout, zalo, deploy }) => (
                <li key={store.id}>
                  <Link href={`/mevo/stores/${store.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-item-hover">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-medium text-foreground">{store.name}</p>
                      <p className="truncate font-mono text-[13px] text-muted">{store.slug}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <ConfigBadge ok={!!checkout?.is_enabled} label="Checkout" />
                        <ConfigBadge ok={!!zalo?.is_enabled} label="OA" />
                        <DeployBadge status={deploy} />
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

const DEPLOY_LABEL: Record<string, { label: string; tone: StatusTone }> = {
  published: { label: 'Đã publish', tone: 'success' },
  deployed: { label: 'Đã deploy', tone: 'info' },
  not_deployed: { label: 'Chưa deploy', tone: 'neutral' },
  failed: { label: 'Lỗi deploy', tone: 'critical' },
}

function DeployBadge({ status }: { status: string }) {
  const item = DEPLOY_LABEL[status] ?? { label: status, tone: 'neutral' as StatusTone }
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
}

function ConfigBadge({ ok, label }: { ok: boolean; label?: string }) {
  const text = ok ? 'Đã cấu hình' : 'Chưa cấu hình'
  return <StatusBadge tone={ok ? 'success' : 'neutral'}>{label ? `${label}: ${text.toLowerCase()}` : text}</StatusBadge>
}
