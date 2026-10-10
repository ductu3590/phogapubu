import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStoreOwnerStoreId = vi.fn()
  const from = vi.fn(() => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.update = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => ({ data: { slug: 'quan-a', kitchen_token_version: 1 }, error: null }))
    b.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
    return b
  })
  return { requireStoreOwnerStoreId, from }
})

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mocks.from })),
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}))
vi.mock('@/lib/kitchen-token', () => ({ signKitchenToken: vi.fn(async () => 'tok') }))

const { generateKitchenLink, revokeKitchenToken } = await import('./kitchen')

describe('link màn bếp (vá review PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
  })

  it('chủ quán lấy link quán mình được', async () => {
    await expect(generateKitchenLink('store-1')).resolves.toEqual({ path: '/kitchen/quan-a?k=tok' })
  })

  it('chủ quán quán A KHÔNG lấy / thu hồi được link quán B', async () => {
    await expect(generateKitchenLink('store-2')).rejects.toThrow()
    await expect(revokeKitchenToken('store-2')).rejects.toThrow()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('thu ngân / nhân viên / tài khoản bị khoá → từ chối', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(generateKitchenLink('store-1')).rejects.toThrow('Chỉ chủ quán')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
