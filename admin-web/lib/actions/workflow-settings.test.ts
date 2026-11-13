import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POSTPAY_POS_PRESET,
  PREPAY_PRESET,
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

const POSTPAY_POS_RPC_SNAPSHOT = {
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

const POSTPAY_POS_LOADED: StoreWorkflowSettings = {
  ...POSTPAY_POS_PRESET,
  servingHours: [{ open: '10:00', close: '23:00' }],
}

describe('workflow settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
    mocks.requireOperator.mockImplementation(async () => mocks.operator.value)
    mocks.rpc.mockResolvedValue({ data: POSTPAY_POS_RPC_SNAPSHOT, error: null })
  })

  it('owner tải cấu hình của store trong operator và nhận model camelCase', async () => {
    await expect(loadOwnerWorkflowSettings()).resolves.toEqual(POSTPAY_POS_LOADED)

    expect(mocks.rpc).toHaveBeenCalledWith('get_store_workflow_settings', {
      p_store_id: 'store-1',
    })
  })

  it('MEVO tải cấu hình của store đích và nhận model camelCase', async () => {
    mocks.operator.value = { userId: 'mevo-1', role: 'mevo_superadmin', storeId: null }

    await expect(loadMevoWorkflowSettings('store-2')).resolves.toEqual(POSTPAY_POS_LOADED)

    expect(mocks.rpc).toHaveBeenCalledWith('get_store_workflow_settings', {
      p_store_id: 'store-2',
    })
  })

  it('owner: chỉ lấy Đang nhận đơn + Giờ phục vụ từ client, mục khác đọc lại từ DB rồi gửi y nguyên', async () => {
    // DB đang lưu cấu hình Trả sau, POS duyệt; client cố gửi cả mẫu Trả trước (đổi mục khoá)
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_store_workflow_settings'
        ? { data: POSTPAY_POS_RPC_SNAPSHOT, error: null }
        : { data: null, error: null })

    const r = await saveOwnerWorkflowSettings({
      ...PREPAY_PRESET,
      isAcceptingOrders: false,
      servingHours: [{ open: '16:00', close: '23:30' }],
    })

    expect(r).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('get_store_workflow_settings', { p_store_id: 'store-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('update_store_workflow_settings', {
      p_store_id: 'store-1',
      p_settings: {
        ...POSTPAY_POS_RPC_SNAPSHOT,
        is_accepting_orders: false,
        serving_hours: [{ open: '16:00', close: '23:30' }],
      },
      p_changed_via: 'owner',
    })
  })

  it('owner: DB từ chối (mig 139) → {ok:false} kèm đúng câu của DB, không ném', async () => {
    const msg = 'Chủ quán chỉ đổi được Đang nhận đơn và Giờ phục vụ. Các mục quy trình khác do MEVO cấu hình — cần đổi thì liên hệ MEVO.'
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_store_workflow_settings'
        ? { data: POSTPAY_POS_RPC_SNAPSHOT, error: null }
        : { data: null, error: { message: msg } })
    await expect(saveOwnerWorkflowSettings(POSTPAY_POS_PRESET)).resolves.toEqual({ ok: false, error: msg })
  })

  it('owner: dữ liệu sai kiểu → {ok:false}, không gọi RPC', async () => {
    const bad = { ...POSTPAY_POS_PRESET, isAcceptingOrders: 'yes' } as unknown as StoreWorkflowSettings
    await expect(saveOwnerWorkflowSettings(bad)).resolves.toEqual({ ok: false, error: 'Dữ liệu không hợp lệ' })
    const badHours = { ...POSTPAY_POS_PRESET, servingHours: [{ open: 8 }] } as unknown as StoreWorkflowSettings
    await expect(saveOwnerWorkflowSettings(badHours)).resolves.toEqual({ ok: false, error: 'Dữ liệu không hợp lệ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('MEVO gửi store đích, mẫu Trả trước và changed_via=mevo', async () => {
    mocks.operator.value = { userId: 'mevo-1', role: 'mevo_superadmin', storeId: null }

    await saveMevoWorkflowSettings('store-2', PREPAY_PRESET)

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

  it('MEVO: chuẩn hóa preorder phụ thuộc trước khi lưu mà không mutate draft form', async () => {
    mocks.operator.value = { userId: 'mevo-1', role: 'mevo_superadmin', storeId: null }
    const draft: StoreWorkflowSettings = {
      ...POSTPAY_POS_PRESET,
      reservationsEnabled: false,
    }

    await saveMevoWorkflowSettings('store-2', draft)

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

    const r = await saveOwnerWorkflowSettings(PREPAY_PRESET)
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.error).toContain('Chỉ chủ quán')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('chủ quán gọi đường lưu của MEVO → {ok:false}, không gọi RPC', async () => {
    const r = await saveMevoWorkflowSettings('store-1', PREPAY_PRESET)
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.error).toContain('Chỉ MEVO superadmin')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('owner bị chặn khỏi workflow của MEVO trước RPC', async () => {
    await expect(loadMevoWorkflowSettings('store-2')).rejects.toThrow('Chỉ MEVO superadmin')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('MEVO: trả nguyên văn lỗi nghiệp vụ từ RPC, không ném', async () => {
    mocks.operator.value = { userId: 'mevo-1', role: 'mevo_superadmin', storeId: null }
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Còn phiên đang hoạt động' } })

    await expect(saveMevoWorkflowSettings('store-2', POSTPAY_POS_PRESET)).resolves.toEqual({
      ok: false,
      error: 'Còn phiên đang hoạt động',
    })
  })
})
