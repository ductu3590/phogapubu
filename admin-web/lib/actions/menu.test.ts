import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
  requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
  createAdminClient: vi.fn(() => ({})),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { setMenuItemAvailable } = await import('./menu')

describe('setMenuItemAvailable (PA-2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gọi RPC bằng phiên đăng nhập, KHÔNG dùng service key', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, is_available: false }, error: null })
    await expect(setMenuItemAvailable('item-1', false)).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('set_menu_item_available', { p_item_id: 'item-1', p_available: false })
  })

  it('RPC từ chối → trả lỗi', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Không có quyền đổi trạng thái món' } })
    await expect(setMenuItemAvailable('item-1', true)).resolves.toEqual({ ok: false, error: 'Không có quyền đổi trạng thái món' })
  })

  it('không có quyền POS → báo lỗi, không gọi RPC', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    await expect(setMenuItemAvailable('item-1', true)).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
