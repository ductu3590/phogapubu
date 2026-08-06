import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Chỉ chạy test cho logic thuần + phần nối SDK đã mock. Không jsdom, không test component.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
