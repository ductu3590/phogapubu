import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPrintJob, lockDownWindow, PRINT_WINDOW_OPTIONS, SECURE_WEB_PREFERENCES, type PrintWindow } from './print-page'
import { pxToMicrons } from './slip-size'
import type { AgentJob } from './api'

const job: AgentJob = {
  id: '11111111-2222-3333-4444-555555555555',
  kind: 'bill',
  printer_name: 'XP-80',
  render_token: 'tok en',
  attempts: 1,
}

type Signal = { ready: boolean; error: string | null; retryable: boolean; height: number }
const READY: Signal = { ready: true, error: null, retryable: false, height: 400 }

function fakeWindow(over: {
  signal?: () => Promise<Signal>
  load?: () => Promise<unknown>
  print?: (cb: (success: boolean, reason: string) => void) => void
} = {}) {
  const print = vi.fn((_opts: Parameters<PrintWindow['webContents']['print']>[0], cb: (s: boolean, r: string) => void) =>
    (over.print ?? ((done) => done(true, '')))(cb),
  )
  const win = {
    loadURL: vi.fn(over.load ?? (async () => undefined)),
    webContents: {
      executeJavaScript: vi.fn(over.signal ?? (async () => READY)),
      print,
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    },
    destroy: vi.fn(),
  }
  return win
}

function run(win: ReturnType<typeof fakeWindow>, mode: 'measured' | 'printer-default' = 'measured') {
  return createPrintJob({ createWindow: () => win, webOrigin: 'https://admin.test', pageSizeMode: mode })(job)
}

