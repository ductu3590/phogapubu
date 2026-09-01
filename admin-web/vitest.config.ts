import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Vitest chưa từng có config riêng nên alias `@/...` không phân giải được: mọi test buộc phải
// vi.mock TẤT CẢ import `@/` của module đang test, kể cả helper thuần tuý không cần giả lập.
// Khai báo alias một lần ở đây để import thật chạy được; vi.mock vẫn đè lên như thường.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
