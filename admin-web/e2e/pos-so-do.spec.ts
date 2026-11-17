// Review tự động POS tab "Sơ đồ" (spec docs/superpowers/specs/2026-11-17-pos-so-do-ban-design.md §5) trên Bảo Lương.
// Dữ liệu: e2e/seed.ts (khu "Khu E2E" + 18 bàn E2E-01..18, một bàn thật "chờ duyệt + gọi NV" seed bằng RPC Mini App).
// Kịch bản tạo phiên / đặt bàn dùng BÀN THẬT đang trống (không dùng bàn E2E — xem luật trong seed.ts);
// global-teardown đóng / huỷ hết.
//
// Chọn cỡ màn bằng tag (playwright.config.ts): @layout chạy cả 3 cỡ, @desktop-layout / @phone-layout theo cỡ,
// không tag = chỉ desktop-1366. Mỗi test mở context mới: cookie chủ quán, localStorage trống (= máy chưa ghim).
// Mọi test fail nếu trang có lỗi console mức error / lỗi JS chưa bắt.

import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import {
  E2E_AREA_NAME,
  E2E_TABLE_COUNT,
  e2eCustomerName,
  e2eTableName,
  openWalkInSession,
  readRunState,
  recordReservationByName,
  recordOpenSessionOnTable,
  recordTouchedTable,
} from './seed'

const POS_URL = '/admin/pos'
const ROW_PX = 120 + 10 // ô 120px + khe 10px (bố cục B)

// Lỗi console được phép bỏ qua (thêm có lý do, đừng nới tay).
const IGNORED_CONSOLE: RegExp[] = []

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      watchConsole(page, errors)
      await use(errors)
      expect(errors, 'Trang có lỗi console').toEqual([])
    },
    { auto: true },
  ],
})

function watchConsole(page: Page, errors: string[]) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
}

// ---------- Định vị ----------

const viewTabs = (page: Page) => page.getByRole('tablist', { name: 'Cách xem' })
const viewTab = (page: Page, name: 'Timeline' | 'Sơ đồ' | 'Danh sách') => viewTabs(page).getByRole('tab', { name, exact: true })
const tiles = (page: Page) => page.locator('button[data-table-id]')
const tileById = (page: Page, id: string) => page.locator(`button[data-table-id="${id}"]`)
const tileByName = (page: Page, name: string) => page.locator(`button[data-table-id][aria-label^="${name}:"]`)
const billPanel = (page: Page) => page.locator('aside[aria-label="Bill"]')
const reservationPanel = (page: Page) => page.locator('aside[aria-label="Tiếp nhận khách"]')
// Bố cục A: chọn khu là ô thả xuống, mỗi lựa chọn "Tên (N)".
const areaSelect = (page: Page) => page.getByRole('combobox', { name: 'Lọc theo khu' })
const workAside = (page: Page) => page.locator('aside[aria-label="Việc cần xử lý"]')
const statusChip = (page: Page, label: string) =>
  page.getByRole('group', { name: 'Lọc theo trạng thái' }).getByRole('button', { name: new RegExp(`^${escapeRe(label)}\\s*\\d+$`) })
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Tìm bàn' })
const openDialog = (page: Page, hasText: string | RegExp) => page.locator('dialog[open]').filter({ hasText })

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function chipCount(chip: Locator): Promise<number> {
  return Number((await chip.locator('span.tabular').innerText()).trim())
}

async function gotoPos(page: Page) {
  await page.goto(POS_URL)
  await expect(viewTabs(page)).toBeVisible({ timeout: 60_000 })
}

async function openFloor(page: Page) {
  await viewTab(page, 'Sơ đồ').click()
  await expect(viewTab(page, 'Sơ đồ')).toHaveAttribute('aria-selected', 'true')
  await expect(tiles(page).first()).toBeVisible()
}

/** Kịch bản đặt bàn cần quán bật đặt bàn — tắt thì fail rõ lý do (không bỏ qua im lặng). */
function requireReservations() {
  expect(readRunState().reservationsEnabled, 'Bảo Lương đang tắt đặt bàn — bật lại hoặc chuyển kịch bản này sang test tay').toBe(true)
}

/** Bàn thật (không phải E2E-xx) đang trống hẳn: nhãn "Trống" (không giữ cho khách đặt), chưa có phiên. */
async function freeRealTables(page: Page, n: number): Promise<{ id: string; name: string }[]> {
  const e2eIds = new Set(readRunState().tableIds)
  const all = await tiles(page).evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-table-id') ?? '',
      label: el.getAttribute('aria-label') ?? '',
      visual: el.getAttribute('data-visual-state'),
    })),
  )
  const free = all
    .filter((t) => t.visual === 'free' && !e2eIds.has(t.id) && t.label.endsWith(': Trống'))
    .map((t) => ({ id: t.id, name: t.label.slice(0, t.label.length - ': Trống'.length) }))
  expect(free.length, `Cần ${n} bàn thật đang trống ở Bảo Lương`).toBeGreaterThanOrEqual(n)
  return free.slice(0, n)
}

