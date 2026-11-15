'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeWorkflowSettings,
  type StoreWorkflowSettings,
} from '@/lib/workflow-settings'

type WorkflowRpcPayload = {
  payment_timing: StoreWorkflowSettings['paymentTiming']
  payment_methods: StoreWorkflowSettings['paymentMethods']
  is_accepting_orders: boolean
  serving_hours: StoreWorkflowSettings['servingHours']
  table_ordering_enabled: boolean
  takeaway_enabled: boolean
  shipping_enabled: boolean
  reservations_enabled: boolean
  reservation_preorder_enabled: boolean
  minimum_advance_minutes: number
  booking_horizon_days: number
  slot_interval_minutes: number
  default_table_capacity: number
  planning_hold_minutes: number
  kitchen_release_policy: StoreWorkflowSettings['kitchenReleasePolicy']
  staff_order_release_policy: StoreWorkflowSettings['staffOrderReleasePolicy']
  open_ordering_on_arrival: boolean
  table_session_idle_timeout_minutes: number
  reservation_preorder_edit_cutoff_minutes: number
}

function toWorkflowRpcPayload(input: StoreWorkflowSettings): WorkflowRpcPayload {
  const settings = normalizeWorkflowSettings(input)

  return {
    payment_timing: settings.paymentTiming,
    payment_methods: settings.paymentMethods,
    is_accepting_orders: settings.isAcceptingOrders,
    serving_hours: settings.servingHours,
    table_ordering_enabled: settings.tableOrderingEnabled,
    takeaway_enabled: settings.takeawayEnabled,
    shipping_enabled: settings.shippingEnabled,
    reservations_enabled: settings.reservationsEnabled,
    reservation_preorder_enabled: settings.reservationPreorderEnabled,
    minimum_advance_minutes: settings.minimumAdvanceMinutes,
    booking_horizon_days: settings.bookingHorizonDays,
    slot_interval_minutes: settings.slotIntervalMinutes,
    default_table_capacity: settings.defaultTableCapacity,
    planning_hold_minutes: settings.planningHoldMinutes,
    kitchen_release_policy: settings.kitchenReleasePolicy,
    staff_order_release_policy: settings.staffOrderReleasePolicy,
    open_ordering_on_arrival: settings.openOrderingOnArrival,
    table_session_idle_timeout_minutes: settings.tableSessionIdleTimeoutMinutes,
    reservation_preorder_edit_cutoff_minutes:
      settings.reservationPreorderEditCutoffMinutes,
  }
}

function fromWorkflowRpcPayload(payload: WorkflowRpcPayload): StoreWorkflowSettings {
  return {
    paymentTiming: payload.payment_timing,
    paymentMethods: payload.payment_methods,
    isAcceptingOrders: payload.is_accepting_orders,
    servingHours: payload.serving_hours,
    tableOrderingEnabled: payload.table_ordering_enabled,
    takeawayEnabled: payload.takeaway_enabled,
    shippingEnabled: payload.shipping_enabled,
    reservationsEnabled: payload.reservations_enabled,
    reservationPreorderEnabled: payload.reservation_preorder_enabled,
    minimumAdvanceMinutes: payload.minimum_advance_minutes,
    bookingHorizonDays: payload.booking_horizon_days,
    slotIntervalMinutes: payload.slot_interval_minutes,
    defaultTableCapacity: payload.default_table_capacity,
    planningHoldMinutes: payload.planning_hold_minutes,
    kitchenReleasePolicy: payload.kitchen_release_policy,
    staffOrderReleasePolicy: payload.staff_order_release_policy,
    openOrderingOnArrival: payload.open_ordering_on_arrival,
    tableSessionIdleTimeoutMinutes: payload.table_session_idle_timeout_minutes,
    reservationPreorderEditCutoffMinutes:
      payload.reservation_preorder_edit_cutoff_minutes,
  }
}

async function requireOwnerStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner') {
    throw new Error('Chỉ chủ quán mới thao tác được ở đây')
  }
  return operator.storeId
}

async function requireMevoSuperadmin(): Promise<void> {
  const operator = await requireOperator()
  if (operator.role !== 'mevo_superadmin') {
    throw new Error('Chỉ MEVO superadmin mới thao tác được ở đây')
  }
}

async function loadWorkflowSettings(storeId: string): Promise<StoreWorkflowSettings> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_store_workflow_settings', {
    p_store_id: storeId,
  })

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Không tìm thấy cấu hình quy trình của quán')

  return fromWorkflowRpcPayload(data as WorkflowRpcPayload)
}

export type SaveWorkflowResult = { ok: true } | { ok: false; error: string }

async function saveWorkflowSettings(
  storeId: string,
  input: StoreWorkflowSettings,
  changedVia: 'owner' | 'mevo',
): Promise<SaveWorkflowResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_store_workflow_settings', {
    p_store_id: storeId,
    p_settings: toWorkflowRpcPayload(input),
    p_changed_via: changedVia,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function loadOwnerWorkflowSettings(): Promise<StoreWorkflowSettings> {
  const storeId = await requireOwnerStoreId()
  return loadWorkflowSettings(storeId)
}

export async function loadMevoWorkflowSettings(storeId: string): Promise<StoreWorkflowSettings> {
  await requireMevoSuperadmin()
  return loadWorkflowSettings(storeId)
}

function isServingHours(value: unknown): value is StoreWorkflowSettings['servingHours'] {
  return Array.isArray(value) && value.every((shift) =>
    !!shift && typeof shift === 'object'
    && typeof (shift as { open?: unknown }).open === 'string'
    && typeof (shift as { close?: unknown }).close === 'string')
}

// Chủ quán lưu (OWNER_EDITABLE_WORKFLOW_KEYS, mig 139): CHỈ lấy Đang nhận đơn + Giờ phục vụ từ client, các mục còn lại đọc lại từ DB rồi gửi y nguyên —
// client có gửi mục khác cũng bị bỏ qua. Lỗi trả {ok:false}, không ném (Next production giấu nội dung lỗi ném).
export async function saveOwnerWorkflowSettings(input: StoreWorkflowSettings): Promise<SaveWorkflowResult> {
  try {
    const storeId = await requireOwnerStoreId()
    if (typeof input?.isAcceptingOrders !== 'boolean' || !isServingHours(input.servingHours)) {
      return { ok: false, error: 'Dữ liệu không hợp lệ' }
    }
    const current = await loadWorkflowSettings(storeId)
    return await saveWorkflowSettings(storeId, {
      ...current,
      isAcceptingOrders: input.isAcceptingOrders,
      servingHours: input.servingHours.map((shift) => ({ open: shift.open, close: shift.close })),
    }, 'owner')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không lưu được' }
  }
}

export async function saveMevoWorkflowSettings(
  storeId: string,
  input: StoreWorkflowSettings,
): Promise<SaveWorkflowResult> {
  try {
    await requireMevoSuperadmin()
    return await saveWorkflowSettings(storeId, input, 'mevo')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không lưu được' }
  }
}
