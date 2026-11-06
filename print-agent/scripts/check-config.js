// electron-builder chỉ cảnh báo khi thiếu file extraResources rồi vẫn ra bản cài,
// mà bản đó mở lên là báo lỗi ngay ở quầy. Chặn từ lúc build.
const { existsSync } = require('node:fs')
const { join } = require('node:path')

if (!existsSync(join(__dirname, '..', 'agent.config.json'))) {
  console.error('Thiếu agent.config.json: chép từ agent.config.example.json rồi điền giá trị (xem README.md).')
  process.exit(1)
}
