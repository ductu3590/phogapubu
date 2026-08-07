import { describe, it, expect, vi, beforeEach } from 'vitest'

// Giỏ hàng được lưu localStorage để khách thoát app rồi mở lại không phải chọn món từ đầu.
// Hai thứ dễ hỏng âm thầm và không ai phát hiện cho tới khi mất giỏ của khách thật:
//   1. TTL — giỏ cũ quá phải bị bỏ, nhưng giỏ vừa mới thì PHẢI còn
//   2. totalItems/totalAmount là giá trị dẫn xuất, không được lưu → phải tính lại lúc khôi phục,
//      nếu quên thì giỏ hiện đủ món mà tổng tiền 0đ

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.resetModules()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
})

const MON = {
  id: 'pho-ga',
  productId: 'pho-ga',
  productName: 'Phở gà đặc biệt',
  basePrice: 80000,
  quantity: 2,
  selectedVariants: [],
}

function ghiGio(savedAt: number) {
  store.set(
    'mevo_cart',
    JSON.stringify({ state: { items: [MON] }, version: 0, savedAt }),
  )
}

describe('cart.store — lưu giỏ qua lần mở app', () => {
  it('giỏ vừa lưu thì khôi phục lại, và tính LẠI tổng tiền', async () => {
    ghiGio(Date.now())
    const { useCartStore } = await import('./cart.store')
    const s = useCartStore.getState()
    expect(s.items).toHaveLength(1)
    // 80.000 x 2 — nếu quên tính lại thì hai số này là 0
    expect(s.totalItems).toBe(2)
    expect(s.totalAmount).toBe(160000)
  })

  it('giỏ quá 6 tiếng thì bỏ, không khôi phục', async () => {
    ghiGio(Date.now() - 6 * 60 * 60 * 1000 - 60_000)
    const { useCartStore } = await import('./cart.store')
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(store.has('mevo_cart')).toBe(false) // dọn luôn key hỏng
  })

  it('giỏ chưa tới 6 tiếng thì vẫn còn', async () => {
    ghiGio(Date.now() - 5 * 60 * 60 * 1000)
    const { useCartStore } = await import('./cart.store')
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('bản ghi thiếu dấu thời gian coi như hỏng, bỏ đi', async () => {
    store.set('mevo_cart', JSON.stringify({ state: { items: [MON] }, version: 0 }))
    const { useCartStore } = await import('./cart.store')
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('KHÔNG lưu khoá đơn — khôi phục xong giỏ phải mở khoá', async () => {
    ghiGio(Date.now())
    const { useCartStore } = await import('./cart.store')
    // Lưu khoá mà đơn đã chết thì giỏ đóng băng vĩnh viễn, không ai mở ra được
    expect(useCartStore.getState().lockedByOrderId).toBeNull()
  })

  it('thêm món xong là ghi xuống localStorage kèm dấu thời gian', async () => {
    const { useCartStore } = await import('./cart.store')
    useCartStore.getState().addToCart({
      productId: 'nuoc-cam',
      productName: 'Nước cam tươi',
      basePrice: 25000,
      quantity: 1,
      selectedVariants: [],
    } as never)
    const raw = store.get('mevo_cart')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string) as { savedAt?: number; state?: { items?: unknown[] } }
    expect(typeof parsed.savedAt).toBe('number')
    expect(parsed.state?.items).toHaveLength(1)
  })
})
