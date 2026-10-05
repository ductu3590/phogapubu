import { createAdminClient } from '@/lib/supabase/server'

// Dữ liệu cho trang Tổng quan + Danh sách quán của /mevo (ST-4, bản Stitch A06/A11).
// CHỈ đọc dữ liệu đang có thật — các ô trong bản vẽ chưa có nguồn (audit log, cụm máy chủ, máy in mạng…)
// cố ý không dựng để khỏi hiện số giả.

export type MevoStoreCard = {
  id: string
  name: string
  slug: string
  address: string | null
  isActive: boolean
  paymentTiming: 'prepay' | 'postpay'
  kitchenPolicy: 'automatic' | 'pos_confirmation'
  reservationsEnabled: boolean
  tableCount: number
  openSessions: number
  miniAppId: string | null
  checkoutEnabled: boolean
  oaEnabled: boolean
  onboardingStatus: 'draft' | 'in_progress' | 'ready' | 'live' | null
  deploymentStatus: string
  lastError: string | null
  ownerCount: number
}

export type MevoOverview = {
  stores: MevoStoreCard[]
  totals: { stores: number; active: number; onboarding: number; published: number; openSessions: number; missingSetup: number }
}

export async function loadMevoOverview(): Promise<MevoOverview> {
  const admin = createAdminClient()
  const [stores, workflows, apps, checkouts, zalos, tables, sessions, operators] = await Promise.all([
    admin.from('stores').select('id, name, slug, address, is_active, payment_timing').order('created_at', { ascending: false }),
    admin.from('store_workflow_settings').select('store_id, kitchen_release_policy, reservations_enabled'),
    admin.from('store_app_configs').select('store_id, onboarding_status, deployment_status, last_error'),
    admin.from('store_checkout_configs').select('store_id, is_enabled, zalo_mini_app_id'),
    admin.from('store_zalo_configs').select('store_id, is_enabled'),
    admin.from('tables').select('store_id').eq('is_active', true),
    admin.from('table_sessions').select('store_id').eq('status', 'open'),
    admin.from('mevo_operators').select('store_id').eq('role', 'store_owner').eq('is_active', true),
  ])

  const byStore = <T extends { store_id: string | null }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.store_id, r]))
  const countBy = (rows: { store_id: string | null }[] | null) => {
    const map = new Map<string, number>()
    for (const r of rows ?? []) if (r.store_id) map.set(r.store_id, (map.get(r.store_id) ?? 0) + 1)
    return map
  }
  const workflowMap = byStore(workflows.data)
  const appMap = byStore(apps.data)
  const checkoutMap = byStore(checkouts.data)
  const zaloMap = byStore(zalos.data)
  const tableCounts = countBy(tables.data)
  const sessionCounts = countBy(sessions.data)
  const ownerCounts = countBy(operators.data)

  const cards: MevoStoreCard[] = (stores.data ?? []).map((s) => {
    const workflow = workflowMap.get(s.id)
    const app = appMap.get(s.id)
    const checkout = checkoutMap.get(s.id)
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      address: s.address ?? null,
      isActive: s.is_active !== false,
      paymentTiming: s.payment_timing === 'postpay' ? 'postpay' : 'prepay',
      kitchenPolicy: workflow?.kitchen_release_policy === 'pos_confirmation' ? 'pos_confirmation' : 'automatic',
      reservationsEnabled: workflow?.reservations_enabled === true,
      tableCount: tableCounts.get(s.id) ?? 0,
      openSessions: sessionCounts.get(s.id) ?? 0,
      miniAppId: checkout?.zalo_mini_app_id ?? null,
      checkoutEnabled: checkout?.is_enabled === true,
      oaEnabled: zaloMap.get(s.id)?.is_enabled === true,
      onboardingStatus: (app?.onboarding_status as MevoStoreCard['onboardingStatus']) ?? null,
      deploymentStatus: app?.deployment_status ?? 'not_deployed',
      lastError: app?.last_error ?? null,
      ownerCount: ownerCounts.get(s.id) ?? 0,
    }
  })

  return {
    stores: cards,
    totals: {
      stores: cards.length,
      active: cards.filter((c) => c.isActive).length,
      onboarding: cards.filter((c) => c.onboardingStatus !== 'live').length,
      published: cards.filter((c) => c.deploymentStatus === 'published').length,
      openSessions: cards.reduce((sum, c) => sum + c.openSessions, 0),
      missingSetup: cards.filter((c) => !c.miniAppId || c.ownerCount === 0).length,
    },
  }
}
