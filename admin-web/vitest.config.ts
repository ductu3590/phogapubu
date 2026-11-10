import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Vitest chưa từng có config riêng nên alias `@/...` không phân giải được: mọi test buộc phải
// vi.mock TẤT CẢ import `@/` của module đang test, kể cả helper thuần tuý không cần giả lập.
// Khai báo alias một lần ở đây để import thật chạy được; vi.mock vẫn đè lên như thường.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // lib/menu/active-discounts.ts import 'server-only' (Next tự lo lúc build, gói không có trong node_modules).
      'server-only': fileURLToPath(new URL('./test-stubs/server-only.ts', import.meta.url)),
    },
  },
})
