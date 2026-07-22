import { createClient } from '@/lib/supabase/server'
import SettingsClient from './settings-client'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('name, logo_url, payment_methods, zalo_oa_url, address, phone, about_text, takeaway_banner_url, wifi_name, wifi_password, is_accepting_orders, serving_hours, delivery_area_note, terms_of_use')
    .eq('id', storeId)
    .single()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">⚙️ Cài đặt quán</h1>
        <p className="text-sm text-gray-500">Tên hiển thị + logo (hiện trên mini-app của khách)</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <SettingsClient
          name={store?.name ?? ''}
          logoUrl={store?.logo_url ?? null}
          paymentMethods={(store?.payment_methods as string[] | null) ?? ['zalo_checkout']}
          zaloOaUrl={(store?.zalo_oa_url as string | null) ?? ''}
          address={(store?.address as string | null) ?? ''}
          phone={(store?.phone as string | null) ?? ''}
          aboutText={(store?.about_text as string | null) ?? ''}
          takeawayBannerUrl={(store?.takeaway_banner_url as string | null) ?? null}
          wifiName={(store?.wifi_name as string | null) ?? ''}
          wifiPassword={(store?.wifi_password as string | null) ?? ''}
          isAcceptingOrders={(store?.is_accepting_orders as boolean | null) ?? true}
          servingHours={
            Array.isArray(store?.serving_hours)
              ? (store?.serving_hours as { open: string; close: string }[])
              : []
          }
          deliveryAreaNote={(store?.delivery_area_note as string | null) ?? ''}
          termsOfUse={(store?.terms_of_use as string | null) ?? ''}
        />
      </div>
    </div>
  )
}
