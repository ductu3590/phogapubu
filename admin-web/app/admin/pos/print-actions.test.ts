import { describe, expect, it, vi } from 'vitest'
import { confirmAndPrint } from './print-actions'

const deps = (over: { confirm?: unknown; print?: unknown } = {}) => ({
  confirmOrder: vi.fn(async () => (over.confirm ?? { ok: true, already: false }) as never),
  printDocument: vi.fn(async () => (over.print ?? { ok: true }) as never),
})

describe('confirmAndPrint', () => {
  it('confirm lỗi: không gọi printDocument', async () => {
    const d = deps({ confirm: { ok: false, error: 'Đơn đã huỷ' } })
    expect(await confirmAndPrint('o1', d)).toEqual({ ok: false, error: 'Đơn đã huỷ' })
    expect(d.printDocument).not.toHaveBeenCalled()
  })
  it('confirm được, in lỗi: ok kèm printError, đơn không bị coi là thất bại', async () => {
    const d = deps({ print: { ok: false, error: 'Hàng đợi đầy' } })
    expect(await confirmAndPrint('o1', d)).toEqual({ ok: true, already: false, printError: 'Hàng đợi đầy' })
  })
  it('confirm already: vẫn gọi printDocument, không có reprint', async () => {
    const d = deps({ confirm: { ok: true, already: true } })
    const r = await confirmAndPrint('o1', d)
    expect(r).toEqual({ ok: true, already: true, printError: null })
    expect(d.printDocument).toHaveBeenCalledWith({ kind: 'order', orderId: 'o1' })
  })
  it('printDocument ném lỗi mạng: ok kèm printError', async () => {
    const d = deps()
    d.printDocument.mockRejectedValueOnce(new Error('network'))
    expect(await confirmAndPrint('o1', d)).toEqual({ ok: true, already: false, printError: 'network' })
  })
})
