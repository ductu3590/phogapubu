import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOperator: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: () => ({ select: () => ({ eq: mocks.eq }) }) }),
}))

import { loadBillQr, loadBillQrWithClient } from './load-bill-qr'

const ID = '11111111-2222-3333-4444-555555a1b2c3'
const session = { session_id: ID, table_number: 'Bàn 12', total: 155000, unpaid_total: 155000 }
const bank = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireOperator.mockResolvedValue({ storeId: 'store-1' })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.maybeSingle.mockResolvedValue({ data: bank, error: null })
})

describe('loadBillQr', () => {
  it('bill còn mở: ra QR, đọc đúng quán của người đăng nhập', async () => {
    mocks.rpc.mockResolvedValue({ data: [session], error: null })
    expect((await loadBillQr([ID]))?.amount).toBe(155000)
    expect(mocks.rpc).toHaveBeenCalledWith('list_open_table_sessions', { p_store_id: 'store-1' })
    expect(mocks.eq).toHaveBeenCalledWith('id', 'store-1')
  })
  it('danh sách phiên lỗi: trả null', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await expect(loadBillQr([ID])).resolves.toBeNull()
  })
  it('requireOperator ném: trả null, không ném', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('x'))
    await expect(loadBillQr([ID])).resolves.toBeNull()
  })
  it('đọc tài khoản lỗi: trả null', async () => {
    mocks.rpc.mockResolvedValue({ data: [session], error: null })
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(loadBillQr([ID])).resolves.toBeNull()
  })
})

// Trang /print/agent không có cookie: đọc bằng client JWT của người tạo phiếu.
describe('loadBillQrWithClient', () => {
  const make = (rpc: { data: unknown; error: { message: string } | null }, bankRes: { data: unknown; error: { message: string } | null } = { data: bank, error: null }) => {
    const eq = vi.fn(() => ({ maybeSingle: async () => bankRes }))
    return { rpc: vi.fn(async () => rpc), from: () => ({ select: () => ({ eq }) }), eq }
  }
  it('bill còn mở: ra QR, RPC và đọc tài khoản đều theo đúng quán', async () => {
    const c = make({ data: [session], error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await loadBillQrWithClient(c as any, 'store-9', [ID]))?.amount).toBe(155000)
    expect(c.rpc).toHaveBeenCalledWith('list_open_table_sessions', { p_store_id: 'store-9' })
    expect(c.eq).toHaveBeenCalledWith('id', 'store-9')
  })
  it('RPC lỗi hoặc ném: null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await loadBillQrWithClient(make({ data: null, error: { message: 'x' } }) as any, 'store-1', [ID])).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await loadBillQrWithClient({ rpc: () => { throw new Error('x') } } as any, 'store-1', [ID])).toBeNull()
  })
  it('đọc tài khoản lỗi: null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = make({ data: [session], error: null }, { data: null, error: { message: 'x' } }) as any
    expect(await loadBillQrWithClient(c, 'store-1', [ID])).toBeNull()
  })
})
