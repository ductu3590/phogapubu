import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { ROLE_LABEL } from '@/lib/auth/roles'
import { loadBillsReport } from '@/lib/actions/bills-report'
import { clampReportDate, isViewingToday, vnToday } from '@/lib/daily-report'
import { createClient } from '@/lib/supabase/server'
import { ErrorState } from '@/components/ui/feedback'
import BillsReportView from './bills-report-view'
import OrdersRealtime from './orders-realtime'

// "Hoá đơn & Báo cáo" (bản Stitch A04) — thay 2 trang Đơn hàng + Báo cáo ngày (xoá ở A04-4, 2026-10-13).
// Mọi con số lấy nguyên từ RPC get_bills_report; trang này chỉ hiển thị. Theo NGÀY giờ VN (ca làm việc: để sau).
// Dùng chung cho trang đầy đủ (page.tsx) và bản hộp thoại đè lên POS (@modal/(.)bills): `inModal` quyết định cách
// đổi ngày — xem ReportDatePicker.
export default async function BillsScreen({ searchParams, inModal }: { searchParams: Promise<{ date?: string }>; inModal: boolean }) {
  const operator = await requireAdminPageOrRedirect('pos')

  const now = new Date()
  const { date: rawDate } = await searchParams
  const date = clampReportDate(rawDate, now)
  const today = isViewingToday(date, now)

  const supabase = await createClient()
  // Như trang Đơn hàng cũ: lazy-quét huỷ đơn khách tự đặt online bỏ dở > 30'. RPC chỉ cho chủ quán; lỗi không chặn trang.
  if (operator.role === 'store_owner') {
    await supabase.rpc('sweep_abandoned_orders', { p_store_id: operator.storeId }).then(() => {}, () => {})
  }
  const [res, { data: auth }] = await Promise.all([loadBillsReport(date), supabase.auth.getUser()])
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  const viewer = `${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`

  const title = new Date(`${date}T00:00:00+07:00`).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* Tự làm mới khi có đơn / thanh toán thay đổi — không bắt F5. */}
      <OrdersRealtime storeId={operator.storeId} channelKey="admin-bills" />
      <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
        {res.ok ? (
          <BillsReportView
            report={res.report}
            date={date}
            maxDate={vnToday(now)}
            today={today}
            dateTitle={title}
            viewer={viewer}
            updatedAt={now.toISOString()}
            canManage={operator.role === 'store_owner'}
            inModal={inModal}
          />
        ) : (
          <ErrorState title="Không tải được báo cáo" reason={res.error} />
        )}
      </div>
    </div>
  )
}
