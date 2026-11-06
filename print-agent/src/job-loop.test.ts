import { describe, it, expect, vi } from 'vitest'
import { createJobLoop, type JobLoopDeps, type PrintOutcome } from './job-loop'
import type { AgentJob, PollResult } from './api'

const job: AgentJob = {
  id: 'job-1',
  kind: 'kitchen_ticket',
  printer_name: 'XP-80',
  render_token: 'render',
  attempts: 1,
}

const UNKNOWN = 'Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại'
const STUCK_REMAINING = 'Máy in không phản hồi, phiếu còn trong hàng đợi Windows, xoá tay trước khi In lại'

function setup(over: Partial<JobLoopDeps> = {}, firstPoll: PollResult = { ok: true, job }) {
  const poll = vi.fn<JobLoopDeps['api']['poll']>()
  poll.mockResolvedValueOnce(firstPoll).mockResolvedValue({ ok: true, job: null })
  const report = vi.fn<JobLoopDeps['api']['report']>().mockResolvedValue(undefined)
  const deps = {
    api: { poll, report },
    token: 'tok',
    version: '0.1.0',
    listPrinters: vi.fn<JobLoopDeps['listPrinters']>().mockResolvedValue([{ name: 'XP-80' }]),
    printJob: vi.fn<JobLoopDeps['printJob']>().mockResolvedValue({ status: 'printed' }),
    waitForSpool: vi.fn<JobLoopDeps['waitForSpool']>().mockResolvedValue('clear'),
    onRevoked: vi.fn(),
    onOffline: vi.fn(),
    onOnline: vi.fn(),
    sleep: vi.fn<JobLoopDeps['sleep']>().mockResolvedValue(undefined),
    ...over,
  }
  return { deps, poll, report, loop: createJobLoop(deps) }
}

const outcome = (o: PrintOutcome) => vi.fn<JobLoopDeps['printJob']>().mockResolvedValue(o)

