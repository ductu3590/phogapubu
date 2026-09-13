import { createClient } from '@/lib/supabase/server'
import SettingsClient from './settings-client'
import WorkflowSettingsForm from './workflow-settings-form'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import {
  loadOwnerWorkflowSettings,
  saveOwnerWorkflowSettings,
} from '@/lib/actions/workflow-settings'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()

  const [{ data: store }, workflowSettings] = await Promise.all([
    supabase
      .from('stores')
      .select('name, logo_url, zalo_oa_url, address, phone, about_text, takeaway_banner_url, wifi_name, wifi_password, delivery_area_note, terms_of_use')
      .eq('id', storeId)
      .single(),
    loadOwnerWorkflowSettings(),
  ])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">⚙️ Cài đặt quán</h1>
        <p className="text-sm text-gray-500">Thông tin hiển thị và quy trình vận hành</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Thông tin quán</h2>
            <SettingsClient
              name={store?.name ?? ''}
              logoUrl={store?.logo_url ?? null}
              zaloOaUrl={(store?.zalo_oa_url as string | null) ?? ''}
              address={(store?.address as string | null) ?? ''}
              phone={(store?.phone as string | null) ?? ''}
              aboutText={(store?.about_text as string | null) ?? ''}
              takeawayBannerUrl={(store?.takeaway_banner_url as string | null) ?? null}
              wifiName={(store?.wifi_name as string | null) ?? ''}
              wifiPassword={(store?.wifi_password as string | null) ?? ''}
              deliveryAreaNote={(store?.delivery_area_note as string | null) ?? ''}
              termsOfUse={(store?.terms_of_use as string | null) ?? ''}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Quy trình vận hành</h2>
            <WorkflowSettingsForm
              key={storeId}
              initial={workflowSettings}
              context="owner"
              onSave={saveOwnerWorkflowSettings}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
