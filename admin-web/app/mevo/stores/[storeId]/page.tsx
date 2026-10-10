import { createAdminClient } from '@/lib/supabase/server'
import { listAllAuthUsers } from '@/lib/supabase/auth-users'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  updateStoreBasicInfo, updateStoreColor, updateAppConfig, updateCheckoutConfig, updateZaloConfig,
} from '@/lib/actions/mevo-stores'
import AssignOwnerForm from './assign-owner-form'
import SaveForm from './save-form'
import WorkflowSettingsForm from '@/app/admin/settings/workflow-settings-form'
import {
  loadMevoWorkflowSettings,
  saveMevoWorkflowSettings,
} from '@/lib/actions/workflow-settings'
import { getGroupNotificationState, listGroupNotificationDeliveries } from '@/lib/actions/reservation-group-notifications'
import ReservationGroupNotifications from './reservation-group-notifications'
import SecretField from './secret-field'

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const admin = createAdminClient()

  const { data: store } = await admin.from('stores').select('*').eq('id', storeId).single()
  if (!store) notFound()

  const workflowSettings = await loadMevoWorkflowSettings(storeId)
  const groupNotificationState = await getGroupNotificationState(storeId)
  const groupNotificationDeliveries = await listGroupNotificationDeliveries(
    storeId,
    groupNotificationState.retryContractVerified,
  )

  const { data: appConfig } = await admin.from('store_app_configs').select('*').eq('store_id', storeId).maybeSingle()
  const { data: checkoutConfig } = await admin.from('store_checkout_configs').select('zalo_mini_app_id, zalo_checkout_secret_key, is_enabled, updated_at').eq('store_id', storeId).maybeSingle()
  const { data: zaloConfig } = await admin.from('store_zalo_configs').select('is_enabled, updated_at, zalo_oa_app_id, zalo_oa_access_token, zalo_app_secret_key').eq('store_id', storeId).maybeSingle()
  const { data: operators } = await admin.from('mevo_operators').select('user_id, role, is_active').eq('store_id', storeId)
  // Ghép email để nhìn thấy AI đang giữ quyền quán này, thay vì chỉ đếm số dòng.
  const authUsers = operators && operators.length > 0 ? await listAllAuthUsers(admin) : []
  const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? '(không rõ email)']))

  const updateInfo = updateStoreBasicInfo.bind(null, storeId)
  const updateColor = updateStoreColor.bind(null, storeId)
  const updateApp = updateAppConfig.bind(null, storeId)
  const updateCheckout = updateCheckoutConfig.bind(null, storeId)
  const updateZalo = updateZaloConfig.bind(null, storeId)
  const saveWorkflow = saveMevoWorkflowSettings.bind(null, storeId)

  return (
    <div className="flex-1 space-y-6 overflow-y-auto bg-background p-4 md:p-6">
      <h1 className="text-2xl font-bold text-foreground">{store.name}</h1>

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
        <p className="mb-3 text-sm text-muted">
          Màu chủ đạo áp cho thanh menu/nút bấm trên Mini App của quán này. Không ảnh hưởng quán khác.
        </p>
        <SaveForm action={updateColor}>
          <ColorField label="Màu chủ đạo" name="primary_color" defaultValue={store.primary_color ?? '#A0673D'} />
        </SaveForm>
      </Section>

      <Section title="Quy trình vận hành">
        <WorkflowSettingsForm
          key={storeId}
          initial={workflowSettings}
          context="mevo"
          onSave={saveWorkflow}
        />
      </Section>

      <div className="rounded-xl border border-info-border bg-info-bg p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Zalo — cấu hình tích hợp</h2>
      <div className="space-y-4">
      <Section title="Mini App / Onboarding checklist">
        <SaveForm action={updateApp}>
          <Field label="Tên Mini App (Zalo Dev)" name="zalo_mini_app_name" defaultValue={appConfig?.zalo_mini_app_name ?? ''} />
          <Field label="Zalo Mini App ID (cần cho QR bàn)" name="zalo_mini_app_id" defaultValue={appConfig?.zalo_mini_app_id ?? ''} />
          <SelectField label="Trạng thái onboarding" name="onboarding_status" defaultValue={appConfig?.onboarding_status ?? 'draft'}
            options={['draft', 'in_progress', 'ready', 'live']} />
          <SelectField label="Trạng thái deploy" name="deployment_status" defaultValue={appConfig?.deployment_status ?? 'not_deployed'}
            options={['not_deployed', 'deployed', 'submitted', 'published']} />
          <TextArea label="Ghi chú" name="notes" defaultValue={appConfig?.notes ?? ''} />
        </SaveForm>
      </Section>

      <Section title="ZaloPay Checkout">
        <p className="mb-3 text-sm text-muted">
          Chỉ dành cho quán <b>trả trước</b> (khách thanh toán trong app). Quán <b>trả sau</b> thu
          tiền tại quầy nên bỏ trống cả mục này — App ID đã nhập ở mục Mini App phía trên.
        </p>
        <p className="mb-3 text-sm text-muted">
          Trạng thái: <StatusText ok={!!checkoutConfig?.is_enabled} />
          {checkoutConfig?.updated_at && ` — cập nhật lúc ${new Date(checkoutConfig.updated_at).toLocaleString('vi-VN')}`}
        </p>
        <SaveForm action={updateCheckout}>
          <Field label="Zalo Mini App ID" name="zalo_mini_app_id" defaultValue={checkoutConfig?.zalo_mini_app_id ?? ''} required />
          <SecretField label="Checkout Secret Key (bỏ trống nếu không đổi)" name="zalo_checkout_secret_key" value={checkoutConfig?.zalo_checkout_secret_key ?? ''} />
        </SaveForm>
      </Section>

      <Section title="Official Account / Webhook">
        <p className="mb-3 text-sm text-muted">
          OA ID hiện tại: {store.zalo_oa_id ?? '—'} (sửa ở mục &quot;Thông tin quán&quot; phía trên — không phải secret)
        </p>
        <p className="mb-3 text-sm text-muted">Trạng thái secret: <StatusText ok={!!zaloConfig?.is_enabled} /></p>
        <SaveForm action={updateZalo}>
          <Field label="OA API App ID — app cha nhận webhook (không phải Mini App ID)" name="zalo_oa_app_id" defaultValue={zaloConfig?.zalo_oa_app_id ?? ''} />
          <SecretField label="OA Access Token (bỏ trống nếu không đổi)" name="zalo_oa_access_token" value={zaloConfig?.zalo_oa_access_token ?? ''} />
          <SecretField label="OA API App Secret Key — webhook (bỏ trống nếu không đổi)" name="zalo_app_secret_key" value={zaloConfig?.zalo_app_secret_key ?? ''} />
        </SaveForm>
        <ReservationGroupNotifications storeId={storeId} initialState={groupNotificationState} initialDeliveries={groupNotificationDeliveries.rows} />
      </Section>
      </div>
      </div>

      <Section title="Tài khoản chủ quán">
        {operators && operators.length > 0 ? (
          <ul className="mb-3 space-y-1.5">
            {operators.map((op) => (
              <li key={op.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className={op.is_active === false ? 'text-muted line-through' : 'text-foreground'}>
                  {emailById.get(op.user_id) ?? '(không rõ email)'}
                </span>
                <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                  {op.role === 'store_owner' ? 'Chủ quán' : op.role === 'store_staff' ? 'Nhân viên' : op.role === 'store_cashier' ? 'Thu ngân' : op.role}
                </span>
                {op.is_active === false && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted">Đã khoá</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted">Chưa gán tài khoản nào</p>
        )}
        <p className="mb-3 text-sm text-muted">
          Quên mật khẩu?{' '}
          <Link href="/mevo/accounts" className="text-primary hover:underline">
            Đặt lại ở trang Tài khoản →
          </Link>
        </p>
        <AssignOwnerForm storeId={storeId} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, name, defaultValue, required, type }: { label: string; name: string; defaultValue?: string; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/80">{label}</span>
      <input name={name} type={type ?? 'text'} defaultValue={defaultValue} required={required} className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm" />
    </label>
  )
}

function TextArea({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/80">{label}</span>
      <textarea name={name} defaultValue={defaultValue} className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm" rows={3} />
    </label>
  )
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/80">{label}</span>
      <select name={name} defaultValue={defaultValue} className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function ColorField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/80">{label}</span>
      <div className="flex items-center gap-3">
        <input type="color" name={name} defaultValue={defaultValue} className="h-10 w-16 rounded-lg border border-border-strong" />
        <span className="text-sm text-muted">{defaultValue}</span>
      </div>
    </label>
  )
}

function StatusText({ ok }: { ok: boolean }) {
  return <span className={ok ? 'font-medium text-success' : 'font-medium text-muted'}>{ok ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
}
