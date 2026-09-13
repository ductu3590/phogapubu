export type ReleasePolicy = 'automatic' | 'pos_confirmation'
export type WorkflowPresetKey = 'pubu' | 'bao_luong' | 'custom'

export interface StoreWorkflowSettings {
  paymentTiming: 'prepay' | 'postpay'
  paymentMethods: Array<'zalo_checkout' | 'cash'>
  isAcceptingOrders: boolean
  servingHours: Array<{ open: string; close: string }>
  tableOrderingEnabled: boolean
  takeawayEnabled: boolean
  shippingEnabled: boolean
  reservationsEnabled: boolean
  reservationPreorderEnabled: boolean
  minimumAdvanceMinutes: number
  bookingHorizonDays: number
  slotIntervalMinutes: number
  defaultTableCapacity: number
  planningHoldMinutes: number
  kitchenReleasePolicy: ReleasePolicy
  staffOrderReleasePolicy: ReleasePolicy
  openOrderingOnArrival: boolean
  tableSessionIdleTimeoutMinutes: number
  reservationPreorderEditCutoffMinutes: number
}

export type EffectiveWorkflowSettings = StoreWorkflowSettings & {
  effectiveReservationPreorderEnabled: boolean
}

export type WorkflowSettingChange = {
  key: keyof StoreWorkflowSettings
  label: string
  before: StoreWorkflowSettings[keyof StoreWorkflowSettings]
  after: StoreWorkflowSettings[keyof StoreWorkflowSettings]
}

const WORKFLOW_FIELD_LABELS = [
  ['paymentTiming', 'Thời điểm thanh toán'],
  ['paymentMethods', 'Phương thức thanh toán'],
  ['isAcceptingOrders', 'Đang nhận đơn'],
  ['servingHours', 'Giờ phục vụ'],
  ['tableOrderingEnabled', 'Gọi món tại bàn'],
  ['takeawayEnabled', 'Mang về'],
  ['shippingEnabled', 'Ship'],
  ['reservationsEnabled', 'Đặt bàn trước'],
  ['reservationPreorderEnabled', 'Đặt món trước theo booking'],
  ['minimumAdvanceMinutes', 'Thời gian đặt trước tối thiểu'],
  ['bookingHorizonDays', 'Khoảng ngày được đặt bàn'],
  ['slotIntervalMinutes', 'Bước chọn giờ'],
  ['defaultTableCapacity', 'Sức chứa gợi ý'],
  ['planningHoldMinutes', 'Khoảng giữ bàn kiểm tra trùng'],
  ['kitchenReleasePolicy', 'Đơn khách xuống bếp'],
  ['staffOrderReleasePolicy', 'Đơn nhân viên xuống bếp'],
  ['openOrderingOnArrival', 'Cho mọi khách trong phiên gọi thêm'],
  ['tableSessionIdleTimeoutMinutes', 'Thời gian hết hạn phiên'],
  ['reservationPreorderEditCutoffMinutes', 'Mốc khóa sửa món đặt trước'],
] as const satisfies ReadonlyArray<readonly [keyof StoreWorkflowSettings, string]>

export const PUBU_PRESET = {
  paymentTiming: 'prepay',
  paymentMethods: ['zalo_checkout'],
  isAcceptingOrders: true,
  servingHours: [],
  tableOrderingEnabled: true,
  takeawayEnabled: true,
  shippingEnabled: true,
  reservationsEnabled: false,
  reservationPreorderEnabled: false,
  minimumAdvanceMinutes: 30,
  bookingHorizonDays: 7,
  slotIntervalMinutes: 15,
  defaultTableCapacity: 6,
  planningHoldMinutes: 180,
  kitchenReleasePolicy: 'automatic',
  staffOrderReleasePolicy: 'automatic',
  openOrderingOnArrival: true,
  tableSessionIdleTimeoutMinutes: 360,
  reservationPreorderEditCutoffMinutes: 30,
} satisfies StoreWorkflowSettings

export const BAO_LUONG_PRESET = {
  ...PUBU_PRESET,
  paymentTiming: 'postpay',
  paymentMethods: ['cash'],
  servingHours: [],
  takeawayEnabled: false,
  shippingEnabled: false,
  reservationsEnabled: true,
  reservationPreorderEnabled: true,
  kitchenReleasePolicy: 'pos_confirmation',
  staffOrderReleasePolicy: 'pos_confirmation',
} satisfies StoreWorkflowSettings

function cloneWorkflowSettings(settings: StoreWorkflowSettings): StoreWorkflowSettings {
  return {
    ...settings,
    paymentMethods: [...settings.paymentMethods],
    servingHours: settings.servingHours.map((period) => ({ ...period })),
  }
}

export function applyWorkflowPreset(
  preset: Exclude<WorkflowPresetKey, 'custom'>,
): StoreWorkflowSettings {
  return cloneWorkflowSettings(preset === 'pubu' ? PUBU_PRESET : BAO_LUONG_PRESET)
}

export function normalizeWorkflowSettings(
  settings: StoreWorkflowSettings,
): EffectiveWorkflowSettings {
  const normalized = cloneWorkflowSettings(settings)
  const effectiveReservationPreorderEnabled =
    normalized.reservationsEnabled && normalized.reservationPreorderEnabled

  return {
    ...normalized,
    // Snapshot gửi xuống DB phải luôn thỏa CHECK preorder_requires_reservation.
    // Draft phía form không bị mutate nên vẫn có thể giữ ý định để bật lại trong cùng phiên sửa.
    reservationPreorderEnabled: effectiveReservationPreorderEnabled,
    effectiveReservationPreorderEnabled,
  }
}

function workflowValueEqual(
  left: StoreWorkflowSettings[keyof StoreWorkflowSettings],
  right: StoreWorkflowSettings[keyof StoreWorkflowSettings],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function getWorkflowSettingsChanges(
  baseline: StoreWorkflowSettings,
  current: StoreWorkflowSettings,
): WorkflowSettingChange[] {
  return WORKFLOW_FIELD_LABELS.flatMap(([key, label]) => {
    const before = baseline[key]
    const after = current[key]
    return workflowValueEqual(before, after) ? [] : [{ key, label, before, after }]
  })
}

export function workflowSettingsEqual(
  left: StoreWorkflowSettings,
  right: StoreWorkflowSettings,
): boolean {
  return getWorkflowSettingsChanges(left, right).length === 0
}

export function getWorkflowPresetKey(settings: StoreWorkflowSettings): WorkflowPresetKey {
  if (workflowSettingsEqual(settings, PUBU_PRESET)) return 'pubu'
  if (workflowSettingsEqual(settings, BAO_LUONG_PRESET)) return 'bao_luong'
  return 'custom'
}
