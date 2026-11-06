// Bài thử in ngầm 80mm. Chạy: npm run spike -- --printer "<tên>" --mode measured|printer-default --fixture short|long|qr
// Thêm --title "<tên việc>" để đặt tên việc trong hàng đợi Windows (mặc định MEVO-spike-<fixture>).
// Không có --printer thì chỉ liệt kê máy in rồi thoát.
import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { buildPrintOptions, type PageSizeMode } from '../slip-size'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const FIXTURES = ['short', 'long', 'qr']

async function run(): Promise<number> {
  const printer = arg('printer')
  const mode = (arg('mode') ?? 'measured') as PageSizeMode
  const fixture = arg('fixture') ?? 'short'

  // Cửa sổ ẩn, rộng 302px (~80mm), tắt throttle để đo chiều cao đúng
  const win = new BrowserWindow({
    show: false,
    width: 302,
    height: 100,
    webPreferences: { backgroundThrottling: false },
  })

  if (!printer) {
    const list = await win.webContents.getPrintersAsync()
    console.log('Máy in tìm thấy:')
    for (const p of list) console.log(`- ${p.name}`)
    if (list.length === 0) console.log('(không có máy in nào)')
    win.destroy()
    return 0
  }
  if (mode !== 'measured' && mode !== 'printer-default') {
    console.error(`--mode không hợp lệ: ${mode}`)
    win.destroy()
    return 2
  }
  if (!FIXTURES.includes(fixture)) {
    console.error(`--fixture không hợp lệ: ${fixture}`)
    win.destroy()
    return 2
  }

  // Fixture nằm trong src/ (không được tsc chép sang out/)
  await win.loadFile(path.join(__dirname, '..', '..', 'src', 'spike', `fixture-${fixture}.html`))
  const title = arg('title') ?? `MEVO-spike-${fixture}`
  await win.webContents.executeJavaScript(`document.title = ${JSON.stringify(title)}`)
  const heightPx: number = await win.webContents.executeJavaScript(
    'document.documentElement.scrollHeight',
  )

  const opts = buildPrintOptions({ deviceName: printer, mode, contentHeightPx: heightPx })
  const result = await new Promise<{ success: boolean; failureReason: string }>((resolve) => {
    win.webContents.print(opts, (success, failureReason) => resolve({ success, failureReason }))
  })
  console.log(
    JSON.stringify({ printer, mode, fixture, heightPx, success: result.success, failureReason: result.failureReason }),
  )
  win.destroy()
  return result.success ? 0 : 1
}

app.whenReady().then(async () => {
  let code = 1
  try {
    code = await run()
  } catch (e) {
    console.error(e)
  }
  app.exit(code)
})