/** Mở phiên ở n bàn thật đang trống bằng đúng RPC "Khách lẻ", rồi tải lại POS ở tab Sơ đồ. */
async function withBusyTables(page: Page, n: number) {
  await gotoPos(page)
  await openFloor(page)
  const picked = await freeRealTables(page, n)
  for (const t of picked) await openWalkInSession(t.id)
  await gotoPos(page)
  await openFloor(page)
  for (const t of picked) await expect(tileById(page, t.id)).toHaveAttribute('data-visual-state', /serving|pending|late/)
  return picked
}

/** "YYYY-MM-DDTHH:mm" giờ Việt Nam cho ô datetime-local + "HH:mm". */
function vnLocalInput(ms: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  )
  return { input: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, hhmm: `${p.hour}:${p.minute}` }
}

/** Đo vùng lưới: rộng/cao, nội dung, cột, hàng, số ô thấy trọn không cần cuộn. Ghi annotation + log. */
async function measureGrid(page: Page, total: number, when: string, testInfo: TestInfo) {
  const m = await tiles(page).evaluateAll((els) => {
    const last = els[els.length - 1] as HTMLElement
    const box = last.closest('.overflow-auto') as HTMLElement
    const b = box.getBoundingClientRect()
    const t = last.getBoundingClientRect()
    const grid = last.parentElement as HTMLElement
    const tops = new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))
    return {
      clientH: box.clientHeight,
      scrollH: box.scrollHeight,
      gridW: Math.round(grid.getBoundingClientRect().width),
      lastBottom: Math.round(t.bottom),
      boxBottom: Math.round(b.bottom),
      cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      rows: tops.size,
      visible: els.filter((el) => {
        const r = el.getBoundingClientRect()
        return r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5
      }).length,
    }
  })
  const hiddenRows = Math.max(0, Math.ceil((m.scrollH - m.clientH) / ROW_PX))
  const text =
    `${when}: vùng lưới ${m.gridW}×${m.clientH}px, nội dung cao ${m.scrollH}px, ${m.cols} cột, ${m.rows} hàng ô, ` +
    `${m.visible}/${total} ô thấy trọn không cần cuộn, số hàng phải cuộn ${hiddenRows}`
  testInfo.annotations.push({ type: 'số đo', description: text })
  console.log(`[e2e] ${testInfo.project.name} — ${text}`)
  return { ...m, hiddenRows, text }
}

async function fillReservationForm(dialog: Locator, name: string, arrival?: string) {
  await dialog.getByLabel('Tên khách').fill(name)
  await dialog.getByLabel('Số điện thoại').fill('0900000000')
  await dialog.getByLabel('Số khách').fill('2')
  if (arrival) await dialog.getByLabel('Giờ đến').fill(arrival)
  await dialog.getByRole('button', { name: 'Tạo đặt bàn' }).click()
}

// =====================================================================================================
// A. Màn mặc định
// =====================================================================================================
test.describe('A. Màn mặc định', () => {
  test('tab giữa tên "Sơ đồ"; máy chưa ghim mở Timeline', async ({ page }) => {
    await gotoPos(page)
    await expect(viewTabs(page).getByRole('tab')).toHaveText(['Timeline', 'Sơ đồ', 'Danh sách'])
    await expect(viewTab(page, 'Timeline')).toHaveAttribute('aria-selected', 'true')
  })

  test('bấm Sơ đồ rồi reload → về Timeline (đổi tab chỉ tạm)', async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)
    await page.reload()
    await expect(viewTab(page, 'Timeline')).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 })
  })

  test('ghim Sơ đồ → toast "Máy này sẽ mở POS bằng Sơ đồ", nút thành "Mặc định máy này", reload và context mới cùng storage → vào Sơ đồ', async ({
    page,
    context,
    browser,
    consoleErrors,
  }, testInfo) => {
    await gotoPos(page)
    await openFloor(page)
    await page.getByRole('button', { name: 'Đặt làm mặc định máy này' }).click()
    await expect(page.getByText('Máy này sẽ mở POS bằng Sơ đồ')).toBeVisible()
    await expect(page.getByTitle('Mặc định máy này', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Đặt làm mặc định máy này' })).toHaveCount(0)

    await page.reload()
    await expect(viewTab(page, 'Sơ đồ')).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 })

    const ctx2 = await browser.newContext({
      storageState: await context.storageState(),
      viewport: testInfo.project.use.viewport,
      baseURL: testInfo.project.use.baseURL,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    })
    try {
      const page2 = await ctx2.newPage()
      watchConsole(page2, consoleErrors)
      await gotoPos(page2)
      await expect(viewTab(page2, 'Sơ đồ')).toHaveAttribute('aria-selected', 'true')
    } finally {
      await ctx2.close()
    }
  })

  test('tab Danh sách không có nút ghim', async ({ page }) => {
    await gotoPos(page)
    await viewTab(page, 'Danh sách').click()
    await expect(viewTab(page, 'Danh sách')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Đặt làm mặc định máy này' })).toHaveCount(0)
    await expect(page.getByTitle('Mặc định máy này', { exact: true })).toHaveCount(0)
  })
})

