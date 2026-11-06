// electron-builder chỉ cảnh báo khi thiếu file extraResources rồi vẫn ra bản cài,
// mà bản đó mở lên là báo lỗi ngay ở quầy. Chặn từ lúc build, cả khi quên thay giá trị mẫu.
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const file = join(__dirname, '..', 'agent.config.json')

if (!existsSync(file)) {
  console.error('Thiếu agent.config.json: chép từ agent.config.example.json rồi điền giá trị (xem README.md).')
  process.exit(1)
}
if (readFileSync(file, 'utf8').includes('YOUR-')) {
  console.error('agent.config.json còn giá trị mẫu YOUR-...: điền giá trị thật (xem README.md).')
  process.exit(1)
}
