import { describe, expect, it, vi } from 'vitest'
import { loadDayReport } from './load-day-report'

type R = { data: unknown; error: null | { message: string } }
const reportRaw = {
  totals: { revenue: 1000, cash: 1000, bank: 0, other: 0, bills_count: 1 },
  bills: [], waiting: [], cancelled: [], adjustments: [],
}

function fakeClient(rpc: R, store: R) {
  const rpcFn = vi.fn(async () => rpc)
  return {
    rpc: rpcFn,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => store }) }) }),
  }
}
const now = new Date('2026-11-05T15:00:00Z')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (c: any, date: string) => loadDayReport(c, 'store-1', date, 'Lan · Thu ngân', now)

describe('loadDayReport', () => {
  it('ngày thiếu hoặc sai định dạng/không tồn tại: báo lỗi vĩnh viễn, không âm thầm in hôm nay, không gọi RPC', async () => {
    for (const bad of ['', 'abc', '05/11/2026', '2026-02-31']) {
      const c = fakeClient({ data: reportRaw, error: null }, { data: { name: 'Q' }, error: null })
      const r = await run(c, bad)
      expect(r).toEqual({ ok: false, error: 'Ngày báo cáo không hợp lệ' })
      expect(c.rpc).not.toHaveBeenCalled()
    }
  })

  it('dùng đúng ngày job đã kiểm lúc xếp hàng (kể cả ngày cũ), không kẹp về hôm nay', async () => {
    const c = fakeClient({ data: reportRaw, error: null }, { data: { name: 'Quán A' }, error: null })
    const r = await run(c, '2026-10-01')
    expect(r.ok).toBe(true)
    expect(c.rpc).toHaveBeenCalledWith('get_bills_report', { p_store_id: 'store-1', p_date: '2026-10-01' })
    if (r.ok) {
      expect(r.props.date).toBe('2026-10-01')
      expect(r.props.storeName).toBe('Quán A')
      expect(r.props.printedBy).toBe('Lan · Thu ngân')
    }
  })

  it('RPC báo cáo lỗi: transient', async () => {
    const c = fakeClient({ data: null, error: { message: 'timeout' } }, { data: { name: 'Q' }, error: null })
    expect(await run(c, '2026-11-05')).toMatchObject({ ok: false, transient: true })
  })

  it('đọc stores lỗi: báo lỗi (transient), không in phiếu tên quán trống', async () => {
    const c = fakeClient({ data: reportRaw, error: null }, { data: null, error: { message: 'down' } })
    expect(await run(c, '2026-11-05')).toMatchObject({ ok: false, transient: true })
  })
})
