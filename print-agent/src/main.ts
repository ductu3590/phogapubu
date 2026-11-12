import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, Tray } from 'electron'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createApi, type Api, type PrinterEntry } from './api'
import { loadConfig } from './config'
import { createFileLog } from './file-log'
import { createJobLoop } from './job-loop'
import { createPrintJob, lockDownWindow, PRINT_WINDOW_OPTIONS, SECURE_WEB_PREFERENCES } from './print-page'
import { createSpoolCommands, waitForSpool } from './spooler'
import { orTimeout, sleep } from './timeout'
import { createTokenStore } from './token-store'

const POLL_INTERVAL_MS = 2_000
// Danh sách máy in đọc mỗi lần hỏi việc, treo mà không có hạn thì cả vòng lặp đứng theo
const LIST_PRINTERS_TIMEOUT_MS = 5_000

type Status = 'running' | 'offline' | 'needs_pair'

const STATUS_LABEL: Record<Status, string> = {
  running: 'Đang chạy',
  offline: 'Mất kết nối',
  needs_pair: 'Cần ghép máy',
}

// Tên dòng tự chạy trong HKCU\...\CurrentVersion\Run. PHẢI khớp MEVO_RUN_NAME ở installer/installer.nsh
// (bản cài ghi sẵn dòng này), lệch nhau là Windows có hai dòng khởi động cho cùng một phần mềm
const LOGIN_ITEM_NAME = 'MEVO In'

const SPOOL_WARNING = 'Cảnh báo: không đọc được hàng đợi Windows, phiếu kẹt sẽ không bị phát hiện'

let status: Status = 'offline'
let spoolWarning = false
let tray: Tray | null = null
let pairWindow: BrowserWindow | null = null
let stopCurrentLoop: (() => void) | null = null

function setStatus(next: Status) {
  if (status === next) return
  status = next
  renderTray()
}

function setSpoolWarning(next: boolean) {
  if (spoolWarning === next) return
  spoolWarning = next
  renderTray()
}

function renderTray() {
  if (!tray) return
  tray.setToolTip(spoolWarning ? `MEVO In: ${SPOOL_WARNING}` : `MEVO In: ${STATUS_LABEL[status]}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: STATUS_LABEL[status], enabled: false },
      ...(spoolWarning ? [{ label: SPOOL_WARNING, enabled: false }] : []),
      { type: 'separator' },
      { label: 'Ghép lại', click: openPairWindow },
      { label: 'Thoát', click: () => app.quit() },
    ]),
  )
}

function openPairWindow() {
  if (pairWindow) {
    pairWindow.show()
    pairWindow.focus()
    return
  }
  pairWindow = new BrowserWindow({
    width: 400,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'MEVO In - Ghép máy',
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: join(__dirname, 'pair-preload.js') },
  })
  lockDownWindow(pairWindow, null)
  pairWindow.setMenu(null)
  pairWindow.on('closed', () => {
    pairWindow = null
  })
  void pairWindow.loadFile(join(app.getAppPath(), 'src', 'pair-window.html'))
}

async function start() {
  const configPath = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'agent.config.json')
  let config
  try {
    config = loadConfig(configPath)
  } catch (e) {
    dialog.showErrorBox('MEVO In', e instanceof Error ? e.message : 'Không đọc được agent.config.json')
    app.quit()
    return
  }

  // Chỉ bản đã cài mới tự chạy cùng Windows; chạy thử bằng npm start không được đăng ký electron.exe
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, name: LOGIN_ITEM_NAME })

  const api: Api = createApi(config)
  const version = app.getVersion()
  const tokenStore = createTokenStore(app.getPath('userData'), safeStorage)
  const log = createFileLog(join(app.getPath('userData'), 'agent.log'))
  const spool = createSpoolCommands()
  const printJob = createPrintJob({
    createWindow: () => new BrowserWindow(PRINT_WINDOW_OPTIONS),
    webOrigin: config.webOrigin,
    pageSizeMode: config.pageSizeMode,
  })
  // Cửa sổ ẩn sống suốt để hỏi danh sách máy in, API này chỉ có trên webContents
  const printerProbe = new BrowserWindow({ show: false, width: 1, height: 1, webPreferences: SECURE_WEB_PREFERENCES })

  async function listPrinters(): Promise<PrinterEntry[]> {
    const printers = await orTimeout(printerProbe.webContents.getPrintersAsync(), LIST_PRINTERS_TIMEOUT_MS)
    if (!printers) throw new Error('Đọc danh sách máy in quá hạn')
    return printers.map((p) => ({ name: p.name }))
  }

  async function watchSpool(input: { printer: string; jobId: string; timeoutMs: number }) {
    let watchFailed = false
    const result = await waitForSpool({
      ...input,
      list: spool.list,
      remove: spool.remove,
      sleep,
      onWatchFailed: (error) => {
        watchFailed = true
        const reason = error instanceof Error ? error.message : String(error)
        log(`Không đọc được hàng đợi máy in "${input.printer}", phiếu ${input.jobId}: ${reason}`)
      },
    })
    setSpoolWarning(watchFailed)
    return result
  }

  function startLoop(token: string) {
    stopCurrentLoop?.()
    const loop = createJobLoop({
      api,
      token,
      version,
      listPrinters,
      printJob,
      waitForSpool: watchSpool,
      onRevoked: () => {
        stopCurrentLoop?.()
        stopCurrentLoop = null
        tokenStore.clear()
        setStatus('needs_pair')
        openPairWindow()
      },
      onOffline: () => setStatus('offline'),
      onOnline: () => setStatus('running'),
      sleep,
    })
    const timer = setInterval(() => void loop.tick(), POLL_INTERVAL_MS)
    stopCurrentLoop = () => {
      clearInterval(timer)
      loop.stop()
    }
    void loop.tick()
  }

  ipcMain.handle('pair:submit', async (_event, code: unknown) => {
    const value = String(code ?? '').trim()
    if (!/^\d{6}$/.test(value)) return { ok: false, error: 'Nhập đủ 6 số' }

    let result
    try {
      result = await api.pair(value, hostname(), version)
    } catch {
      return { ok: false, error: 'Không kết nối được máy chủ, thử lại sau' }
    }
    if (!result.ok) return { ok: false, error: result.error }

    try {
      tokenStore.save(result.token)
    } catch {
      return { ok: false, error: 'Không lưu được khoá ghép máy trên máy này' }
    }
    startLoop(result.token)
    return { ok: true, storeName: result.store_name }
  })

  tray = new Tray(join(app.getAppPath(), 'assets', 'tray.png'))
  renderTray()

  const token = tokenStore.load()
  if (token) {
    startLoop(token)
  } else {
    setStatus('needs_pair')
    openPairWindow()
  }
}

if (app.requestSingleInstanceLock()) {
  // Bấm lối tắt Desktop khi phần mềm đã chạy: không mở bản thứ hai, chỉ cho người ở quầy biết nó đang ở đâu
  app.on('second-instance', () => {
    if (status === 'needs_pair') {
      openPairWindow()
      return
    }
    tray?.displayBalloon({
      title: 'MEVO In đang chạy',
      content: `${STATUS_LABEL[status]}. Biểu tượng nằm ở khay hệ thống cạnh đồng hồ, bấm chuột phải để xem.`,
    })
  })
  // Không có cửa sổ vẫn phải sống ở khay hệ thống
  app.on('window-all-closed', () => undefined)
  void app.whenReady().then(start)
} else {
  app.quit()
}
