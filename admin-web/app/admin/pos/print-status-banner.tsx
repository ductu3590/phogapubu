'use client'

import { Banner } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import type { PrintProblemJob, PrintStatus } from '@/lib/pos-browser-reads'
import { printInPlace } from '@/lib/print/print-in-place'
import { browserPrintUrl } from '@/lib/print/print-request'

// Băng đỏ ở POS cho quán dùng phần mềm in: máy in chưa kết nối + từng phiếu lỗi/hết hạn.
// Chế độ trình duyệt, hoặc agent đang ổn: không vẽ gì.
// "In bằng trình duyệt" gọi thẳng printInPlace (KHÔNG qua printDocument: nó sẽ xếp lại vào hàng đợi phần mềm in).
// Lưu ý: phiếu bếp lỗi in bằng trình duyệt ra cả hai liên với mọi món của đơn (đã biết, xem checklist).
export default function PrintStatusBanner({
  status,
  onRetry,
  onBrowserPrint,
}: {
  status: PrintStatus | null
  onRetry: (job: PrintProblemJob) => void
  /** Gọi SAU khi đã in bằng trình duyệt: cha đánh dấu đã xử lý + đọc lại. */
  onBrowserPrint: (job: PrintProblemJob) => void
}) {
  if (!status || status.mode !== 'agent') return null
  const offline = !status.agent_online
  if (!offline && status.problem_jobs.length === 0) return null

  return (
    <div className="mx-4 mt-2 space-y-2 md:mx-5">
      {offline && (
        <Banner tone="error" title="Máy in chưa kết nối">
          Phần mềm in ở quầy không báo về. Phiếu mới sẽ chờ trong hàng đợi, quá 30 phút sẽ hết hạn.
        </Banner>
      )}
      {status.problem_jobs.map((job) => (
        <Banner
          key={job.id}
          tone="error"
          title={`${job.label} — ${job.status === 'expired' ? 'hết hạn chưa in' : 'in lỗi'}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onRetry(job)} className="min-h-9 md:min-h-9">In lại</Button>
              {job.request && (
                <Button
                  onClick={() => {
                    if (!job.request) return
                    printInPlace(browserPrintUrl(job.request))
                    onBrowserPrint(job)
                  }}
                  className="min-h-9 md:min-h-9"
                >
                  In bằng trình duyệt
                </Button>
              )}
            </div>
          }
        >
          {job.error ?? (job.status === 'expired' ? 'Phần mềm in không nhận phiếu trong 30 phút.' : null)}
        </Banner>
      ))}
    </div>
  )
}
