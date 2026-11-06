'use client'

import { usePathname } from 'next/navigation'
import PrintReady from './print-ready'

// Lỗi render của trang in (ném trong lúc dựng) cũng phải có tín hiệu cho phần mềm in, nếu không phần mềm
// chờ data-print-ready cho tới hết giờ. Coi là lỗi tạm thời (retryable). jobId lấy từ URL vì error boundary
// không nhận params.
export default function AgentPrintError(_props: { error: Error & { digest?: string }; reset: () => void }) {
  const jobId = usePathname().split('/').filter(Boolean).pop() ?? ''
  const message = 'Không dựng được phiếu'
  return (
    <>
      <PrintReady jobId={jobId} error={message} retryable />
      <p className="p-6 text-sm text-red-600">{message}</p>
    </>
  )
}
