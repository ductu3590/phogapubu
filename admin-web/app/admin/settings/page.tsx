import { createClient } from '@/lib/supabase/server'
import SettingsClient from './settings-client'
import WorkflowSettingsForm from './workflow-settings-form'
import BellSettingsSection from './bell-settings-section'
import { parseBellStyle } from '@/lib/bell-settings'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import {
  loadOwnerWorkflowSettings,
  saveOwnerWorkflowSettings,
} from '@/lib/actions/workflow-settings'

export default async function SettingsPage() {
  const operator = await requireAdminPageOrRedirect('owner')
  const storeId = operator.storeId

  const supabase = await createClient()

  const [{ data: store }, workflowSettings] = await Promise.all([
    supabase
      .from('stores')
      .select('name, logo_url, zalo_oa_url, address, google_maps_url, phone, about_text, takeaway_banner_url, wifi_name, wifi_password, delivery_area_note, terms_of_use, bell_style')
      .eq('id', storeId)
      .single(),
    loadOwnerWorkflowSettings(),
  ])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Cài đặt quán</h1>
        <p className="text-sm text-muted">Thông tin hiển thị và quy trình vận hành</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Thông tin quán</h2>
            <SettingsClient
              name={store?.name ?? ''}
              logoUrl={store?.logo_url ?? null}
              zaloOaUrl={(store?.zalo_oa_url as string | null) ?? ''}
              address={(store?.address as string | null) ?? ''}
              googleMapsUrl={(store?.google_maps_url as string | null) ?? ''}
              phone={(store?.phone as string | null) ?? ''}
              aboutText={(store?.about_text as string | null) ?? ''}
              takeawayBannerUrl={(store?.takeaway_banner_url as string | null) ?? null}
              wifiName={(store?.wifi_name as string | null) ?? ''}
              wifiPassword={(store?.wifi_password as string | null) ?? ''}
              deliveryAreaNote={(store?.delivery_area_note as string | null) ?? ''}
              termsOfUse={(store?.terms_of_use as string | null) ?? ''}
            />
          </section>

          {/* PC: Âm thanh (2/3) + In ấn (1/3) chung một hàng cho đỡ phải cuộn */}
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-surface p-5 sm:p-6 lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Âm thanh thông báo</h2>
              <BellSettingsSection initial={parseBellStyle(store?.bell_style)} />
            </section>

            <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold text-foreground">In ấn</h2>
              <p className="mb-4 text-sm text-muted">
                In một phiếu mẫu 80mm có tên, địa chỉ, SĐT quán để canh máy in. Không tạo đơn.
              </p>
              {/* Thẻ a thường (không Link): mở tab mới, trang in tự gọi hộp thoại in. */}
              <a
                href="/print/test-slip"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                In thử
              </a>
            </section>
          </div>

          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Quy trình vận hành</h2>
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
