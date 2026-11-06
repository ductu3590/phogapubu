import type { AgentJob, Api, PrinterEntry } from './api'
import type { SleepFn, SpoolResult } from './spooler'

export type PrintOutcome =
  | { status: 'printed' }
  | { status: 'print_failed'; reason: string }
  | { status: 'page_error'; reason: string; retryable: boolean }
  | { status: 'signal_timeout' }
  // Lệnh in đã gửi nhưng không biết kết quả. Tự in lại có thể ra hai phiếu nên để người quyết định.
  | { status: 'unknown' }

export interface JobLoopDeps {
  api: Pick<Api, 'poll' | 'report'>
  token: string
  version: string
  listPrinters(): Promise<PrinterEntry[]>
  printJob(job: AgentJob): Promise<PrintOutcome>
  waitForSpool(input: { printer: string; jobId: string; timeoutMs: number }): Promise<SpoolResult>
  onRevoked(): void
  onOffline(): void
  onOnline(): void
  sleep: SleepFn
  now?: () => number
}

const SPOOL_TIMEOUT_MS = 15_000
const PRINTERS_RESEND_MS = 60_000
const REPORT_RETRIES = 3
const REPORT_RETRY_DELAY_MS = 1_000
const UNKNOWN_RESULT = 'Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại'
const SPOOL_ERROR: Record<Exclude<SpoolResult, 'clear'>, string> = {
  stuck: 'Máy in không phản hồi',
  stuck_remaining: 'Máy in không phản hồi, phiếu còn trong hàng đợi Windows, xoá tay trước khi In lại',
}

export function createJobLoop(deps: JobLoopDeps): { tick(): Promise<void>; stop(): void } {
  const now = deps.now ?? Date.now
  let running = false
  let stopped = false
  let sentFingerprint: string | null = null
  let sentAt = 0
  // Danh sách đọc được gần nhất. Đọc lỗi một lần không phải lý do đốt một lượt thử của job đã nhận.
  let knownPrinters: PrinterEntry[] | null = null

  async function report(jobId: string, ok: boolean, error: string | null, retryable: boolean) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await deps.api.report(deps.token, jobId, ok, error, retryable)
        return
      } catch {
        // Hết lượt thì bỏ, KHÔNG in lại: server tự chuyển job thành "Không rõ đã in chưa" sau 2 phút
        if (attempt >= REPORT_RETRIES) return
        await deps.sleep(REPORT_RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  async function handleJob(job: AgentJob) {
    // Chưa từng đọc được danh sách thì cứ in: máy sai thì chính lệnh in sẽ báo
    if (knownPrinters && !knownPrinters.some((p) => p.name === job.printer_name)) {
      await report(job.id, false, `Không tìm thấy máy in "${job.printer_name}" trên máy quầy`, false)
      return
    }

    let outcome: PrintOutcome
    try {
      outcome = await deps.printJob(job)
    } catch {
      outcome = { status: 'unknown' }
    }

    // Hai ca này chưa gọi lệnh in nên hàng đợi không có gì để canh
    if (outcome.status === 'page_error') {
      await report(job.id, false, outcome.reason, outcome.retryable)
      return
    }
    if (outcome.status === 'signal_timeout') {
      await report(job.id, false, 'Trang phiếu không phản hồi', true)
      return
    }

    // Ba ca còn lại đều có thể đã để lại việc trong hàng đợi, kể cả khi print báo lỗi hoặc không trả lời.
    // Không canh thì phiếu tự in lúc cắm lại máy, và thử lại sẽ ra hai phiếu.
    const spool = await deps.waitForSpool({ printer: job.printer_name, jobId: job.id, timeoutMs: SPOOL_TIMEOUT_MS })
    if (spool !== 'clear') {
      await report(job.id, false, SPOOL_ERROR[spool], false)
      return
    }

    switch (outcome.status) {
      case 'printed':
        await report(job.id, true, null, false)
        return
      case 'print_failed':
        await report(job.id, false, `In thất bại: ${outcome.reason}`, true)
        return
      case 'unknown':
        await report(job.id, false, UNKNOWN_RESULT, false)
        return
    }
  }

  async function runOnce() {
    const printers = await deps.listPrinters().catch(() => null)
    if (printers) knownPrinters = printers
    const fingerprint = printers && JSON.stringify(printers)
    const shouldSend =
      fingerprint !== null && (fingerprint !== sentFingerprint || now() - sentAt >= PRINTERS_RESEND_MS)

    const res = await deps.api.poll(deps.token, deps.version, shouldSend ? printers : null)
    if (!res.ok) {
      if (res.error === 'revoked') {
        // Đã stop nghĩa là vừa ghép lại: token cũ bị thu hồi là đúng, gọi onRevoked sẽ xoá nhầm token mới
        if (!stopped) {
          stopped = true
          deps.onRevoked()
        }
      } else {
        deps.onOffline()
      }
      return
    }

    deps.onOnline()
    // Chỉ ghi nhận sau khi poll thành công, poll lỗi thì lần sau gửi lại
    if (shouldSend) {
      sentFingerprint = fingerprint
      sentAt = now()
    }
    if (res.job) await handleJob(res.job)
  }

  return {
    async tick() {
      if (stopped || running) return
      running = true
      try {
        await runOnce()
      } catch {
        deps.onOffline()
      } finally {
        running = false
      }
    },
    stop() {
      stopped = true
    },
  }
}
