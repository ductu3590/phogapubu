'use client'

import { useState } from 'react'
import { Banner } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import type { PrintProblemJob, PrintStatus } from '@/lib/pos-browser-reads'
import { printInPlace } from '@/lib/print/print-in-place'
import { browserPrintUrl } from '@/lib/print/print-request'

// Số phiếu lỗi hiện sẵn; còn lại gập sau "Xem tất cả" (cúp điện / máy in hỏng có thể sinh tới 50 phiếu).
export const PRINT_BANNER_VISIBLE_JOBS = 3

// Băng đỏ ở POS cho quán dùng phần mềm in: máy in chưa kết nối + phiếu lỗi/hết hạn.
// Chế độ trình duyệt, hoặc agent đang ổn: không vẽ gì.
// "In bằng trình duyệt" gọi thẳng printInPlace (KHÔNG qua printDocument: nó sẽ xếp lại vào hàng đợi phần mềm in).
// Lưu ý: phiếu bếp lỗi in bằng trình duyệt ra cả hai liên với mọi món của đơn (đã biết, xem checklist).
// "Bỏ qua" / "Bỏ qua tất cả" chỉ đánh dấu đã xử lý (dismiss), KHÔNG in.
export default function PrintStatusBanner({
  status,
  onRetry,
  onBrowserPrint,
  onDismiss,
  onDismissAll,
  busyJobIds,
  dismissingAll = false,
}: {
  status: PrintStatus | null
  onRetry: (job: PrintProblemJob) => void
  /** Gọi SAU khi đã in bằng trình duyệt: cha đánh dấu đã xử lý + đọc lại. */
  onBrowserPrint: (job: PrintProblemJob) => void
  onDismiss?: (job: PrintProblemJob) => void
  onDismissAll?: (jobs: PrintProblemJob[]) => void
  /** Phiếu đang chạy một thao tác: khoá nút của phiếu đó. */
  busyJobIds?: ReadonlySet<string>
  dismissingAll?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  if (!status || status.mode !== 'agent') return null
  const offline = !status.agent_online
  const jobs = status.problem_jobs
  if (!offline && jobs.length === 0) return null

  const shown = expanded ? jobs : jobs.slice(0, PRINT_BANNER_VISIBLE_JOBS)
  const hidden = jobs.length - shown.length

  return (
    <div className="mx-4 mt-2 space-y-2 md:mx-5">
      {offline && (
        <Banner tone="error" title="Máy in chưa kết nối">
          Phần mềm in ở quầy không báo về. Phiếu mới sẽ chờ trong hàng đợi, quá 30 phút sẽ hết hạn.
        </Banner>
      )}
      {jobs.length > 0 && (
        <Banner
          tone="error"
          title={`${jobs.length} phiếu in lỗi`}
          action={
            <div className="flex flex-wrap gap-2">
              {hidden > 0 && <Button onClick={() => setExpanded(true)} className="min-h-9 md:min-h-9">Xem tất cả</Button>}
              {expanded && jobs.length > PRINT_BANNER_VISIBLE_JOBS && (
                <Button onClick={() => setExpanded(false)} className="min-h-9 md:min-h-9">Thu gọn</Button>
              )}
              {onDismissAll && (
                <Button isLoading={dismissingAll} onClick={() => onDismissAll(jobs)} className="min-h-9 md:min-h-9">Bỏ qua tất cả</Button>
              )}
            </div>
          }
        >
          Bấm In lại để in lại từng phiếu, hoặc Bỏ qua nếu không cần in nữa.
        </Banner>
      )}
      {shown.map((job) => {
        const busy = busyJobIds?.has(job.id) === true || dismissingAll
        return (
          <Banner
            key={job.id}
            tone="error"
            title={`${job.label} — ${job.status === 'expired' ? 'hết hạn chưa in' : 'in lỗi'}`}
            action={
              <div className="flex flex-wrap gap-2">
                <Button isLoading={busy} onClick={() => onRetry(job)} className="min-h-9 md:min-h-9">In lại</Button>
                {job.request && (
                  <Button
                    isLoading={busy}
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
                {onDismiss && <Button isLoading={busy} onClick={() => onDismiss(job)} className="min-h-9 md:min-h-9">Bỏ qua</Button>}
              </div>
            }
          >
            {job.error ?? (job.status === 'expired' ? 'Phần mềm in không nhận phiếu trong 30 phút.' : null)}
          </Banner>
        )
      })}
    </div>
  )
}
