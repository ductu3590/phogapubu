import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShiftReportSlipProps } from '@/app/print/shift-report/shift-report-slip'
import { shiftReportPrintable } from '@/lib/cash-shift'
import { parseCashShiftReport } from '@/lib/cash-shift'
import { readDebtShiftSummary } from '@/lib/debt-shift-summary'

// Dựng props phiếu bàn giao ca cho /print/agent. MỘT hàm duy nhất trả props của phiếu: nơi nào cần thêm số liệu
// vào phiếu (vd. công nợ trong ca, `debt`) thì thêm ở ĐÂY, trang không tự ghép.
//
// ⚠️ `cash_shift_report_json` chạy bằng service_role và KHÔNG tự kiểm quyền/quán (mig 122): admin client nhận
// shiftId từ job nên PHẢI tự so store_id của ca với store_id của job và chỉ in ca ĐÃ ĐÓNG, TRƯỚC khi vẽ bất kỳ con
// số nào. Phán quyết: in lại phiếu ca của thu ngân khác qua retry_print_job là chấp nhận được (cùng quán, người bấm
// không chọn được shiftId, giấy ra ở quầy). Mọi nhánh lỗi trả {ok:false} (fail closed), không bao giờ trả props.
export async function loadShiftReportSlip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  jobStoreId: string,
  shiftId: string,
  printedBy: string,
  now: Date,
  /**
   * Client JWT của người tạo phiếu, dựng LƯỜI (chỉ gọi sau khi ca đã qua mọi kiểm tra) để đọc công nợ trong ca
   * (mig 123). Service role không dùng được: get_debt_shift_summary kiểm quyền bằng auth.uid() — cùng giới hạn
   * với trang trình duyệt (chủ quán / quản lý, hoặc thu ngân mở / kết ca). Không truyền / lỗi → debt null.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUserClient?: () => Promise<SupabaseClient<any>>,
): Promise<{ ok: true; props: ShiftReportSlipProps } | { ok: false; error: string; transient?: true }> {
  const { data, error } = await admin.rpc('cash_shift_report_json', { p_shift_id: shiftId })
  if (error) return { ok: false, error: `Không lấy được phiếu ca: ${error.message}`, transient: true }
  const report = parseCashShiftReport(data)
  if (!report) return { ok: false, error: 'Không đọc được ca' }
  if (report.storeId !== jobStoreId) return { ok: false, error: 'Không tìm thấy ca của quán này' }
  if (report.status !== 'closed') return { ok: false, error: 'Ca chưa kết, chưa có phiếu bàn giao' }
  if (!shiftReportPrintable(report)) return { ok: false, error: 'Phiếu ca thiếu số tiền đã chốt, không in được' }

  const { data: store, error: storeErr } = await admin.from('stores').select('name').eq('id', jobStoreId).maybeSingle()
  if (storeErr) return { ok: false, error: storeErr.message, transient: true }
  if (!store) return { ok: false, error: 'Không tìm thấy quán' }

  let debt: Awaited<ReturnType<typeof readDebtShiftSummary>> = null
  if (getUserClient) {
    try {
      debt = await readDebtShiftSummary(await getUserClient(), shiftId)
    } catch {
      debt = null // dựng JWT lỗi: phiếu vẫn in, chỉ thiếu khối nợ
    }
  }

  return {
    ok: true,
    props: {
      report,
      storeName: (store.name as string | null) ?? '',
      printedAt: now.toISOString(),
      printedBy,
      debt,
    },
  }
}
