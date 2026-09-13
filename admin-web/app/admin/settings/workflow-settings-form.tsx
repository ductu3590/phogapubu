'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  applyWorkflowPreset,
  getWorkflowPresetKey,
  getWorkflowSettingsChanges,
  normalizeWorkflowSettings,
  type ReleasePolicy,
  type StoreWorkflowSettings,
  type WorkflowSettingChange,
} from '@/lib/workflow-settings'

type Props = {
  initial: StoreWorkflowSettings
  context: 'owner' | 'mevo'
  onSave: (value: StoreWorkflowSettings) => Promise<void>
}

type PaymentMethod = StoreWorkflowSettings['paymentMethods'][number]
type ServingShift = StoreWorkflowSettings['servingHours'][number]

function cloneSettings(value: StoreWorkflowSettings): StoreWorkflowSettings {
  return {
    ...value,
    paymentMethods: [...value.paymentMethods],
    servingHours: value.servingHours.map((shift) => ({ ...shift })),
  }
}

function snapshotForSave(value: StoreWorkflowSettings): StoreWorkflowSettings {
  const settings = { ...normalizeWorkflowSettings(value) }
  delete (settings as Partial<typeof settings>).effectiveReservationPreorderEnabled
  return settings
}

export default function WorkflowSettingsForm({ initial, context, onSave }: Props) {
  const [baseline, setBaseline] = useState(() => cloneSettings(initial))
  const [draft, setDraft] = useState(() => cloneSettings(initial))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const valueToSave = useMemo(() => snapshotForSave(draft), [draft])
  const changes = useMemo(
    () => getWorkflowSettingsChanges(baseline, valueToSave),
    [baseline, valueToSave],
  )
  const isDirty = changes.length > 0
  const preset = getWorkflowPresetKey(valueToSave)

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [isDirty])

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 2500)
    return () => window.clearTimeout(timer)
  }, [saved])

  const update = <Key extends keyof StoreWorkflowSettings>(
    key: Key,
    value: StoreWorkflowSettings[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const applyPreset = (key: 'pubu' | 'bao_luong') => {
    const label = key === 'pubu' ? 'Trả trước như Pubu' : 'POS kiểm soát như Bảo Lương'
    if (!window.confirm(`Điền nhanh cấu hình “${label}”? Bạn vẫn cần bấm Lưu để áp dụng.`)) return
    setDraft(applyWorkflowPreset(key))
    setError('')
    setSaved(false)
  }

  const togglePaymentMethod = (method: PaymentMethod) => {
    const hasMethod = draft.paymentMethods.includes(method)
    if (hasMethod && draft.paymentMethods.length === 1) return
    update(
      'paymentMethods',
      hasMethod
        ? draft.paymentMethods.filter((value) => value !== method)
        : [...draft.paymentMethods, method],
    )
  }

  const updateShift = (index: number, key: keyof ServingShift, value: string) => {
    update(
      'servingHours',
      draft.servingHours.map((shift, currentIndex) =>
        currentIndex === index ? { ...shift, [key]: value } : shift,
      ),
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await onSave(valueToSave)
      const savedSnapshot = cloneSettings(valueToSave)
      setDraft(savedSnapshot)
      setBaseline(cloneSettings(savedSnapshot))
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được quy trình vận hành')
    } finally {
      setSaving(false)
    }
  }

  const reservationsDisabled = !draft.reservationsEnabled
  const preorderDisabled =
    reservationsDisabled || !draft.reservationPreorderEnabled

  return (
    <form onSubmit={submit} className="space-y-5 text-gray-900">
      <div>
        <p className="text-sm text-gray-600">
          {context === 'mevo'
            ? 'Bạn đang cấu hình thay mặt quán. Mọi lần lưu đều được ghi audit với nguồn MEVO.'
            : 'Thay đổi áp dụng cho yêu cầu mới của quán và được ghi audit theo tài khoản chủ quán.'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <PresetButton
            active={preset === 'pubu'}
            onClick={() => applyPreset('pubu')}
            title="Trả trước như Pubu"
            description="Tự động vào bếp, có Mang về và Ship"
          />
          <PresetButton
            active={preset === 'bao_luong'}
            onClick={() => applyPreset('bao_luong')}
            title="POS kiểm soát như Bảo Lương"
            description="Trả sau, đặt bàn và chờ POS xác nhận"
          />
          <PresetButton
            active={preset === 'custom'}
            onClick={() => undefined}
            title="Tùy chỉnh"
            description="Chỉnh từng mục theo cách quán vận hành"
          />
        </div>
      </div>

      <ChangePreview changes={changes} />

      <WorkflowSection
        title="Kênh nhận đơn"
        description="Chọn lúc quán nhận đơn và những cách khách có thể sử dụng MEVO."
      >
        <Toggle
          name="isAcceptingOrders"
          label="Đang nhận đơn"
          description="Tắt để tạm ngừng nhận đơn mới; đặt bàn tương lai vẫn theo công tắc riêng."
          checked={draft.isAcceptingOrders}
          onChange={(checked) => update('isAcceptingOrders', checked)}
        />
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-sm font-semibold">Giờ phục vụ</p>
          <p className="mb-3 text-xs text-gray-500">
            Không có ca = mở cả ngày. Có thể thêm nhiều ca nếu quán nghỉ giữa ngày.
          </p>
          <div className="space-y-2">
            {draft.servingHours.length === 0 && (
              <p className="text-xs text-gray-400">Chưa có ca — quán mở cả ngày.</p>
            )}
            {draft.servingHours.map((shift, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={`Giờ mở ca ${index + 1}`}
                  type="time"
                  required
                  value={shift.open}
                  onChange={(event) => updateShift(index, 'open', event.target.value)}
                  className="input min-w-0 flex-1"
                />
                <span className="text-gray-400">–</span>
                <input
                  aria-label={`Giờ đóng ca ${index + 1}`}
                  type="time"
                  required
                  value={shift.close}
                  onChange={(event) => updateShift(index, 'close', event.target.value)}
                  className="input min-w-0 flex-1"
                />
                <button
                  type="button"
                  aria-label={`Xóa ca ${index + 1}`}
                  onClick={() =>
                    update(
                      'servingHours',
                      draft.servingHours.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                  className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              update('servingHours', [
                ...draft.servingHours,
                { open: '08:00', close: '22:00' },
              ])
            }
            className="mt-3 rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
          >
            + Thêm ca phục vụ
          </button>
        </div>
        <Toggle
          name="tableOrderingEnabled"
          label="Gọi món tại bàn"
          description="Khách quét QR bàn để gọi món."
          checked={draft.tableOrderingEnabled}
          onChange={(checked) => update('tableOrderingEnabled', checked)}
        />
        <Toggle
          name="takeawayEnabled"
          label="Mang về"
          description="Khách tự đến quán nhận món."
          checked={draft.takeawayEnabled}
          onChange={(checked) => update('takeawayEnabled', checked)}
        />
        <Toggle
          name="shippingEnabled"
          label="Ship"
          description="Quán nhận yêu cầu giao món."
          checked={draft.shippingEnabled}
          onChange={(checked) => update('shippingEnabled', checked)}
        />
        <Toggle
          name="reservationsEnabled"
          label="Đặt bàn trước"
          description="Khách gửi yêu cầu đặt bàn cho ngày và giờ tương lai."
          checked={draft.reservationsEnabled}
          onChange={(checked) => update('reservationsEnabled', checked)}
        />
        <Toggle
          name="reservationPreorderEnabled"
          label="Đặt món trước theo booking"
          description={
            reservationsDisabled
              ? 'Bật Đặt bàn trước để sử dụng chức năng này.'
              : 'Khách chọn món trước sau khi đặt bàn được xác nhận.'
          }
          checked={draft.reservationsEnabled && draft.reservationPreorderEnabled}
          disabled={reservationsDisabled}
          onChange={(checked) => update('reservationPreorderEnabled', checked)}
        />
      </WorkflowSection>

      <WorkflowSection
        title="Duyệt đơn và bếp"
        description="Quyết định thời điểm thu tiền và khi nào từng nguồn đơn được chuyển cho bếp."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Thời điểm thanh toán"
            value={draft.paymentTiming}
            onChange={(value) =>
              update('paymentTiming', value as StoreWorkflowSettings['paymentTiming'])
            }
            options={[
              ['prepay', 'Trả trước'],
              ['postpay', 'Trả sau'],
            ]}
          />
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Phương thức thanh toán</p>
            <div className="space-y-2">
              <Toggle
                name="paymentMethodZalo"
                label="ZaloPay"
                checked={draft.paymentMethods.includes('zalo_checkout')}
                disabled={
                  draft.paymentMethods.length === 1 &&
                  draft.paymentMethods.includes('zalo_checkout')
                }
                onChange={() => togglePaymentMethod('zalo_checkout')}
              />
              <Toggle
                name="paymentMethodCash"
                label="Tiền mặt"
                checked={draft.paymentMethods.includes('cash')}
                disabled={
                  draft.paymentMethods.length === 1 && draft.paymentMethods.includes('cash')
                }
                onChange={() => togglePaymentMethod('cash')}
              />
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PolicySelect
            label="Đơn khách xuống bếp"
            value={draft.kitchenReleasePolicy}
            onChange={(value) => update('kitchenReleasePolicy', value)}
          />
          <PolicySelect
            label="Đơn nhân viên xuống bếp"
            value={draft.staffOrderReleasePolicy}
            onChange={(value) => update('staffOrderReleasePolicy', value)}
          />
        </div>
      </WorkflowSection>

      <WorkflowSection
        title="Đặt bàn"
        description={
          reservationsDisabled
            ? 'Đang khóa vì Đặt bàn trước đã tắt. Giá trị cũ vẫn được giữ để dùng lại.'
            : 'Các giới hạn khách thấy khi chọn ngày, giờ và số người.'
        }
        disabled={reservationsDisabled}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberInput
            name="minimumAdvanceMinutes"
            label="Đặt trước tối thiểu (phút)"
            value={draft.minimumAdvanceMinutes}
            min={0}
            max={1440}
            disabled={reservationsDisabled}
            onChange={(value) => update('minimumAdvanceMinutes', value)}
          />
          <NumberInput
            name="bookingHorizonDays"
            label="Số ngày được chọn"
            value={draft.bookingHorizonDays}
            min={1}
            max={90}
            disabled={reservationsDisabled}
            onChange={(value) => update('bookingHorizonDays', value)}
          />
          <SelectInput
            label="Bước chọn giờ"
            value={String(draft.slotIntervalMinutes)}
            disabled={reservationsDisabled}
            onChange={(value) => update('slotIntervalMinutes', Number(value))}
            options={[
              ['5', '5 phút'],
              ['10', '10 phút'],
              ['15', '15 phút'],
              ['30', '30 phút'],
              ['60', '60 phút'],
            ]}
          />
          <NumberInput
            name="defaultTableCapacity"
            label="Sức chứa gợi ý (người/bàn)"
            value={draft.defaultTableCapacity}
            min={1}
            max={100}
            disabled={reservationsDisabled}
            onChange={(value) => update('defaultTableCapacity', value)}
          />
          <NumberInput
            name="planningHoldMinutes"
            label="Khoảng giữ bàn kiểm tra trùng (phút)"
            value={draft.planningHoldMinutes}
            min={15}
            max={720}
            disabled={reservationsDisabled}
            onChange={(value) => update('planningHoldMinutes', value)}
          />
        </div>
      </WorkflowSection>

      <WorkflowSection
        title="Phiên bàn/mâm"
        description="Thiết lập quyền gọi thêm và thời gian dọn phiên bị quên."
      >
        <Toggle
          name="openOrderingOnArrival"
          label="Cho mọi khách trong phiên gọi thêm"
          description="Sau khi nhận khách, mọi QR thuộc bàn/mâm có thể tạo lượt gọi món mới."
          checked={draft.openOrderingOnArrival}
          onChange={(checked) => update('openOrderingOnArrival', checked)}
        />
        <NumberInput
          name="tableSessionIdleTimeoutMinutes"
          label="Hết hạn sau khi không hoạt động (phút)"
          description="Tối thiểu 60 phút; đây là lưới an toàn, không phải giới hạn thời gian ăn."
          value={draft.tableSessionIdleTimeoutMinutes}
          min={60}
          max={1440}
          onChange={(value) => update('tableSessionIdleTimeoutMinutes', value)}
        />
      </WorkflowSection>

      <WorkflowSection
        title="Món đặt trước"
        description={
          preorderDisabled
            ? 'Bật Đặt bàn trước và Đặt món trước theo booking để chỉnh mục này.'
            : 'Khóa khách sửa hoặc hủy món khi gần tới giờ đến.'
        }
        disabled={preorderDisabled}
      >
        <NumberInput
          name="reservationPreorderEditCutoffMinutes"
          label="Khóa trước giờ đến (phút)"
          value={draft.reservationPreorderEditCutoffMinutes}
          min={0}
          max={1440}
          disabled={preorderDisabled}
          onChange={(value) => update('reservationPreorderEditCutoffMinutes', value)}
        />
      </WorkflowSection>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Đang lưu…' : 'Lưu quy trình'}
        </button>
        {saved && <span className="text-sm text-green-600">✓ Đã lưu</span>}
        {isDirty && !saving && (
          <span className="text-sm text-amber-600">Có thay đổi chưa lưu</span>
        )}
      </div>
    </form>
  )
}

function PresetButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition-colors ${
        active
          ? 'border-orange-500 bg-orange-50'
          : 'border-gray-200 bg-white hover:border-orange-200'
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-gray-500">{description}</span>
    </button>
  )
}

function ChangePreview({ changes }: { changes: WorkflowSettingChange[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Xem trước thay đổi</p>
      {changes.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Chưa có thay đổi so với lần lưu gần nhất.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {changes.map((change) => (
            <li key={change.key}>
              <span className="font-medium text-slate-800">{change.label}:</span>{' '}
              {formatValue(change.key, change.before)} → {formatValue(change.key, change.after)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatValue(
  key: keyof StoreWorkflowSettings,
  value: StoreWorkflowSettings[keyof StoreWorkflowSettings],
): string {
  if (typeof value === 'boolean') return value ? 'Bật' : 'Tắt'
  if (key === 'paymentTiming') return value === 'prepay' ? 'Trả trước' : 'Trả sau'
  if (key === 'kitchenReleasePolicy' || key === 'staffOrderReleasePolicy') {
    return value === 'automatic' ? 'Tự động' : 'Chờ POS xác nhận'
  }
  if (key === 'paymentMethods' && Array.isArray(value)) {
    return value
      .map((method) => (method === 'zalo_checkout' ? 'ZaloPay' : 'Tiền mặt'))
      .join(', ')
  }
  if (key === 'servingHours' && Array.isArray(value)) {
    const shifts = value as StoreWorkflowSettings['servingHours']
    return shifts.length === 0
      ? 'Mở cả ngày'
      : shifts.map((shift) => `${shift.open}–${shift.close}`).join(', ')
  }
  return String(value)
}

function WorkflowSection({
  title,
  description,
  disabled = false,
  children,
}: {
  title: string
  description: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`rounded-xl border border-gray-200 p-4 ${disabled ? 'bg-gray-50' : 'bg-white'}`}
    >
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      <div className={`mt-4 space-y-3 ${disabled ? 'opacity-60' : ''}`}>{children}</div>
    </section>
  )
}

function Toggle({
  name,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  name: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={`relative flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 ${
        disabled ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer bg-white'
      }`}
    >
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
      <input
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 flex-shrink-0 accent-orange-500"
      />
    </label>
  )
}

function NumberInput({
  name,
  label,
  description,
  value,
  min,
  max,
  disabled = false,
  onChange,
}: {
  name: string
  label: string
  description?: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        name={name}
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        required
        onChange={(event) => onChange(Number(event.target.value))}
        className="input disabled:cursor-not-allowed disabled:bg-gray-100"
      />
      {description && <span className="mt-1 block text-xs text-gray-500">{description}</span>}
    </label>
  )
}

function SelectInput({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="input disabled:cursor-not-allowed disabled:bg-gray-100"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function PolicySelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: ReleasePolicy
  onChange: (value: ReleasePolicy) => void
}) {
  return (
    <SelectInput
      label={label}
      value={value}
      onChange={(next) => onChange(next as ReleasePolicy)}
      options={[
        ['automatic', 'Tự động chuyển cho bếp'],
        ['pos_confirmation', 'Chờ POS xác nhận'],
      ]}
    />
  )
}
