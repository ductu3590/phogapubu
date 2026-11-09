import type { PrintRequest } from '@/lib/print/print-request'

type PrintResult = { ok: true } | { ok: false; error: string }

/**
 * "Duyệt & in bếp": duyệt đơn rồi in qua printDocument (cùng khoá chống in trùng với đường tự in:
 * order:<id>:kitchen:<trạm> / order:<id>:table, nên không có thêm phiếu bếp thứ hai).
 * Duyệt lỗi → không in. Duyệt được mà in lỗi → vẫn ok kèm printError (đơn đã vào bếp, chỉ thiếu tờ giấy).
 * Đơn đã duyệt từ trước (already) vẫn gọi in: ở chế độ phần mềm in khoá tự nhiên chặn trùng; ở chế độ trình duyệt
 * thu ngân vốn cần tờ giấy.
 */
export async function confirmAndPrint(
  orderId: string,
  deps: {
    confirmOrder: (orderId: string) => Promise<{ ok: true; already: boolean } | { ok: false; error: string }>
    printDocument: (req: PrintRequest) => Promise<PrintResult>
  },
): Promise<{ ok: false; error: string } | { ok: true; already: boolean; printError: string | null }> {
  const res = await deps.confirmOrder(orderId)
  if (!res.ok) return { ok: false, error: res.error }
  let printError: string | null = null
  try {
    const p = await deps.printDocument({ kind: 'order', orderId })
    if (!p.ok) printError = p.error
  } catch (e) {
    printError = e instanceof Error ? e.message : 'Không in được phiếu'
  }
  return { ok: true, already: res.already, printError }
}
