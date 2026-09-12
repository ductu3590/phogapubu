import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BAO_LUONG_PRESET,
  PUBU_PRESET,
  type StoreWorkflowSettings,
} from '@/lib/workflow-settings'

const mocks = vi.hoisted(() => {
  const operator = {
    value: { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' } as
      | { userId: string; role: 'store_owner' | 'store_staff'; storeId: string }
      | { userId: string; role: 'mevo_superadmin'; storeId: null },
  }
  const rpc = vi.fn()
  const requireOperator = vi.fn(async () => operator.value)

  return { operator, requireOperator, rpc }
})

vi.mock('@/lib/auth/operator', () => ({
  requireOperator: mocks.requireOperator,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))

const {
  loadMevoWorkflowSettings,
  loadOwnerWorkflowSettings,
  saveMevoWorkflowSettings,
  saveOwnerWorkflowSettings,
} = await import('./workflow-settings')

const BAO_LUONG_RPC_SNAPSHOT = {
  payment_timing: 'postpay',
  payment_methods: ['cash'],
  is_accepting_orders: true,
  serving_hours: [{ open: '10:00', close: '23:00' }],
  table_ordering_enabled: true,
  takeaway_enabled: false,
  shipping_enabled: false,
  reservations_enabled: true,
  reservation_preorder_enabled: true,
  minimum_advance_minutes: 30,
  booking_horizon_days: 7,
  slot_interval_minutes: 15,
  default_table_capacity: 6,
  planning_hold_minutes: 180,
  kitchen_release_policy: 'pos_confirmation',
  staff_order_release_policy: 'pos_confirmation',
  open_ordering_on_arrival: true,
  table_session_idle_timeout_minutes: 360,
  reservation_preorder_edit_cutoff_minutes: 30,
}

const BAO_LUONG_LOADED: StoreWorkflowSettings = {
  ...BAO_LUONG_PRESET,
  servingHours: [{ open: '10:00', close: '23:00' }],
}

describe('workflow settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
    mocks.requireOperator.mockImplementation(async () => mocks.operator.value)
    mocks.rpc.mockResolvedValue({ data: BAO_LUONG_RPC_SNAPSHOT, error: null })
  })

  it('owner tải cấu hình của store trong operator và nhận model camelCase', async () => {
    await expect(loadOwnerWorkflowSettings()).resolves.toEqual(BAO_LUONG_LOADED)

    expect(mocks.rpc).toHaveBeenCalledWith('get_store_workflow_settings', {
      p_store_id: 'store-1',
    })
  })

  it('MEVO tải cấu hình của store đích và nhận model camelCase', async () => {
    mocks.operator.value = { userId: 'mevo-1', role: 'mevo_superadmin', storeId: null }

    await expect(loadMevoWorkflowSettings('store-2')).resolves.toEqual(BAO_LUONG_LOADED)

    expect(mocks.rpc).toHaveBeenCalledWith('get_store_workflow_settings', {
      p_store_id: 'store-2',
    })
  })

  it('owner gửi storeId từ operator cùng payload snake_case đầy đủ', async () => {
    const input: StoreWorkflowSettings = {
      ...BAO_LUONG_PRESET,
      servingHours: [{ open: '10:00', close: '23:00' }],
    }

    await saveOwnerWorkflowSettings(input)

    expect(mocks.rpc).toHaveBeenCalledWith('update_store_workflow_settings', {
      p_store_id: 'store-1',
      p_settings: BAO_LUONG_RPC_SNAPSHOT,
      p_changed_via: 'owner',
    })
  })

  it('MEVO gửi store đích, preset Pubu và changed_via=mevo', async () => {
    mocks.operator.value = { userId: 'mevo-1', role: 'mevo_superadmin', storeId: null }

    await saveMevoWorkflowSettings('store-2', PUBU_PRESET)

    expect(mocks.rpc).toHaveBeenCalledWith('update_store_workflow_settings', {
      p_store_id: 'store-2',
      p_settings: {
        payment_timing: 'prepay',
        payment_methods: ['zalo_checkout'],
        is_accepting_orders: true,
        serving_hours: [],
        table_ordering_enabled: true,
        takeaway_enabled: true,
        shipping_enabled: true,
        reservations_enabled: false,
        reservation_preorder_enabled: false,
        minimum_advance_minutes: 30,
        booking_horizon_days: 7,
        slot_interval_minutes: 15,
        default_table_capacity: 6,
        planning_hold_minutes: 180,
        kitchen_release_policy: 'automatic',
        staff_order_release_policy: 'automatic',
        open_ordering_on_arrival: true,
        table_session_idle_timeout_minutes: 360,
        reservation_preorder_edit_cutoff_minutes: 30,
      },
      p_changed_via: 'mevo',
    })
  })

  it('chuẩn hóa preorder phụ thuộc trước khi lưu mà không mutate draft form', async () => {
    const draft: StoreWorkflowSettings = {
      ...BAO_LUONG_PRESET,
      reservationsEnabled: false,
    }

    await saveOwnerWorkflowSettings(draft)

    expect(mocks.rpc).toHaveBeenCalledWith(
      'update_store_workflow_settings',
      expect.objectContaining({
        p_settings: expect.objectContaining({
          reservations_enabled: false,
          reservation_preorder_enabled: false,
        }),
      }),
    )
    expect(draft.reservationPreorderEnabled).toBe(true)
  })

  it('staff bị chặn trước RPC', async () => {
    mocks.operator.value = { userId: 'staff-1', role: 'store_staff', storeId: 'store-1' }

    await expect(saveOwnerWorkflowSettings(PUBU_PRESET)).rejects.toThrow('Chỉ chủ quán')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('owner bị chặn khỏi workflow của MEVO trước RPC', async () => {
    await expect(loadMevoWorkflowSettings('store-2')).rejects.toThrow('Chỉ MEVO superadmin')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('trả nguyên văn lỗi nghiệp vụ từ RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Còn phiên đang hoạt động' } })

    await expect(saveOwnerWorkflowSettings(BAO_LUONG_PRESET)).rejects.toThrow(
      'Còn phiên đang hoạt động',
    )
  })
})