describe('print-page', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mở đúng trang kèm token, in ra đúng máy với chiều cao đo được, rồi đóng cửa sổ', async () => {
    const win = fakeWindow()
    await expect(run(win)).resolves.toEqual({ status: 'printed' })

    expect(win.loadURL).toHaveBeenCalledWith(`https://admin.test/print/agent/${job.id}?t=tok%20en`)
    expect(win.webContents.print.mock.calls[0][0]).toMatchObject({
      silent: true,
      deviceName: 'XP-80',
      pageSize: { width: 80000, height: pxToMicrons(400) },
    })
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  it('printer-default: không ép khổ giấy', async () => {
    const win = fakeWindow()
    await run(win, 'printer-default')
    expect(win.webContents.print.mock.calls[0][0]).toMatchObject({ usePrinterDefaultPageSize: true })
  })

  it('chờ tới khi trang báo sẵn sàng mới in', async () => {
    let ready = false
    const win = fakeWindow({ signal: async () => ({ ...READY, ready }) })
    const p = run(win)
    await vi.advanceTimersByTimeAsync(5000)
    expect(win.webContents.print).not.toHaveBeenCalled()
    ready = true
    await vi.advanceTimersByTimeAsync(500)
    await expect(p).resolves.toEqual({ status: 'printed' })
  })

  it('trang báo lỗi: không in, không thử lại nếu không có cờ', async () => {
    const win = fakeWindow({ signal: async () => ({ ...READY, ready: false, error: 'Phiếu đã hết hạn' }) })
    await expect(run(win)).resolves.toEqual({ status: 'page_error', reason: 'Phiếu đã hết hạn', retryable: false })
    expect(win.webContents.print).not.toHaveBeenCalled()
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  it('trang báo lỗi kèm data-print-retryable: chuyển cờ cho job-loop', async () => {
    const win = fakeWindow({
      signal: async () => ({ ...READY, ready: false, error: 'Không đọc được đơn', retryable: true }),
    })
    await expect(run(win)).resolves.toEqual({ status: 'page_error', reason: 'Không đọc được đơn', retryable: true })
  })

  it('câu đọc tín hiệu lấy đủ ba thuộc tính của <html>', async () => {
    const win = fakeWindow()
    await run(win)
    const [code] = win.webContents.executeJavaScript.mock.calls[0] as unknown as [string]
    expect(code).toContain('data-print-ready')
    expect(code).toContain('data-print-error')
    expect(code).toContain('data-print-retryable')
  })

  it('quá 20 giây không có tín hiệu: signal_timeout, không in, đóng cửa sổ', async () => {
    const win = fakeWindow({ signal: async () => ({ ...READY, ready: false }) })
    const p = run(win)
    await vi.advanceTimersByTimeAsync(19_000)
    expect(win.destroy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_500)
    await expect(p).resolves.toEqual({ status: 'signal_timeout' })
    expect(win.webContents.print).not.toHaveBeenCalled()
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  it('trang treo, executeJavaScript không bao giờ trả lời: vẫn dừng đúng 20 giây', async () => {
    const win = fakeWindow({ signal: () => new Promise<Signal>(() => {}) })
    const p = run(win)
    await vi.advanceTimersByTimeAsync(20_500)
    await expect(p).resolves.toEqual({ status: 'signal_timeout' })
  })

  it('không tải được trang: print_failed để thử lại, không chờ hết 20 giây', async () => {
    const win = fakeWindow({
      load: async () => {
        throw new Error('ERR_INTERNET_DISCONNECTED')
      },
      signal: () => new Promise<Signal>(() => {}),
    })
    const p = run(win)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(p).resolves.toEqual({ status: 'print_failed', reason: 'Không mở được trang phiếu' })
    expect(win.webContents.print).not.toHaveBeenCalled()
  })

  it('print báo thất bại: print_failed kèm lý do', async () => {
    const win = fakeWindow({ print: (done) => done(false, 'Print job failed') })
    await expect(run(win)).resolves.toEqual({ status: 'print_failed', reason: 'Print job failed' })
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  it('print ném ngay vì tên máy sai: print_failed', async () => {
    const win = fakeWindow({
      print: () => {
        throw new Error('Invalid deviceName')
      },
    })
    await expect(run(win)).resolves.toEqual({ status: 'print_failed', reason: 'Invalid deviceName' })
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })

  describe('khoá cửa sổ', () => {
    type WillNavigate = (event: { preventDefault(): void }, url: string) => void

    function navigate(win: ReturnType<typeof fakeWindow>, url: string) {
      const call = win.webContents.on.mock.calls.find((c) => c[0] === 'will-navigate') as unknown as [
        string,
        WillNavigate,
      ]
      const event = { preventDefault: vi.fn() }
      call[1](event, url)
      return event.preventDefault
    }

    it('webPreferences ghi rõ, cửa sổ in giữ tắt throttle', () => {
      expect(SECURE_WEB_PREFERENCES).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true })
      expect(PRINT_WINDOW_OPTIONS.webPreferences).toEqual({ ...SECURE_WEB_PREFERENCES, backgroundThrottling: false })
    })

    it('cửa sổ in từ chối mở cửa sổ mới', async () => {
      const win = fakeWindow()
      await run(win)
      const [handler] = win.webContents.setWindowOpenHandler.mock.calls[0] as unknown as [() => { action: string }]
      expect(handler()).toEqual({ action: 'deny' })
    })

    it('cửa sổ in chặn điều hướng ra ngoài webOrigin, cho đi trong webOrigin', async () => {
      const win = fakeWindow()
      await run(win)
      expect(navigate(win, 'https://evil.test/x')).toHaveBeenCalled()
      expect(navigate(win, 'https://admin.test.evil.test/x')).toHaveBeenCalled()
      expect(navigate(win, 'http://admin.test/print')).toHaveBeenCalled()
      expect(navigate(win, 'https://admin.test/print/agent/1')).not.toHaveBeenCalled()
    })

    it('không truyền origin (cửa sổ ghép máy): chặn mọi điều hướng', () => {
      const win = fakeWindow()
      lockDownWindow(win as unknown as Parameters<typeof lockDownWindow>[0], null)
      expect(navigate(win, 'https://admin.test/')).toHaveBeenCalled()
    })

    it('URL hỏng: chặn, không ném', () => {
      const win = fakeWindow()
      lockDownWindow(win as unknown as Parameters<typeof lockDownWindow>[0], 'https://admin.test')
      expect(navigate(win, 'không phải url')).toHaveBeenCalled()
    })
  })

  it('print không bao giờ gọi lại: unknown sau 30 giây, không để vòng lặp treo', async () => {
    const win = fakeWindow({ print: () => {} })
    const p = run(win)
    await vi.advanceTimersByTimeAsync(30_500)
    await expect(p).resolves.toEqual({ status: 'unknown' })
    expect(win.destroy).toHaveBeenCalledTimes(1)
  })
})
