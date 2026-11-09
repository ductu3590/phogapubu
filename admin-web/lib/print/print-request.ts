// Yêu cầu in: MỘT kiểu dùng chung cho chế độ trình duyệt (iframe ẩn) và chế độ phần mềm in (hàng đợi).
export type PrintRequest = (
  | { kind: 'order'; orderId: string }
  | { kind: 'preorder_job'; jobId: string }
  | { kind: 'bill'; sessionIds: string[] }
  | { kind: 'day_report'; date: string }
  | { kind: 'shift_report'; shiftId: string }
  // Bảng kê công nợ một khách (mig 123). Chỉ in bằng trình duyệt (không có trong AGENT_KINDS).
  | { kind: 'debt_statement'; customerId: string }
) & { reprint?: boolean }

/** URL trang in ở chế độ trình duyệt — giữ nguyên các URL mà POS/staff/báo cáo đang dùng. */
export function browserPrintUrl(req: PrintRequest): string {
  switch (req.kind) {
    case 'order':
      return `/print/order?id=${encodeURIComponent(req.orderId)}`
    case 'preorder_job':
      return `/print/order?job=${encodeURIComponent(req.jobId)}`
    case 'bill':
      return `/print/bill?ids=${req.sessionIds.map(encodeURIComponent).join(',')}`
    case 'day_report':
      return `/print/day-report?date=${encodeURIComponent(req.date)}`
    case 'shift_report':
      return `/print/shift-report?id=${encodeURIComponent(req.shiftId)}`
    case 'debt_statement':
      return `/print/debt-statement?customer=${encodeURIComponent(req.customerId)}`
  }
}

/** Loại phiếu phần mềm in xử lý được. Part 1 chưa có 'shift_report' (Task 13 thêm cùng trang in ca). */
export const AGENT_KINDS: ReadonlySet<PrintRequest['kind']> = new Set<PrintRequest['kind']>([
  'order',
  'preorder_job',
  'bill',
  'day_report',
])

/** Câu server trả khi quán không ở chế độ phần mềm in; client so sánh bằng hằng số này, không chép chuỗi. */
export const PRINT_AGENT_MODE_OFF_ERROR = 'Quán chưa bật phần mềm in'
