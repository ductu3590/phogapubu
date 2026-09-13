import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const patch = { value: null as Record<string, unknown> | null }
  const update = vi.fn((value: Record<string, unknown>) => {
    patch.value = value
    return {
      eq: vi.fn(async () => ({ error: null })),
    }
  })
  const admin = {
    from: vi.fn(() => ({ update })),
    storage: {},
  }

  return {
    admin,
    patch,
    requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
    revalidatePath: vi.fn(),
    update,
  }
})

vi.mock('@/lib/auth/operator', () => ({
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => mocks.admin),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { updateStoreSettings } = await import('./store')

describe('updateStoreSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.patch.value = null
  })

  it('chỉ ghi profile và bỏ qua mọi field workflow gửi kèm từ form cũ', async () => {
    const formData = new FormData()
    formData.set('name', 'Phở Gà Pubu')
    formData.set('payment_timing', 'postpay')
    formData.append('payment_methods', 'cash')
    formData.set('is_accepting_orders', '0')
    formData.set('serving_hours', '[{"open":"08:00","close":"22:00"}]')

    await updateStoreSettings(formData)

    expect(mocks.patch.value).not.toHaveProperty('payment_timing')
    expect(mocks.patch.value).not.toHaveProperty('payment_methods')
    expect(mocks.patch.value).not.toHaveProperty('is_accepting_orders')
    expect(mocks.patch.value).not.toHaveProperty('serving_hours')
    expect(mocks.patch.value).toMatchObject({ name: 'Phở Gà Pubu' })
  })
})
