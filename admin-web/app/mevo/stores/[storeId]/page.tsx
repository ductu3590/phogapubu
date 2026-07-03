import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import {
  updateStoreBasicInfo, updateStoreColor, updateAppConfig, updateCheckoutConfig, updateZaloConfig,
} from '@/lib/actions/mevo-stores'
import AssignOwnerForm from './assign-owner-form'
import SaveForm from './save-form'

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const admin = createAdminClient()

  const { data: store } = await admin.from('stores').select('*').eq('id', storeId).single()
  if (!store) notFound()

  const { data: appConfig } = await admin.from('store_app_configs').select('*').eq('store_id', storeId).maybeSingle()
  const { data: checkoutConfig } = await admin.from('store_checkout_configs').select('zalo_mini_app_id, is_enabled, updated_at').eq('store_id', storeId).maybeSingle()
  const { data: zaloConfig } = await admin.from('store_zalo_configs').select('is_enabled, updated_at').eq('store_id', storeId).maybeSingle()
  const { data: operators } = await admin.from('mevo_operators').select('user_id').eq('store_id', storeId)

  const updateInfo = updateStoreBasicInfo.bind(null, storeId)
  const updateColor = updateStoreColor.bind(null, storeId)
  const updateApp = updateAppConfig.bind(null, storeId)
  const updateCheckout = updateCheckoutConfig.bind(null, storeId)
  const updateZalo = updateZaloConfig.bind(null, storeId)

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>

      <Section title="Thông tin quán">
        <SaveForm action={updateInfo}>
          <Field label="Tên" name="name" defaultValue={store.name} required />
          <Field label="Điện thoại" name="phone" defaultValue={store.phone ?? ''} />
          <Field label="Địa chỉ" name="address" defaultValue={store.address ?? ''} />
          <Field label="Zalo OA ID (không phải secret)" name="zalo_oa_id" defaultValue={store.zalo_oa_id ?? ''} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={store.is_active} /> Đang hoạt động
          </label>
        </SaveForm>
      </Section>

      <Section title="Giao diện Mini App">
        <p className="mb-3 text-sm text-gray-500">
          Màu chủ đạo áp cho thanh menu/nút bấm trên Mini App của quán này. Không ảnh hưởng quán khác.
        </p>
        <SaveForm action={updateColor}>
          <ColorField label="Màu chủ đạo" name="primary_color" defaultValue={store.primary_color ?? '#A0673D'} />
        </SaveForm>
      </Section>

      <Section title="Mini App / Onboarding checklist">
        <SaveForm action={updateApp}>
          <Field label="Tên Mini App (Zalo Dev)" name="zalo_mini_app_name" defaultValue={appConfig?.zalo_mini_app_name ?? ''} />
          <SelectField label="Trạng thái onboarding" name="onboarding_status" defaultValue={appConfig?.onboarding_status ?? 'draft'}
            options={['draft', 'in_progress', 'ready', 'live']} />
          <SelectField label="Trạng thái deploy" name="deployment_status" defaultValue={appConfig?.deployment_status ?? 'not_deployed'}
            options={['not_deployed', 'deployed', 'submitted', 'published']} />
          <TextArea label="Ghi chú" name="notes" defaultValue={appConfig?.notes ?? ''} />
        </SaveForm>
      </Section>

      <Section title="ZaloPay Checkout">
        <p className="mb-3 text-sm text-gray-500">
          Trạng thái: <StatusText ok={!!checkoutConfig?.is_enabled} />
          {checkoutConfig?.updated_at && ` — cập nhật lúc ${new Date(checkoutConfig.updated_at).toLocaleString('vi-VN')}`}
        </p>
        <SaveForm action={updateCheckout}>
          <Field label="Zalo Mini App ID" name="zalo_mini_app_id" defaultValue={checkoutConfig?.zalo_mini_app_id ?? ''} required />
          <Field label="Checkout Secret Key (bỏ trống nếu không đổi)" name="zalo_checkout_secret_key" type="password" />
        </SaveForm>
      </Section>

      <Section title="Zalo OA / Webhook">
        <p className="mb-3 text-sm text-gray-500">
          OA ID hiện tại: {store.zalo_oa_id ?? '—'} (sửa ở mục &quot;Thông tin quán&quot; phía trên — không phải secret)
        </p>
        <p className="mb-3 text-sm text-gray-500">Trạng thái secret: <StatusText ok={!!zaloConfig?.is_enabled} /></p>
        <SaveForm action={updateZalo}>
          <Field label="OA Access Token (bỏ trống nếu không đổi)" name="zalo_oa_access_token" type="password" />
          <Field label="App Secret Key — webhook (bỏ trống nếu không đổi)" name="zalo_app_secret_key" type="password" />
        </SaveForm>
      </Section>

      <Section title="Tài khoản chủ quán">
        <p className="mb-3 text-sm text-gray-500">
          {operators && operators.length > 0 ? `${operators.length} tài khoản đã gán` : 'Chưa gán tài khoản nào'}
        </p>
        <AssignOwnerForm storeId={storeId} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, name, defaultValue, required, type }: { label: string; name: string; defaultValue?: string; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input name={name} type={type ?? 'text'} defaultValue={defaultValue} required={required} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </label>
  )
}

function TextArea({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <textarea name={name} defaultValue={defaultValue} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={3} />
    </label>
  )
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select name={name} defaultValue={defaultValue} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function ColorField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-3">
        <input type="color" name={name} defaultValue={defaultValue} className="h-10 w-16 rounded-lg border border-gray-300" />
        <span className="text-sm text-gray-500">{defaultValue}</span>
      </div>
    </label>
  )
}

function StatusText({ ok }: { ok: boolean }) {
  return <span className={ok ? 'font-medium text-green-600' : 'font-medium text-gray-400'}>{ok ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
}
