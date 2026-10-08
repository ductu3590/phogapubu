import { createAdminClient, createClient } from '@/lib/supabase/server'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { generateTableQR } from '@/lib/qr'
import { pickPrintTables, type GroupArea, type GroupTable } from '@/lib/table-groups'
import QrSheet, { type QrCard } from './qr-sheet'

// Trang in QR hàng loạt (PA-3): ?area=all | <id khu> | none, hoặc ?table=<id bàn>. Chỉ chủ quán.
// QR sinh ở server bằng thư viện qrcode sẵn có — cùng URL với nút "Tải QR PNG" (lib/qr.ts).
export default async function PrintQrPage({ searchParams }: { searchParams: Promise<{ area?: string; table?: string }> }) {
  const operator = await requireAdminPageOrRedirect('owner')
  const storeId = operator.storeId
  const { area, table } = await searchParams

  const supabase = await createClient()
  const admin = createAdminClient()
  // Mini App ID: cùng thứ tự đọc như trang Bàn & QR (store_app_configs trước, checkout sau); chỉ cột ID.
  const [{ data: store }, { data: appConfig }, { data: checkoutConfig }, { data: areaRows }, { data: tableRows }] = await Promise.all([
    supabase.from('stores').select('name, slug').eq('id', storeId).single(),
    admin.from('store_app_configs').select('zalo_mini_app_id').eq('store_id', storeId).maybeSingle(),
    admin.from('store_checkout_configs').select('zalo_mini_app_id').eq('store_id', storeId).maybeSingle(),
    supabase.from('table_areas').select('id, name, color, sort_order').eq('store_id', storeId).order('sort_order'),
    supabase.from('tables').select('id, table_number, area_id, is_active').eq('store_id', storeId),
  ])
  const appId = appConfig?.zalo_mini_app_id ?? checkoutConfig?.zalo_mini_app_id ?? ''
  if (!appId) {
    return <p className="p-6 text-sm text-red-600">Quán chưa có Zalo Mini App ID nên chưa in được QR. Liên hệ MEVO.</p>
  }

  const picked = pickPrintTables((areaRows ?? []) as GroupArea[], (tableRows ?? []) as GroupTable[], area, table)
  if (!picked.ok) return <p className="p-6 text-sm text-red-600">{picked.error}</p>

  const slug = (store?.slug as string | undefined) ?? ''
  const cards: QrCard[] = await Promise.all(
    picked.groups.flatMap((g) => g.tables.map(async (t) => ({
      id: t.id,
      tableNumber: t.table_number,
      areaName: g.area?.name ?? null,
      areaColor: g.area?.color ?? null,
      qr: await generateTableQR(appId, slug, t.id),
    }))),
  )

  return <QrSheet storeName={(store?.name as string | undefined) ?? 'Quán'} title={picked.title} cards={cards} />
}