// =====================================================================================================
// B. Lưới + lọc (chạy cả 1366 / 1920 / phone)
// =====================================================================================================
test.describe('B. Lưới + lọc', () => {
  // Bố cục B (màn quầy 1920×1080): thấy đủ mọi ô VÀ cột phải "Việc cần xử lý" luôn hiện cạnh lưới.
  test('1920×1080 chưa chọn bàn: thấy đủ ô bàn không cần cuộn + cột phải "Việc cần xử lý" đang hiện', { tag: '@wide-layout' }, async ({ page }, testInfo) => {
    const state = readRunState()
    await gotoPos(page)
    await openFloor(page)
    await expect(tiles(page)).toHaveCount(state.totalTables)
    if (state.totalTables !== 43) testInfo.annotations.push({ type: 'ghi chú', description: `Quán có ${state.totalTables} bàn (kỳ vọng 43)` })
    expect(state.totalTables).toBeGreaterThanOrEqual(40)
    await expect(workAside(page)).toBeVisible()
    await expect(workAside(page).getByRole('heading', { name: 'Việc cần xử lý' })).toBeVisible()

    const m = await measureGrid(page, state.totalTables, 'chưa chọn bàn, có cột phải', testInfo)
    // 43 ô (gồm 18 bàn E2E) ở 8 cột = 6 hàng × ô 120px phải vừa vùng lưới 1920×1080 có cột phải — không cuộn.
    await page.screenshot({ path: testInfo.outputPath('so-do-1920.png') }) // ảnh cho người xem (nằm trong test-results)
    expect(m.cols, m.text).toBeGreaterThanOrEqual(8)
    expect(m.hiddenRows, m.text).toBe(0)
    expect(m.visible, m.text).toBe(state.totalTables)

    // Mở một bill (cột phải đổi sang bill, lưới giữ nguyên bề ngang) — chỉ ghi số đo.
    const billTable = state.pending?.tableId ?? state.tableIds[0]
    await tileById(page, billTable).click()
    await expect(billPanel(page)).toBeVisible()
    await measureGrid(page, state.totalTables, 'đang mở bill', testInfo)
  })

  // Hàng lọc (tab + chọn khu + chip trạng thái + tìm + Sắp xếp bàn) phải nằm trọn một dòng khi có cột phải;
  // nếu xuống dòng thì nút "Sắp xếp bàn" phải chuyển lên thanh trên (brief task 3).
  test('1920×1080: hàng lọc của Sơ đồ không xuống dòng (cùng một hàng với tab)', { tag: '@wide-layout' }, async ({ page }, testInfo) => {
    await gotoPos(page)
    await openFloor(page)
    const rows = await Promise.all([
      viewTabs(page).boundingBox(),
      areaSelect(page).boundingBox(),
      statusChip(page, 'Tất cả').boundingBox(),
      statusChip(page, 'Sắp có khách đặt').boundingBox(),
      searchBox(page).boundingBox(),
    ])
    const ys = rows.map((b) => {
      expect(b).not.toBeNull()
      return Math.round(b!.y + b!.height / 2)
    })
    const spread = Math.max(...ys) - Math.min(...ys)
    const text = `hàng lọc: tâm dọc các phần tử ${ys.join(', ')} (lệch tối đa ${spread}px)`
    testInfo.annotations.push({ type: 'số đo', description: text })
    console.log(`[e2e] ${testInfo.project.name} — ${text}`)
    expect(spread, text).toBeLessThanOrEqual(12)
    // Sắp xếp bàn nằm ở thanh trên (cùng hàng Ghép bàn trống), cao hơn hàng tab + lọc.
    const arrange = await page.getByRole('button', { name: 'Sắp xếp bàn' }).boundingBox()
    const tabs = await viewTabs(page).boundingBox()
    expect(arrange!.y + arrange!.height, 'Sắp xếp bàn phải ở thanh trên, trên hàng tab').toBeLessThanOrEqual(tabs!.y)
  })

  // Ô 156px nên điện thoại chỉ cần không vỡ trang (không khẳng định số cột).
  test('phone 375: trang Sơ đồ không cuộn ngang', { tag: '@phone-layout' }, async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  // Bố cục B (spec §5.2): lưới xếp liền, KHÔNG tiêu đề khu; mỗi ô có dải tên khu ở đỉnh (aria-hidden, title = tên khu,
  // in hoa bằng CSS); thứ tự theo khu (Khu E2E tạo sau cùng nên đứng sau các khu thật), Chưa phân khu cuối.
  test('Tất cả khu: lưới liền không tiêu đề khu, ô Khu E2E liền nhau và mang dải "Khu E2E" in hoa; chọn "Khu E2E (18)" → 18 ô', { tag: '@layout' }, async ({ page }) => {
    const state = readRunState()
    await gotoPos(page)
    await openFloor(page)
    await expect(areaSelect(page).locator('option:checked')).toHaveText(`Tất cả khu (${state.totalTables})`)
    await expect(page.getByRole('heading', { name: / · \d+ bàn$/ })).toHaveCount(0)

    const cells = await tiles(page).evaluateAll((els) =>
      els.map((el) => {
        const band = el.querySelector('span[aria-hidden="true"][title]') as HTMLElement | null
        return {
          id: el.getAttribute('data-table-id') ?? '',
          band: band?.getAttribute('title') ?? null,
          bandText: band?.textContent ?? null,
          bandUpper: band ? getComputedStyle(band).textTransform === 'uppercase' : false,
          bandH: band ? Math.round(band.getBoundingClientRect().height) : 0,
          // Chấm 7px cũ phải biến mất.
          oldDot: el.querySelector('span[class*="size-[7px]"]') !== null,
        }
      }),
    )
    expect(cells.every((c) => c.band !== null && c.band === c.bandText), 'Mọi ô có dải tên khu, chữ = title').toBe(true)
    expect(cells.some((c) => c.oldDot), 'Không còn chấm màu khu 7px').toBe(false)
    expect(cells.every((c) => c.bandUpper && c.bandH === 22), 'Dải cao 22px, chữ in hoa').toBe(true)

    const e2e = new Set(state.tableIds)
    const idx = cells.flatMap((c, i) => (e2e.has(c.id) ? [i] : []))
    expect(idx).toHaveLength(E2E_TABLE_COUNT)
    // Liền một khối, theo đúng thứ tự E2E-01..18 (y rồi x; bàn seed không có toạ độ nên POS tự xếp theo thứ tự tạo).
    expect(idx[idx.length - 1] - idx[0] + 1, 'Ô Khu E2E phải liền nhau').toBe(E2E_TABLE_COUNT)
    expect(idx.map((i) => cells[i].id)).toEqual(state.tableIds)
    expect(idx.every((i) => cells[i].band === E2E_AREA_NAME), `Ô Khu E2E mang dải "${E2E_AREA_NAME}"`).toBe(true)
    // Trước khối: chỉ bàn thuộc khu thật. Sau khối: chỉ bàn Chưa phân khu (dải xám).
    expect(cells.slice(0, idx[0]).every((c) => c.band !== 'Chưa phân khu'), 'Trước Khu E2E chỉ có bàn của các khu thật').toBe(true)
    expect(cells.slice(idx[idx.length - 1] + 1).every((c) => c.band === 'Chưa phân khu'), 'Sau Khu E2E chỉ còn bàn Chưa phân khu').toBe(true)

    await areaSelect(page).selectOption({ label: `${E2E_AREA_NAME} (${E2E_TABLE_COUNT})` })
    await expect(tiles(page)).toHaveCount(E2E_TABLE_COUNT)
  })

  test('lọc khu Khu E2E → chỉ 18 ô; nút khu hiện đúng số', { tag: '@layout' }, async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)
    // "Nút khu" nay là lựa chọn trong ô thả xuống: "Khu E2E (18)".
    const option = areaSelect(page).locator('option', { hasText: E2E_AREA_NAME })
    await expect(option).toHaveText(`${E2E_AREA_NAME} (${E2E_TABLE_COUNT})`)
    await areaSelect(page).selectOption({ label: `${E2E_AREA_NAME} (${E2E_TABLE_COUNT})` })
    await expect(areaSelect(page).locator('option:checked')).toHaveText(`${E2E_AREA_NAME} (${E2E_TABLE_COUNT})`)
    await expect(tiles(page)).toHaveCount(E2E_TABLE_COUNT)
    for (const label of await tiles(page).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))) {
      expect(label).toMatch(/^E2E-\d{2}:/)
    }
  })

  test('lọc trạng thái: số trên nút khớp số ô hiện ra (Tất cả / Có khách / Trống / Chờ duyệt / Sắp có khách đặt)', { tag: '@layout' }, async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)
    for (const label of ['Tất cả', 'Có khách', 'Trống', 'Chờ duyệt', 'Sắp có khách đặt']) {
      const chip = statusChip(page, label)
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      const n = await chipCount(chip)
      if (n === 0) await expect(page.getByText('Không có bàn nào khớp bộ lọc.')).toBeVisible()
      else await expect(tiles(page), `Nút "${label}" ghi ${n}`).toHaveCount(n)
    }
    // "Tất cả" (trong "Tất cả khu") = mọi bàn của quán.
    await statusChip(page, 'Tất cả').click()
    expect(await chipCount(statusChip(page, 'Tất cả'))).toBe(readRunState().totalTables)
  })

  // Tên bàn E2E có gạch nối ("E2E-01"); tìm kiếm chỉ bỏ dấu + hoa thường, không bỏ gạch nối, nên chuỗi
  // "e2e 0" (có cách) KHÔNG khớp "E2E-01" → dùng "e2e-0". Phần bỏ dấu kiểm bằng một tên bàn thật có dấu
  // (vd. "Bàn 1" ↔ "ban 1").
  test('tìm "e2e 0" không dấu / "E2E-01" → đúng ô; chuỗi không có → "Không có bàn nào khớp bộ lọc."', { tag: '@layout' }, async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)

    await searchBox(page).fill('e2e-0')
    await expect(tiles(page)).toHaveCount(9) // E2E-01..09
    for (const label of await tiles(page).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))) {
      expect(label).toMatch(/^E2E-0\d:/)
    }

    await searchBox(page).fill('E2E-01')
    await expect(tiles(page)).toHaveCount(1)
    await expect(tiles(page).first()).toHaveAttribute('aria-label', /^E2E-01:/)

    // Bỏ dấu: lấy một bàn thật có dấu, gõ không dấu + chữ thường, rồi chữ HOA có dấu.
    await searchBox(page).fill('')
    const names = await tiles(page).evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? '').split(':')[0]))
    const accented = names.find((n) => n.normalize('NFD') !== n)
    expect(accented, 'Bảo Lương cần ít nhất một tên bàn có dấu để kiểm tìm không dấu').toBeTruthy()
    const plain = accented!.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    await searchBox(page).fill(plain)
    await expect(tileByName(page, accented!)).toBeVisible()
    await searchBox(page).fill(accented!.toUpperCase())
    await expect(tileByName(page, accented!)).toBeVisible()

    await searchBox(page).fill('zz-không-có-bàn-này')
    await expect(tiles(page)).toHaveCount(0)
    await expect(page.getByText('Không có bàn nào khớp bộ lọc.')).toBeVisible()
  })
})

