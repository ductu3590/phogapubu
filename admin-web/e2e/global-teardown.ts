import fs from 'node:fs'
import { RUN_STATE_PATH, cleanup, readRunState } from './seed'

// Playwright chạy globalTeardown sau toàn bộ test, KỂ CẢ khi test fail. Nếu chính global-setup hỏng, seed() đã tự
// dọn phần đã tạo trước khi ném lỗi. Dọn xong mới xoá run.json; dọn chưa sạch thì giữ run.json để chạy lại teardown.
export default async function globalTeardown() {
  if (!fs.existsSync(RUN_STATE_PATH)) return
  const state = readRunState()
  await cleanup(state)
  // Giữ bản sao (không có token) để kiểm DB sau lượt chạy: e2e/.auth/last-run.json.
  fs.copyFileSync(RUN_STATE_PATH, RUN_STATE_PATH.replace(/run\.json$/, 'last-run.json'))
  fs.rmSync(RUN_STATE_PATH, { force: true })
  console.log(`[e2e] Đã dọn dữ liệu thử ở ${state.storeName}.`)
}
