import { describe, expect, it } from 'vitest'
import { decideNotify } from './decide'

const ord = (o: Partial<Parameters<typeof decideNotify>[1]> = {}) => ({
  status: 'pending',
  total_amount: 105000,
  payment_received_at: null,
  bank_handoff_at: null,
  ...o,
})
const NOW = '2026-07-21T00:00:00Z'

describe('decideNotify', () => {
  it('BANK hợp lệ → handoff, KHÔNG confirm', () => {
    const d = decideNotify({ method: 'BANK' }, ord(), NOW)
    expect(d).toMatchObject({ action: 'bank_handoff', patch: { payment_instrument: 'bank' } })
    // bug §1.1: KHÔNG có payment_received_at trong patch
    expect(JSON.stringify(d)).not.toContain('payment_received_at')
  })

  it('custom method lạ (không phải BANK) → ignore, không mutation (fail-closed, Rủi ro #1)', () => {
    expect(decideNotify({ method: 'FOO' }, ord(), NOW).action).toBe('ignore')
  })

  it('BANK trên đơn ĐÃ nhận tiền (ví callback tới trước) → ignore, không ghi đè', () => {
    expect(decideNotify({ method: 'BANK' }, ord({ payment_received_at: NOW }), NOW).action).toBe('ignore')
  })

  it('BANK lặp (handoff đã set) → ignore (idempotent)', () => {
    expect(decideNotify({ method: 'BANK' }, ord({ bank_handoff_at: NOW }), NOW).action).toBe('ignore')
  })

  it('BANK trên đơn cancelled → ignore', () => {
    expect(decideNotify({ method: 'BANK' }, ord({ status: 'cancelled' }), NOW).action).toBe('ignore')
  })

  it('ví thành công → wallet_confirm đủ 5 trường + instrument wallet', () => {
    const d = decideNotify({ resultCode: 1, amount: 105000, transId: 'T1', method: 'zalopay' }, ord(), NOW)
    expect(d).toMatchObject({
      action: 'wallet_confirm',
      patch: {
        status: 'confirmed',
        zalopay_trans_id: 'T1',
        payment_received_via: 'zalo_callback',
        payment_received_by: null,
        payment_instrument: 'wallet',
      },
    })
    expect((d as { patch: { payment_received_at: string } }).patch.payment_received_at).toBe(NOW)
  })

  it('ví method lạ chưa test → instrument null (không suy đoán)', () => {
    const d = decideNotify({ resultCode: 1, amount: 105000, transId: 'T1', method: 'grabpay' }, ord(), NOW)
    expect(d).toMatchObject({ action: 'wallet_confirm', patch: { payment_instrument: null } })
  })

  it('ví thất bại (resultCode≠1) → ignore, không ghi tiền', () => {
    expect(decideNotify({ resultCode: 0, amount: 105000 }, ord(), NOW).action).toBe('ignore')
  })

  it('ví amount mismatch → reject', () => {
    expect(decideNotify({ resultCode: 1, amount: 999, transId: 'T1' }, ord(), NOW).action).toBe('reject')
  })

  it('ví lặp (đơn đã nhận tiền) → ignore (idempotent)', () => {
    expect(decideNotify({ resultCode: 1, amount: 105000, transId: 'T1' }, ord({ payment_received_at: NOW }), NOW).action).toBe('ignore')
  })
})
