import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserPrintUrl } from './print-request'

const mocks = vi.hoisted(() => ({
  printInPlace: vi.fn(),
  enqueuePrint: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('./print-in-place', () => ({ printInPlace: mocks.printInPlace }))
vi.mock('@/lib/actions/print-jobs', () => ({ enqueuePrint: mocks.enqueuePrint }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: mocks.rpc }) }))

const { printDocument, resetPrintDocumentStateForTests } = await import('./print-document')

const order = { kind: 'order', orderId: 'o1' } as const

describe('printDocument', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetPrintDocumentStateForTests()
    mocks.rpc.mockResolvedValue({ data: 'browser', error: null })
    mocks.enqueuePrint.mockResolvedValue({ ok: true, queued: 3 })
  })
  afterEach(() => vi.useRealTimers())

  it('browser: gọi printInPlace đúng URL, không gọi enqueuePrint', async () => {
    expect(await printDocument(order)).toEqual({ ok: true })
    expect(mocks.printInPlace).toHaveBeenCalledWith('/print/order?id=o1')
    expect(mocks.enqueuePrint).not.toHaveBeenCalled()
  })

  it('agent: gọi enqueuePrint, không gọi printInPlace', async () => {
    mocks.rpc.mockResolvedValue({ data: 'agent', error: null })
    expect(await printDocument(order)).toEqual({ ok: true })
    expect(mocks.enqueuePrint).toHaveBeenCalledWith(order)
    expect(mocks.printInPlace).not.toHaveBeenCalled()
  })

  it('agent: enqueuePrint lỗi thì trả lỗi, không tự rơi về trình duyệt', async () => {
    mocks.rpc.mockResolvedValue({ data: 'agent', error: null })
    mocks.enqueuePrint.mockResolvedValue({ ok: false, error: 'Chưa cài trạm in' })
    expect(await printDocument(order)).toEqual({ ok: false, error: 'Chưa cài trạm in' })
    expect(mocks.printInPlace).not.toHaveBeenCalled()
  })

  it('agent + shift_report: xếp hàng cho phần mềm in, không in trình duyệt', async () => {
    mocks.rpc.mockResolvedValue({ data: 'agent', error: null })
    mocks.enqueuePrint.mockResolvedValue({ ok: true, queued: 1 })
    expect(await printDocument({ kind: 'shift_report', shiftId: 's1' })).toEqual({ ok: true })
    expect(mocks.enqueuePrint).toHaveBeenCalledWith({ kind: 'shift_report', shiftId: 's1' })
    expect(mocks.printInPlace).not.toHaveBeenCalled()
  })

  it('browser + shift_report: in trình duyệt như cũ', async () => {
    mocks.rpc.mockResolvedValue({ data: 'browser', error: null })
    await printDocument({ kind: 'shift_report', shiftId: 's1' })
    expect(mocks.printInPlace).toHaveBeenCalledWith('/print/shift-report?id=s1')
  })

  it('đọc mode lỗi và chưa có cache: dùng browser để không kẹt in', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'mất mạng' } })
    expect(await printDocument(order)).toEqual({ ok: true })
    expect(mocks.printInPlace).toHaveBeenCalledTimes(1)
    expect(mocks.enqueuePrint).not.toHaveBeenCalled()
  })

  it('đọc mode ném lỗi (mất mạng) cũng không kẹt in', async () => {
    mocks.rpc.mockRejectedValue(new Error('network'))
    expect(await printDocument(order)).toEqual({ ok: true })
    expect(mocks.printInPlace).toHaveBeenCalledTimes(1)
  })

  it('mode được nhớ 60 giây: 2 lần in chỉ đọc RPC 1 lần; quá 60 giây đọc lại', async () => {
    await printDocument(order)
    await vi.advanceTimersByTimeAsync(3000)
    await printDocument(order)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(61_000)
    await printDocument(order)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('mode cũ vẫn dùng khi đọc lại lỗi sau 60 giây', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'agent', error: null })
    await printDocument(order)
    await vi.advanceTimersByTimeAsync(61_000)
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await printDocument(order)
    expect(mocks.enqueuePrint).toHaveBeenCalledTimes(2)
  })

  it('bấm đúp: 2 lần gọi cùng req trong 2 giây chỉ in 1 lần, cùng kết quả', async () => {
    const [a, b] = await Promise.all([printDocument(order), printDocument(order)])
    expect(a).toEqual(b)
    await vi.advanceTimersByTimeAsync(1000)
    await printDocument(order)
    expect(mocks.printInPlace).toHaveBeenCalledTimes(1)
  })

  it('req khác nhau thì không bị gộp', async () => {
    await Promise.all([printDocument(order), printDocument({ kind: 'order', orderId: 'o2' })])
    expect(mocks.printInPlace).toHaveBeenCalledTimes(2)
  })

  it('sau 2 giây bấm lại thì in lần nữa', async () => {
    await printDocument(order)
    await vi.advanceTimersByTimeAsync(2100)
    await printDocument(order)
    expect(mocks.printInPlace).toHaveBeenCalledTimes(2)
  })

  it('enqueuePrint báo "Quán chưa bật phần mềm in": lần bấm này in luôn bằng trình duyệt, xoá cache mode để lần sau đọc lại', async () => {
    mocks.rpc.mockResolvedValue({ data: 'agent', error: null })
    mocks.enqueuePrint.mockResolvedValue({ ok: false, error: 'Quán chưa bật phần mềm in' })
    expect(await printDocument(order)).toEqual({ ok: true })
    expect(mocks.printInPlace).toHaveBeenCalledTimes(1)
    expect(mocks.printInPlace).toHaveBeenCalledWith(browserPrintUrl(order))
    await vi.advanceTimersByTimeAsync(2100)
    mocks.rpc.mockResolvedValue({ data: 'browser', error: null })
    expect(await printDocument(order)).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.printInPlace).toHaveBeenCalledTimes(2)
  })
})
