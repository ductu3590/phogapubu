'use client'

import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Lỗi tải một trang /admin. Header/sidebar vẫn đứng yên (AppShell), chỉ vùng nội dung báo lỗi.
// Chi tiết kỹ thuật gấp lại: chủ quán chỉ cần biết thử lại; mã lỗi để chụp gửi MEVO khi cần.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center md:p-8">
      <div>
        <h2 className="text-lg font-semibold text-error-text">Không tải được trang này</h2>
        <p className="mt-1 max-w-md text-sm text-pretty text-muted">
          Có thể do mạng chập chờn hoặc phiên đăng nhập hết hạn. Bấm Thử lại; nếu vẫn lỗi, chụp màn hình gửi MEVO.
        </p>
      </div>
      <Button icon={<RotateCw />} onClick={reset}>
        Thử lại
      </Button>
      <details className="w-full max-w-2xl text-left">
        <summary className="cursor-pointer text-center text-[13px] text-muted">Chi tiết kỹ thuật</summary>
        <pre className="mt-2 overflow-auto rounded-xl border border-critical-border bg-critical-bg p-4 text-xs text-critical">
          {error.message}
          {error.digest ? `\n\nMã lỗi: ${error.digest}` : ''}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
      </details>
    </div>
  )
}