// =====================================================================================================
// C + D. Ô bàn + bấm ô
// =====================================================================================================
test.describe('C + D. Ô bàn + bấm ô', () => {
  // Bố cục B: bấm bàn trống mở THẲNG hộp thoại "<bàn> · Gọi món" (không còn bảng 1 bàn trống ở cột phải).
  // Đóng hộp bằng Escape → chưa gửi món nên bàn chưa mở phiên (mig 099), không cần ghi bàn vào run state.
  test('bấm bàn trống → hộp thoại "<bàn> · Gọi món" mở ngay; không còn "Gọi món & mở bàn" / "Đặt bàn cho bàn này"', async ({ page }) => {
    const state = readRunState()
    await gotoPos(page)
    await openFloor(page)
    await tileById(page, state.tableIds[0]).click()
    const sheet = openDialog(page, `${e2eTableName(1)} · Gọi món`)
    await expect(sheet).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gọi món & mở bàn' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Đặt bàn cho bàn này' })).toHaveCount(0)
    await expect(billPanel(page)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    // Chưa chọn món nào → bàn vẫn trống.
    await expect(tileById(page, state.tableIds[0])).toHaveAttribute('data-visual-state', 'free')
  })

  test('bấm bàn trống → chọn 1 món → gửi → hộp đóng, bill bàn đó mở ở cột phải; ô hiện tiền + "0\'"', { tag: '@wide-layout' }, async ({ page }, testInfo) => {
    await gotoPos(page)
    await openFloor(page)
    const [table] = await freeRealTables(page, 1)
    await tileById(page, table.id).click()

    const sheet = openDialog(page, `${table.name} · Gọi món`)
    await expect(sheet).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('so-do-1920-dialog.png') })
    await sheet.locator('div.grid button:not([disabled])').first().click()
    // Món thường vào thẳng "Món bổ sung"; món có loại / topping mở hộp lựa chọn → chờ một trong hai rồi mới xét.
    const addOption = page.getByRole('button', { name: /^Thêm · / })
    await expect(addOption.or(sheet.getByText('Món bổ sung'))).toBeVisible()
    if (await addOption.isVisible()) await addOption.click()
    await expect(sheet.getByText('Món bổ sung')).toBeVisible()
    // Ghi bàn TRƯỚC khi gửi: assert đóng hộp bên dưới có fail thì teardown cùng lượt vẫn đóng phiên vừa mở.
    recordTouchedTable(table.id)
    await sheet.getByRole('button', { name: 'Thêm vào bill · không báo bếp' }).click()
    // Hộp chọn món chỉ đóng khi gửi món thành công (bàn đã mở) → ghi id phiên vừa mở để teardown đóng.
    await expect(sheet).toHaveCount(0)
    expect(await recordOpenSessionOnTable(table.id), 'Bàn vừa gọi món phải có phiên mở').not.toBeNull()

    await expect(billPanel(page).getByRole('heading', { level: 2 })).toContainText(table.name)
    const tile = tileById(page, table.id)
    await expect(tile).not.toHaveAttribute('data-visual-state', 'free')
    await expect(tile).toContainText(/\d[\d.]*đ/)
    // Vừa mở: thời gian ngồi 0' (máy chậm qua phút thì 1').
    await expect(tile).toContainText(/\b[01]'/)
  })

  // Ghép bàn trống: nút thanh trên → cột phải thành bảng ghép + dải trạng thái; bấm 2 bàn → "Ghép thành một mâm" bấm được.
  // KHÔNG bấm "Ghép thành một mâm" (sẽ mở phiên thật) — chỉ kiểm rồi Thoát ghép bàn.
  test('Ghép bàn trống → bấm 2 bàn trống → "Ghép thành một mâm" bấm được; bàn có khách bị khoá; Thoát ghép bàn → về Việc cần xử lý', async ({ page }) => {
    const state = readRunState()
    await gotoPos(page)
    await openFloor(page)
    await page.getByRole('button', { name: 'Ghép bàn trống', exact: true }).click()
    const panel = page.locator('aside[aria-label="Ghép bàn trống"]')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Ghép bàn trống thành một mâm' })).toBeVisible()
    const status = page.getByRole('status').filter({ hasText: 'Đang ghép bàn trống' })
    await expect(status).toContainText('đã chọn 0')
    await expect(panel.getByRole('button', { name: 'Ghép thành một mâm' })).toBeDisabled()

    await tileById(page, state.tableIds[0]).click()
    await tileById(page, state.tableIds[1]).click()
    await expect(status).toContainText('đã chọn 2')
    await expect(panel.getByText('Đã chọn 2 bàn')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Ghép thành một mâm' })).toBeEnabled()
    // Không mở hộp gọi món khi đang ghép.
    await expect(page.locator('dialog[open]')).toHaveCount(0)

    // Bàn đang có khách (bàn chờ duyệt seed) bị khoá với lý do "Không ghép được".
    if (state.pending) {
      await expect(tileById(page, state.pending.tableId)).toHaveAttribute('aria-label', new RegExp(`^${escapeRe(state.pending.tableName)}: Không ghép được`))
    }

    await panel.getByRole('button', { name: 'Thoát ghép bàn', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(status).toHaveCount(0)
    await expect(workAside(page)).toBeVisible()
  })

  test('Ctrl+bấm bàn trống → vào chế độ Ghép bàn trống với bàn đó đã chọn; X của bảng ("Đóng ghép bàn") thoát', async ({ page }) => {
    const state = readRunState()
    await gotoPos(page)
    await openFloor(page)
    await tileById(page, state.tableIds[2]).click({ modifiers: ['ControlOrMeta'] })
    const status = page.getByRole('status').filter({ hasText: 'Đang ghép bàn trống' })
    await expect(status).toContainText('đã chọn 1')
    const panel = page.locator('aside[aria-label="Ghép bàn trống"]')
    await expect(panel.getByRole('listitem')).toHaveText([e2eTableName(3)])
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Đóng ghép bàn' }).click()
    await expect(status).toHaveCount(0)
  })

  // Máy tính bảng 1024 (dưới xl): bảng Ghép bàn trống KHÔNG nền mờ → bấm được bàn trống ngay trên lưới.
  test('1024×768: Ghép bàn trống → bấm 2 bàn trống → "Ghép thành một mâm" bấm được; Thoát ghép bàn → đóng bảng', { tag: '@tablet-layout' }, async ({ page }) => {
    const state = readRunState()
    await gotoPos(page)
    await openFloor(page)
    await page.getByRole('button', { name: 'Ghép bàn trống', exact: true }).click()
    const panel = page.locator('aside[aria-label="Ghép bàn trống"]')
    await expect(panel).toBeVisible()
    await tileById(page, state.tableIds[0]).click()
    await tileById(page, state.tableIds[1]).click()
    await expect(panel.getByText('Đã chọn 2 bàn')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Ghép thành một mâm' })).toBeEnabled()
    await panel.getByRole('button', { name: 'Thoát ghép bàn', exact: true }).click()
    await expect(panel).toHaveCount(0)
  })

  test('bấm bàn trống khi đang mở bill → hộp thoại gọi món của bàn trống mở lên', async ({ page }) => {
    const state = readRunState()
    const [busy] = await withBusyTables(page, 1)
    await tileById(page, busy.id).click()
    await expect(billPanel(page).getByRole('heading', { level: 2 })).toContainText(busy.name)
    await tileById(page, state.tableIds[2]).click()
    const sheet = openDialog(page, `${e2eTableName(3)} · Gọi món`)
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  // Đặt bàn cho một bàn cụ thể: nút "Đặt bàn mới" → chọn bàn đó trong form (không còn nút "Đặt bàn cho bàn này").
  test('Đặt bàn mới chọn bàn → giờ = now+30\' → ô hiện "Đặt HH:mm" → bấm ô mở chi tiết đặt bàn có "Nhận khách"', async ({ page }) => {
    requireReservations()
    await gotoPos(page)
    await openFloor(page)
    const [table] = await freeRealTables(page, 1)
    await page.getByRole('button', { name: 'Đặt bàn mới' }).click()

    const form = openDialog(page, 'Đặt bàn mới')
    await expect(form).toBeVisible()
    await form.getByRole('button', { name: table.name, exact: true }).click()
    await expect(form.getByRole('button', { name: table.name, exact: true })).toHaveClass(/bg-primary/)
    // now + 30', làm tròn lên 5' — vẫn trong khung giữ bàn 60' trước giờ đến.
    const arrival = vnLocalInput(Math.ceil((Date.now() + 30 * 60_000) / 300_000) * 300_000)
    const customer = e2eCustomerName('đặt bàn chọn bàn')
    await fillReservationForm(form, customer, arrival.input)
    await expect(form).toHaveCount(0)
    expect(await recordReservationByName(customer), 'Đặt bàn vừa tạo phải có trong DB').toBe(1)

    // Tạo xong POS mở luôn chi tiết đặt bàn; đóng lại rồi bấm từ ô bàn.
    await expect(reservationPanel(page)).toBeVisible()
    await reservationPanel(page).getByRole('button', { name: 'Đóng' }).click()
    const tile = tileById(page, table.id)
    await expect(tile).toHaveAttribute('aria-label', `${table.name}: Đặt ${arrival.hhmm}`)
    await expect(tile).toContainText(`Đặt ${arrival.hhmm}`)
    await tile.click()
    await expect(reservationPanel(page)).toBeVisible()
    // "Nhận khách" trên giao diện là nút "Khách đã đến · mở mâm".
    await expect(reservationPanel(page).getByRole('button', { name: 'Khách đã đến · mở mâm' })).toBeVisible()
  })

  // Đặt bàn còn xa (chưa tới khung giữ bàn) → ô vẫn trống; bấm vào thì hộp gọi món có dòng vàng nhắc giờ khách đặt.
  test('bàn có đặt xa (now+3h): bấm ô → hộp gọi món có dòng nhắc "Bàn này có khách đặt lúc HH:mm"', async ({ page }) => {
    requireReservations()
    await gotoPos(page)
    await openFloor(page)
    const [table] = await freeRealTables(page, 1)
    await page.getByRole('button', { name: 'Đặt bàn mới' }).click()
    const form = openDialog(page, 'Đặt bàn mới')
    await expect(form).toBeVisible()
    await form.getByRole('button', { name: table.name, exact: true }).click()
    const arrival = vnLocalInput(Math.ceil((Date.now() + 180 * 60_000) / 300_000) * 300_000)
    const customer = e2eCustomerName('đặt xa nhắc giờ')
    await fillReservationForm(form, customer, arrival.input)
    await expect(form).toHaveCount(0)
    expect(await recordReservationByName(customer), 'Đặt bàn vừa tạo phải có trong DB').toBe(1)
    await reservationPanel(page).getByRole('button', { name: 'Đóng' }).click()

    await tileById(page, table.id).click()
    const sheet = openDialog(page, `${table.name} · Gọi món`)
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('note')).toHaveText(`Bàn này có khách đặt lúc ${arrival.hhmm}. Vẫn mở bàn được, nhớ báo khách.`)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  test('Ctrl+bấm hai ô có khách → bill gộp 2 mâm', async ({ page }) => {
    const [a, b] = await withBusyTables(page, 2)
    await tileById(page, a.id).click({ modifiers: ['ControlOrMeta'] })
    await tileById(page, b.id).click({ modifiers: ['ControlOrMeta'] })
    await expect(billPanel(page).getByRole('heading', { level: 2 })).toHaveText('Gộp bill 2 mâm')
  })

  // Bố cục A: ô vừa chờ duyệt vừa gọi NV chỉ còn chuông đỏ (aria-label "Đang gọi nhân viên") cạnh tên, để nhãn
  // "Chờ duyệt · N" đủ chỗ. Tiêu đề giữ nguyên văn brief.
  test('(nếu seed được) ô chờ duyệt có "Chờ duyệt · N" + viền vàng; ô gọi NV có "Gọi NV"', async ({ page }) => {
    const state = readRunState()
    // Không seed được thì fail kèm lý do — khi đó bỏ kịch bản này khỏi e2e và đưa sang checklist tay (Task 7).
    expect(state.pending, `Không seed được chờ duyệt: ${state.pendingSkipReason ?? ''}`).not.toBeNull()
    const pending = state.pending!
    await gotoPos(page)
    await openFloor(page)
    const tile = tileById(page, pending.tableId)
    await expect(tile).toHaveAttribute('aria-label', new RegExp(`^${escapeRe(pending.tableName)}: Chờ duyệt · \\d+`))
    await expect(tile).toContainText(/Chờ duyệt · \d+/)
    await expect(tile).toHaveClass(/ring-amber-500/)
    expect(pending.serviceRequestId, `Không seed được gọi NV: ${state.pendingSkipReason ?? ''}`).not.toBeNull()
    await expect(tile.getByRole('img', { name: 'Đang gọi nhân viên' })).toBeVisible()
    await expect(tile).not.toContainText('Gọi NV')
    await expect(tile).toHaveAttribute('aria-label', /đang gọi nhân viên/)
    // Nhãn "Chờ duyệt · N" hiện đủ, không bị cắt "…".
    const label = tile.locator('span.truncate', { hasText: /^Chờ duyệt · \d+$/ })
    await expect(label).toBeVisible()
    const fit = await label.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(fit.scroll, `Nhãn chờ duyệt bị cắt (scrollWidth ${fit.scroll} > clientWidth ${fit.client})`).toBeLessThanOrEqual(fit.client)
  })
})

// =====================================================================================================
// E. Đặt bàn + Sắp xếp
// =====================================================================================================
test.describe('E. Đặt bàn + Sắp xếp', () => {
  test('đang ở Timeline, duyệt đặt bàn cần xếp bàn → tự sang Sơ đồ → chọn bàn → xác nhận → quay về Timeline', async ({ page }) => {
    requireReservations()
    await gotoPos(page)
    // Lấy sẵn một bàn trống thật, rồi về Timeline (tab đang đứng trước khi duyệt).
    await openFloor(page)
    const [table] = await freeRealTables(page, 1)
    await viewTab(page, 'Timeline').click()
    await expect(viewTab(page, 'Timeline')).toHaveAttribute('aria-selected', 'true')

    // Đặt bàn chưa xếp bàn (chờ duyệt) tạo bằng nút "Đặt bàn mới", không chọn bàn.
    await page.getByRole('button', { name: 'Đặt bàn mới' }).click()
    const form = openDialog(page, 'Đặt bàn mới')
    const customer = e2eCustomerName('chờ xếp bàn')
    await fillReservationForm(form, customer)
    await expect(form).toHaveCount(0)
    expect(await recordReservationByName(customer), 'Đặt bàn vừa tạo phải có trong DB').toBe(1)

    await reservationPanel(page).getByRole('button', { name: 'Xác nhận & chọn bàn' }).click()
    await expect(viewTab(page, 'Sơ đồ')).toHaveAttribute('aria-selected', 'true')
    const pick = page.locator('aside[aria-label="Xác nhận đặt bàn"]')
    await expect(pick).toBeVisible()
    await tileById(page, table.id).click()
    await expect(pick.getByText('Đã chọn 1 bàn')).toBeVisible()
    await pick.getByRole('button', { name: 'Xác nhận bàn' }).click()
    await expect(pick).toHaveCount(0)
    await expect(viewTab(page, 'Timeline')).toHaveAttribute('aria-selected', 'true')
  })

  test('lọc Khu E2E rồi bấm Sắp xếp bàn → màn sắp xếp mở đúng khu đó; Huỷ → về lưới, bộ lọc giữ nguyên', async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)
    await areaSelect(page).selectOption({ label: `${E2E_AREA_NAME} (${E2E_TABLE_COUNT})` })
    await expect(tiles(page)).toHaveCount(E2E_TABLE_COUNT)

    await page.getByRole('button', { name: 'Sắp xếp bàn' }).click()
    const areaTabs = page.locator('[aria-label="Khu vực"]')
    await expect(areaTabs.locator('button[aria-pressed="true"]')).toContainText(E2E_AREA_NAME)

    await page.getByRole('button', { name: 'Hủy chỉnh sửa' }).click()
    await expect(areaSelect(page).locator('option:checked')).toHaveText(`${E2E_AREA_NAME} (${E2E_TABLE_COUNT})`)
    await expect(tiles(page)).toHaveCount(E2E_TABLE_COUNT)
  })
})

// =====================================================================================================
// F. Không thụt lùi
// =====================================================================================================
test.describe('F. Không thụt lùi', () => {
  // Bố cục B: ở Sơ đồ, Việc cần xử lý là cột phải CỐ ĐỊNH từ xl (không còn ngăn kéo); nút "Việc cần xử lý" chỉ hiện dưới xl.
  test('1366 ở Sơ đồ chưa chọn gì: cột phải "Việc cần xử lý" cố định (không phủ), nút mở ngăn kéo ẩn; Timeline vẫn có cột', async ({ page }) => {
    await gotoPos(page)
    await openFloor(page)
    await expect(workAside(page)).toBeVisible()
    await expect(billPanel(page)).toHaveCount(0)
    expect(await workAside(page).evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed')
    await expect(page.getByRole('button', { name: /^Việc cần xử lý/ })).toBeHidden()
    // Cột phải nằm bên phải lưới, không đè lên lưới.
    const gridRight = await tiles(page).first().evaluate((el) => Math.round((el.parentElement as HTMLElement).getBoundingClientRect().right))
    const aside = await workAside(page).boundingBox()
    expect(gridRight, 'Lưới không đè cột phải').toBeLessThanOrEqual(Math.round(aside!.x) + 1)

    await viewTab(page, 'Timeline').click()
    await expect(workAside(page)).toBeVisible()
    expect(await workAside(page).evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed')
  })

  test('Timeline và Danh sách vẫn vẽ (có hàng bàn / có dòng), không lỗi console', async ({ page }) => {
    await withBusyTables(page, 1) // để Danh sách chắc chắn có ít nhất một dòng
    await viewTab(page, 'Timeline').click()
    await expect(page.locator('[data-name-col]').first()).toBeVisible()
    await expect(page.locator(`section[aria-label="${E2E_AREA_NAME}"]`)).toBeVisible()
    await viewTab(page, 'Danh sách').click()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })

  test('cỡ 1024 (dưới xl): bấm bàn → bill hiện dạng sheet có nút đóng', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    const [busy] = await withBusyTables(page, 1)
    await tileById(page, busy.id).click()
    const panel = billPanel(page)
    await expect(panel).toBeVisible()
    // Dưới xl: sheet đáy cố định (position fixed) có nút đóng ở đầu.
    expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    await panel.getByRole('button', { name: 'Đóng bill' }).click()
    await expect(panel).toHaveCount(0)
  })
})
