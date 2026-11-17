import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Lớp review tự động cho POS tab "Sơ đồ" (Task 6, spec 2026-11-17). Chạy trên dev server của chính
// worktree này + quán Bảo Lương thật (dữ liệu prod đều là dữ liệu test). Dữ liệu thử do e2e/seed.ts dựng và dọn.
//
// Ba cỡ màn, chọn test bằng tag (không dùng test.skip):
//   @layout          kịch bản bố cục chạy ở cả ba cỡ
//   @desktop-layout  chỉ cỡ máy tính (1366 + 1920)   @phone-layout  chỉ cỡ điện thoại
//   @wide-layout     chỉ màn quầy 1920×1080 (bố cục B: đo số ô + cột phải + hàng lọc)
//   @tablet-layout   chỉ máy tính bảng 1024×768 (dưới xl: bảng bill là sheet đáy)
//   không tag        kịch bản thao tác — chỉ desktop-1366
// workers: 1 — mọi test dùng chung một quán, chạy song song sẽ giẫm dữ liệu của nhau.

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const port = new URL(baseURL).port || '3000'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Dev server biên dịch trang lần đầu khá lâu; thao tác qua server action + Realtime cần thêm thời gian.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL,
    storageState: path.join(__dirname, 'e2e/.auth/owner.json'), // global-setup ghi
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: {
    // Không ai phải tự bật server: đã có server ở cổng này thì dùng lại, chưa có thì tự chạy `next dev`.
    command: `npm run dev -- -p ${port}`,
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'desktop-1366',
      grepInvert: [/@phone-layout/, /@tablet-layout/, /@wide-layout/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'desktop-1920',
      grep: [/@layout/, /@desktop-layout/, /@wide-layout/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'tablet-1024',
      grep: [/@tablet-layout/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
    {
      name: 'phone',
      grep: [/@layout/, /@phone-layout/],
      // Chromium với cỡ điện thoại (không đổi sang WebKit: chỉ cài Chromium).
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
})