describe('job-loop', () => {
  it('tick đang chạy thì tick sau bỏ qua', async () => {
    let release: (o: PrintOutcome) => void = () => {}
    const printJob = vi.fn(() => new Promise<PrintOutcome>((r) => (release = r)))
    const { loop, poll } = setup({ printJob })

    const first = loop.tick()
    await vi.waitFor(() => expect(printJob).toHaveBeenCalled())
    await loop.tick()
    expect(poll).toHaveBeenCalledTimes(1)

    release({ status: 'printed' })
    await first
    await loop.tick()
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('poll {ok:false,error:"revoked"}: gọi onRevoked và dừng vòng lặp', async () => {
    const { loop, deps, poll } = setup({}, { ok: false, error: 'revoked' })
    await loop.tick()
    expect(deps.onRevoked).toHaveBeenCalledTimes(1)
    expect(deps.onOffline).not.toHaveBeenCalled()
    await loop.tick()
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('poll lỗi mạng: không ném, báo onOffline, tick sau chạy tiếp', async () => {
    const { loop, deps, poll } = setup()
    poll.mockReset()
    poll.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue({ ok: true, job: null })
    await expect(loop.tick()).resolves.toBeUndefined()
    expect(deps.onOffline).toHaveBeenCalledTimes(1)
    expect(deps.onOnline).not.toHaveBeenCalled()

    await loop.tick()
    expect(poll).toHaveBeenCalledTimes(2)
    expect(deps.onOnline).toHaveBeenCalledTimes(1)
  })

  it('poll trả ok:false lý do khác: coi như mất kết nối, không dừng', async () => {
    const { loop, deps, poll } = setup({}, { ok: false, error: 'lạ' })
    await loop.tick()
    expect(deps.onOffline).toHaveBeenCalledTimes(1)
    expect(deps.onRevoked).not.toHaveBeenCalled()
    await loop.tick()
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('không có job: không in, không report', async () => {
    const { loop, deps, report } = setup({}, { ok: true, job: null })
    await loop.tick()
    expect(deps.printJob).not.toHaveBeenCalled()
    expect(deps.waitForSpool).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
    expect(deps.onOnline).toHaveBeenCalledTimes(1)
  })

  it('in xong, hàng đợi sạch: report(ok=true)', async () => {
    const { loop, deps, report } = setup()
    await loop.tick()
    expect(deps.printJob).toHaveBeenCalledWith(job)
    expect(deps.waitForSpool).toHaveBeenCalledWith({ printer: 'XP-80', jobId: 'job-1', timeoutMs: 15000 })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('tok', 'job-1', true, null, false)
  })

  it('print thất bại: report(ok=false, retryable=true)', async () => {
    const { loop, deps, report } = setup({
      printJob: outcome({ status: 'print_failed', reason: 'Print job failed' }),
    })
    await loop.tick()
    expect(deps.waitForSpool).toHaveBeenCalledWith({ printer: 'XP-80', jobId: 'job-1', timeoutMs: 15000 })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'In thất bại: Print job failed', true)
  })

  it('print thất bại mà việc còn kẹt hàng đợi: không cho thử lại, tránh ra hai phiếu', async () => {
    const { loop, report } = setup({
      printJob: outcome({ status: 'print_failed', reason: 'Print job failed' }),
      waitForSpool: vi.fn<JobLoopDeps['waitForSpool']>().mockResolvedValue('stuck'),
    })
    await loop.tick()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Máy in không phản hồi', false)
  })

  it('print thất bại, xoá không hết khỏi hàng đợi: báo xoá tay', async () => {
    const { loop, report } = setup({
      printJob: outcome({ status: 'print_failed', reason: 'Print job failed' }),
      waitForSpool: vi.fn<JobLoopDeps['waitForSpool']>().mockResolvedValue('stuck_remaining'),
    })
    await loop.tick()
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, STUCK_REMAINING, false)
  })

  it('trang báo data-print-error: report(ok=false, retryable=false, lý do)', async () => {
    const { loop, deps, report } = setup({
      printJob: outcome({ status: 'page_error', reason: 'Các món trên phiếu đã bị bỏ', retryable: false }),
    })
    await loop.tick()
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Các món trên phiếu đã bị bỏ', false)
    expect(deps.waitForSpool).not.toHaveBeenCalled()
  })

  it('trang báo data-print-error kèm data-print-retryable: report(ok=false, retryable=true, lý do)', async () => {
    const { loop, deps, report } = setup({
      printJob: outcome({ status: 'page_error', reason: 'Không đọc được đơn', retryable: true }),
    })
    await loop.tick()
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Không đọc được đơn', true)
    expect(deps.waitForSpool).not.toHaveBeenCalled()
  })

  it('chờ tín hiệu quá 20 giây: report(ok=false, retryable=true)', async () => {
    const { loop, report } = setup({ printJob: outcome({ status: 'signal_timeout' }) })
    await loop.tick()
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Trang phiếu không phản hồi', true)
  })

  it('hàng đợi kẹt: report(ok=false, retryable=false, "Máy in không phản hồi")', async () => {
    const waitForSpool = vi.fn<JobLoopDeps['waitForSpool']>().mockResolvedValue('stuck')
    const { loop, report } = setup({ waitForSpool })
    await loop.tick()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Máy in không phản hồi', false)
  })

  it('hàng đợi kẹt, xoá không hết: báo xoá tay trước khi In lại', async () => {
    const waitForSpool = vi.fn<JobLoopDeps['waitForSpool']>().mockResolvedValue('stuck_remaining')
    const { loop, report } = setup({ waitForSpool })
    await loop.tick()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, STUCK_REMAINING, false)
  })

  it('không tìm thấy máy in: report(ok=false, retryable=false), không gọi print', async () => {
    const listPrinters = vi.fn<JobLoopDeps['listPrinters']>().mockResolvedValue([{ name: 'Máy khác' }])
    const { loop, deps, report } = setup({ listPrinters })
    await loop.tick()
    expect(deps.printJob).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Không tìm thấy máy in "XP-80" trên máy quầy', false)
  })

  describe('đọc danh sách máy in lỗi đúng lúc có job', () => {
    function secondTickFails(firstList: { name: string }[]) {
      const listPrinters = vi.fn<JobLoopDeps['listPrinters']>()
      listPrinters.mockResolvedValueOnce(firstList).mockRejectedValue(new Error('spooler'))
      const ctx = setup({ listPrinters }, { ok: true, job: null })
      ctx.poll.mockResolvedValueOnce({ ok: true, job })
      return ctx
    }

    it('dùng danh sách gần nhất: máy có trong đó thì in bình thường, không đốt lượt thử', async () => {
      const { loop, deps, report } = secondTickFails([{ name: 'XP-80' }])
      await loop.tick()
      await loop.tick()
      expect(deps.printJob).toHaveBeenCalledWith(job)
      expect(report).toHaveBeenCalledWith('tok', 'job-1', true, null, false)
    })

    it('máy không có trong danh sách gần nhất: báo không tìm thấy, không in', async () => {
      const { loop, deps, report } = secondTickFails([{ name: 'Máy khác' }])
      await loop.tick()
      await loop.tick()
      expect(deps.printJob).not.toHaveBeenCalled()
      expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Không tìm thấy máy in "XP-80" trên máy quầy', false)
    })

    it('chưa từng đọc được danh sách: vẫn thử in, để lệnh in tự báo nếu máy sai', async () => {
      const listPrinters = vi.fn<JobLoopDeps['listPrinters']>().mockRejectedValue(new Error('spooler'))
      const { loop, deps, report } = setup({ listPrinters })
      await loop.tick()
      expect(deps.printJob).toHaveBeenCalledWith(job)
      expect(report).toHaveBeenCalledWith('tok', 'job-1', true, null, false)
    })
  })

  describe('không rõ đã in chưa', () => {
    const spool = (r: 'clear' | 'stuck' | 'stuck_remaining') =>
      vi.fn<JobLoopDeps['waitForSpool']>().mockResolvedValue(r)

    it('in treo, hàng đợi sạch: vẫn canh hàng đợi, giữ câu không rõ, không tự in lại', async () => {
      const { loop, deps, report } = setup({ printJob: outcome({ status: 'unknown' }), waitForSpool: spool('clear') })
      await loop.tick()
      expect(deps.waitForSpool).toHaveBeenCalledWith({ printer: 'XP-80', jobId: 'job-1', timeoutMs: 15000 })
      expect(report).toHaveBeenCalledTimes(1)
      expect(report).toHaveBeenCalledWith('tok', 'job-1', false, UNKNOWN, false)
    })

    it('in treo, việc kẹt hàng đợi: báo máy in không phản hồi, phiếu không in muộn', async () => {
      const { loop, report } = setup({ printJob: outcome({ status: 'unknown' }), waitForSpool: spool('stuck') })
      await loop.tick()
      expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Máy in không phản hồi', false)
    })

    it('in treo, xoá không hết: báo xoá tay', async () => {
      const { loop, report } = setup({
        printJob: outcome({ status: 'unknown' }),
        waitForSpool: spool('stuck_remaining'),
      })
      await loop.tick()
      expect(report).toHaveBeenCalledWith('tok', 'job-1', false, STUCK_REMAINING, false)
    })

    it('printJob ném bất ngờ: canh hàng đợi như trên, không ném ra ngoài, không tự in lại', async () => {
      const printJob = vi.fn<JobLoopDeps['printJob']>().mockRejectedValue(new Error('crash'))
      const { loop, deps, report } = setup({ printJob })
      await expect(loop.tick()).resolves.toBeUndefined()
      expect(deps.waitForSpool).toHaveBeenCalledTimes(1)
      expect(report).toHaveBeenCalledWith('tok', 'job-1', false, UNKNOWN, false)
    })

    it('printJob ném, việc kẹt hàng đợi: báo máy in không phản hồi', async () => {
      const printJob = vi.fn<JobLoopDeps['printJob']>().mockRejectedValue(new Error('crash'))
      const { loop, report } = setup({ printJob, waitForSpool: spool('stuck') })
      await loop.tick()
      expect(report).toHaveBeenCalledWith('tok', 'job-1', false, 'Máy in không phản hồi', false)
    })
  })

  it('report lỗi mạng: thử lại 3 lần rồi bỏ, không in lại', async () => {
    const { loop, deps, report } = setup()
    report.mockRejectedValue(new Error('fetch failed'))
    await expect(loop.tick()).resolves.toBeUndefined()
    // 1 lần đầu + 3 lần thử lại
    expect(report).toHaveBeenCalledTimes(4)
    expect(deps.sleep).toHaveBeenCalledTimes(3)
    expect(deps.printJob).toHaveBeenCalledTimes(1)

    await loop.tick()
    expect(deps.printJob).toHaveBeenCalledTimes(1)
  })

  it('report lỗi một lần rồi được: dừng thử lại', async () => {
    const { loop, report } = setup()
    report.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue(undefined)
    await loop.tick()
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('stop(): tick sau không làm gì', async () => {
    const { loop, poll } = setup()
    loop.stop()
    await loop.tick()
    expect(poll).not.toHaveBeenCalled()
  })

  it('đã stop mà lần hỏi đang bay trả revoked (vừa ghép lại): không gọi onRevoked, tránh xoá token mới', async () => {
    let answer: (r: PollResult) => void = () => {}
    const { loop, deps, poll } = setup()
    poll.mockReset()
    poll.mockReturnValue(new Promise<PollResult>((r) => (answer = r)))

    const inFlight = loop.tick()
    await vi.waitFor(() => expect(poll).toHaveBeenCalled())
    loop.stop()
    answer({ ok: false, error: 'revoked' })
    await inFlight
    expect(deps.onRevoked).not.toHaveBeenCalled()
  })

  describe('gửi danh sách máy in', () => {
    const sentPrinters = (poll: ReturnType<typeof setup>['poll']) => poll.mock.calls.map((c) => c[2])
    const list = [{ name: 'XP-80' }]

    it('lần đầu gửi, sau đó không đổi thì gửi null', async () => {
      const { loop, poll } = setup({}, { ok: true, job: null })
      await loop.tick()
      await loop.tick()
      expect(sentPrinters(poll)).toEqual([list, null])
    })

    it('danh sách đổi thì gửi ngay', async () => {
      const listPrinters = vi.fn<JobLoopDeps['listPrinters']>()
      listPrinters.mockResolvedValueOnce(list).mockResolvedValue([{ name: 'XP-80' }, { name: 'Bếp' }])
      const { loop, poll } = setup({ listPrinters }, { ok: true, job: null })
      await loop.tick()
      await loop.tick()
      expect(sentPrinters(poll)).toEqual([list, [{ name: 'XP-80' }, { name: 'Bếp' }]])
    })

    it('không đổi vẫn gửi lại sau 60 giây', async () => {
      let t = 0
      const { loop, poll } = setup({ now: () => t }, { ok: true, job: null })
      await loop.tick()
      t = 59_999
      await loop.tick()
      t = 60_000
      await loop.tick()
      expect(sentPrinters(poll)).toEqual([list, null, list])
    })

    it('poll lỗi thì lần sau gửi lại, vì server chưa nhận được', async () => {
      const { loop, poll } = setup()
      poll.mockReset()
      poll.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue({ ok: true, job: null })
      await loop.tick()
      await loop.tick()
      expect(sentPrinters(poll)).toEqual([list, list])
    })

    it('đọc danh sách lỗi: vẫn hỏi việc, gửi null', async () => {
      const listPrinters = vi.fn<JobLoopDeps['listPrinters']>().mockRejectedValue(new Error('spooler'))
      const { loop, poll } = setup({ listPrinters }, { ok: true, job: null })
      await loop.tick()
      expect(sentPrinters(poll)).toEqual([null])
    })
  })
})
