import type { WebContentsPrintOptions } from 'electron'
import type { AgentJob } from './api'
import type { PrintOutcome } from './job-loop'
import { buildPrintOptions, type PageSizeMode } from './slip-size'
import { orTimeout, sleep } from './timeout'

// Chỉ phần dùng tới của BrowserWindow, để test được mà không cần Electron
export interface PrintWindow {
  loadURL(url: string): Promise<unknown>
  webContents: {
    executeJavaScript(code: string): Promise<unknown>
    print(options: WebContentsPrintOptions, callback: (success: boolean, failureReason: string) => void): void
  }
  destroy(): void
}

// Rộng 302px ~ 80mm. Tắt throttle: cửa sổ ẩn bị bóp timer thì trang không báo tín hiệu kịp, đo sai chiều cao.
export const PRINT_WINDOW_OPTIONS = {
  show: false,
  width: 302,
  height: 100,
  webPreferences: { backgroundThrottling: false },
}

const SIGNAL_TIMEOUT_MS = 20_000
const SIGNAL_POLL_MS = 200
// Trang đang tải hoặc đã treo thì executeJavaScript không trả lời; không có hạn này sẽ kẹt qua mốc 20 giây
const SIGNAL_READ_TIMEOUT_MS = 1_000
const PRINT_TIMEOUT_MS = 30_000

const READ_SIGNAL = `(() => {
  const html = document.documentElement
  return {
    ready: html.getAttribute('data-print-ready') === '1',
    error: html.getAttribute('data-print-error'),
    retryable: html.getAttribute('data-print-retryable') === '1',
    height: html.scrollHeight,
  }
})()`

type PageSignal = { ready: boolean; error: string | null; retryable: boolean; height: number }

type SignalResult = { heightPx: number } | { outcome: PrintOutcome }

async function waitForSignal(win: PrintWindow, url: string): Promise<SignalResult> {
  const deadline = Date.now() + SIGNAL_TIMEOUT_MS
  let loadFailed = false
  win.loadURL(url).catch(() => {
    loadFailed = true
  })

  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0) return { outcome: { status: 'signal_timeout' } }

    const read = win.webContents.executeJavaScript(READ_SIGNAL) as Promise<PageSignal>
    const signal = await orTimeout(read, Math.min(SIGNAL_READ_TIMEOUT_MS, left)).catch(() => null)
    if (loadFailed) return { outcome: { status: 'print_failed', reason: 'Không mở được trang phiếu' } }

    if (signal && signal.error !== null) {
      return { outcome: { status: 'page_error', reason: signal.error || 'Phiếu bị lỗi', retryable: signal.retryable } }
    }
    if (signal?.ready) return { heightPx: signal.height }

    await sleep(Math.max(0, Math.min(SIGNAL_POLL_MS, deadline - Date.now())))
  }
}

function print(win: PrintWindow, options: WebContentsPrintOptions): Promise<PrintOutcome> {
  return new Promise((resolve) => {
    // Lệnh in đã gửi mà không thấy trả lời thì không biết giấy có ra chưa, nên là 'unknown' chứ không phải thất bại
    const timer = setTimeout(() => resolve({ status: 'unknown' }), PRINT_TIMEOUT_MS)
    try {
      win.webContents.print(options, (success, failureReason) => {
        clearTimeout(timer)
        resolve(success ? { status: 'printed' } : { status: 'print_failed', reason: failureReason || 'Không rõ lý do' })
      })
    } catch (e) {
      clearTimeout(timer)
      resolve({ status: 'print_failed', reason: e instanceof Error ? e.message : 'Không gọi được lệnh in' })
    }
  })
}

export function createPrintJob(deps: {
  createWindow(): PrintWindow
  webOrigin: string
  pageSizeMode: PageSizeMode
}): (job: AgentJob) => Promise<PrintOutcome> {
  return async (job) => {
    const url = `${deps.webOrigin}/print/agent/${job.id}?t=${encodeURIComponent(job.render_token)}`
    const win = deps.createWindow()
    try {
      const signal = await waitForSignal(win, url)
      if ('outcome' in signal) return signal.outcome
      return await print(
        win,
        buildPrintOptions({
          deviceName: job.printer_name,
          mode: deps.pageSizeMode,
          contentHeightPx: signal.heightPx,
        }),
      )
    } finally {
      win.destroy()
    }
  }
}
