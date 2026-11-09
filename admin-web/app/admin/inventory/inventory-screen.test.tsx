import { beforeEach, describe, expect, it, vi } from 'vitest'

// Trang Kho (server component): thu ngân phải nhận dữ liệu ĐÃ gỡ giá ngay từ server, không chỉ ẩn cột trên giao diện.
const mocks = vi.hoisted(() => ({
  role: 'store_cashier' as string,
  readStockLevels: vi.fn(async () => ({ ok: true as const, rows: [] })),
  inventoryToday: vi.fn(async () => '2026-11-09'),
}))

vi.mock('@/lib/auth/operator', () => ({
  requireAdminPageOrRedirect: vi.fn(async () => ({ role: mocks.role, storeId: 'store-1', userId: 'u1' })),
}))
vi.mock('@/lib/inventory-server', () => ({ readStockLevels: mocks.readStockLevels, inventoryToday: mocks.inventoryToday }))
vi.mock('@/lib/actions/inventory', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }))

const { default: InventoryScreen } = await import('./inventory-screen')

describe('InventoryScreen — giá vốn chỉ cho hậu cần', () => {
  beforeEach(() => mocks.readStockLevels.mockClear())

  it('thu ngân: đọc tồn với withCost: false (gỡ giá ở server)', async () => {
    mocks.role = 'store_cashier'
    await InventoryScreen({ inModal: true })
    expect(mocks.readStockLevels).toHaveBeenCalledWith('store-1', { withCost: false })
  })

  it('chủ quán, quản lý: đọc đủ giá', async () => {
    for (const role of ['store_owner', 'store_manager']) {
      mocks.readStockLevels.mockClear()
      mocks.role = role
      await InventoryScreen({ inModal: true })
      expect(mocks.readStockLevels, role).toHaveBeenCalledWith('store-1', { withCost: true })
    }
  })
})
