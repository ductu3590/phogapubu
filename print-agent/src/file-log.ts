import { appendFileSync } from 'node:fs'

const MAX_MESSAGE_LENGTH = 500

/** Ghi một dòng vào file log. Token thiết bị và token trang in là chuỗi hex dài, che đi phòng khi lọt vào tin lỗi. */
export function createFileLog(filePath: string): (message: string) => void {
  return (message) => {
    const clean = message
      .replace(/[0-9a-f]{32,}/gi, '[đã ẩn]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH)
    try {
      appendFileSync(filePath, `${new Date().toISOString()} ${clean}\n`)
    } catch {
      // Không ghi được log thì thôi, không được làm hỏng việc in
    }
  }
}
