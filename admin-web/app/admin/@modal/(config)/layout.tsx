import type { ReactNode } from 'react'
import ConfigModal from '../../config-modal'

// Vỏ hộp thoại cấu hình DÙNG CHUNG cho mọi tab: đổi tab chỉ thay phần thân, hộp thoại + tên quán
// không dựng lại (trước đây mỗi tab tự bọc ConfigModal → tải lại cả vỏ mỗi lần đổi tab).
export default function ConfigModalLayout({ children }: { children: ReactNode }) {
  return <ConfigModal>{children}</ConfigModal>
}
