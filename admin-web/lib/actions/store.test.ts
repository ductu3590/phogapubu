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

const { saveBellStyle, saveBankAccount, updateStoreSettings } = await import('./store')

describe('saveBankAccount', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.patch.value = null })

  it('lưu bản đã chuẩn hoá', async () => {
    await expect(saveBankAccount({ bin: '970436', accountNumber: '0011 0012-34567', accountName: 'Đỗ Đức Tú' })).resolves.toEqual({ ok: true })
    expect(mocks.patch.value).toEqual({ bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin', 'layout')
  })
  it('trống cả ba thì ghi null', async () => {
    await saveBankAccount({ bin: '', accountNumber: '', accountName: '' })
    expect(mocks.patch.value).toEqual({ bank_bin: null, bank_account_number: null, bank_account_name: null })
  })
  it('dữ liệu sai thì trả lỗi, không ghi', async () => {
    const res = await saveBankAccount({ bin: '970436', accountNumber: '', accountName: 'A' })
    expect(res.ok).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('không phải chủ quán thì trả lỗi, không ném, không ghi', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(saveBankAccount({ bin: '970436', accountNumber: '0011001234567', accountName: 'A' }))
      .resolves.toEqual({ ok: false, error: 'Chỉ chủ quán mới thao tác được ở đây' })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

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

  it('lưu link Google Maps (mig 090), bỏ khoảng trắng; rỗng = xoá', async () => {
    const formData = new FormData()
    formData.set('name', 'Bia lẩu Bảo Lương')
    formData.set('google_maps_url', '  https://maps.app.goo.gl/abc  ')
    await updateStoreSettings(formData)
    expect(mocks.patch.value).toMatchObject({ google_maps_url: 'https://maps.app.goo.gl/abc' })

    const empty = new FormData()
    empty.set('name', 'Bia lẩu Bảo Lương')
    empty.set('google_maps_url', '')
    await updateStoreSettings(empty)
    expect(mocks.patch.value).toMatchObject({ google_maps_url: null })
  })

  it('link không phải https → báo lỗi, KHÔNG ghi gì', async () => {
    const formData = new FormData()
    formData.set('name', 'Bia lẩu Bảo Lương')
    formData.set('google_maps_url', 'javascript:alert(1)')
    await expect(updateStoreSettings(formData)).rejects.toThrow('Link Google Maps phải bắt đầu bằng https://')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('saveBellStyle (PA-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.patch.value = null
  })

  it('ghi đúng kiểu chuông vào quán của chủ quán', async () => {
    await expect(saveBellStyle('soft')).resolves.toEqual({ ok: true })
    expect(mocks.patch.value).toEqual({ bell_style: 'soft' })
  })

  it('kiểu lạ → báo lỗi, KHÔNG ghi gì', async () => {
    await expect(saveBellStyle('loud' as never)).resolves.toEqual({ ok: false, error: 'Kiểu chuông không hợp lệ' })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
