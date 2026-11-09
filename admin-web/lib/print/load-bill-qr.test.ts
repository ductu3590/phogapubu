import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listOpenTableSessions: vi.fn(),
  requireOperator: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/actions/table-session', () => ({ listOpenTableSessions: mocks.listOpenTableSessions }))
vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) }),
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
    mocks.listOpenTableSessions.mockResolvedValue({ ok: true, sessions: [session] })
    expect((await loadBillQr([ID]))?.amount).toBe(155000)
    expect(mocks.eq).toHaveBeenCalledWith('id', 'store-1')
  })
  it('danh sách phiên lỗi: trả null', async () => {
    mocks.listOpenTableSessions.mockResolvedValue({ ok: false, error: 'x' })
    await expect(loadBillQr([ID])).resolves.toBeNull()
  })
  it('requireOperator ném: trả null, không ném', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('x'))
    await expect(loadBillQr([ID])).resolves.toBeNull()
  })
  it('đọc tài khoản lỗi: trả null', async () => {
    mocks.listOpenTableSessions.mockResolvedValue({ ok: true, sessions: [session] })
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(loadBillQr([ID])).resolves.toBeNull()
  })
})

// Trang /print/agent không có cookie: đọc bằng client JWT của người tạo phiếu.
describe('loadBillQrWithClient', () => {
  const client = (rpc: { data: unknown; error: { message: string } | null }) => ({
    rpc: vi.fn(async () => rpc),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: bank, error: null }) }) }) }),
  })
  it('bill còn mở: ra QR', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await loadBillQrWithClient(client({ data: [session], error: null }) as any, 'store-1', [ID])
    expect(r?.amount).toBe(155000)
  })
  it('RPC lỗi hoặc ném: null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await loadBillQrWithClient(client({ data: null, error: { message: 'x' } }) as any, 'store-1', [ID])).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await loadBillQrWithClient({ rpc: () => { throw new Error('x') } } as any, 'store-1', [ID])).toBeNull()
  })
})
