import fs from 'node:fs'
import type { FullConfig } from '@playwright/test'
import { AUTH_DIR, RUN_STATE_PATH, STORAGE_STATE_PATH, cleanup, loadEnv, mintOwnerSession, readRunState, seed, sessionCookies } from './seed'

// 1) Kiểm env (thiếu .env.local → lỗi tiếng Việt). 2) Lượt trước dọn chưa sạch (còn run.json) → dọn nốt.
// 3) Dựng dữ liệu thử ở Bảo Lương (seed tự dọn nếu hỏng giữa chừng). 4) Mint phiên chủ quán → storageState
// (chỉ cookie; localStorage trống = máy chưa ghim màn mặc định). Không in token: e2e/.auth/ nằm trong .gitignore.
export default async function globalSetup(config: FullConfig) {
  loadEnv()
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  if (fs.existsSync(RUN_STATE_PATH)) {
    console.log('[e2e] Lượt trước còn dữ liệu chưa dọn — dọn trước.')
    await cleanup(readRunState())
    fs.rmSync(RUN_STATE_PATH, { force: true })
  }

  const state = await seed()
  console.log(
    `[e2e] ${state.storeName}: thêm ${state.tableIds.length} bàn E2E, quán có ${state.totalTables} bàn; ` +
      `đặt bàn ${state.reservationsEnabled ? 'bật' : 'tắt'}; chờ duyệt/gọi NV: ${state.pending ? state.pending.tableName : 'không seed'}` +
      (state.pendingSkipReason ? ` (${state.pendingSkipReason})` : ''),
  )

  try {
    const session = await mintOwnerSession()
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies: sessionCookies(session, baseURL), origins: [] }, null, 2))
  } catch (e) {
    // Setup hỏng thì không chắc teardown được gọi → tự dọn ngay.
    // Dọn không sạch thì giữ run.json để lượt sau dọn nốt (bước 2).
    if (await cleanup(state).then(() => true, () => false)) fs.rmSync(RUN_STATE_PATH, { force: true })
    throw e
  }
}
