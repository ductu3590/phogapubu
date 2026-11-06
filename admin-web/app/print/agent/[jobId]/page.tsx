import { ROLE_LABEL, type OperatorRole } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/server'
import { createPrintUserClient } from '@/lib/print/agent-user-client'
import { loadDayReport } from '@/lib/print/load-day-report'
import { loadOrderSlip } from '@/lib/print/load-order-slip'
import { buildTestBill } from '@/lib/print/test-bill'
import { KitchenSlip, SlipStyles, TableSlip } from '@/app/print/order/print-order'
import PrintBill from '@/app/print/bill/print-bill'
import DayReportSlip from '@/app/print/day-report/day-report-slip'
import type { SessionsBill } from '@/lib/actions/table-session'
import PrintReady from './print-ready'

// Trang in cho PHẦN MỀM IN ở quầy (Electron mở trong cửa sổ ẩn, rồi in thẳng ra máy đã gán).
// proxy.ts cho trang này đi thẳng, KHÔNG có cookie đăng nhập: token trang in (?t=) là lớp bảo vệ DUY NHẤT.
// Token sai/hết hạn thì không đọc gì khác. Dữ liệu đọc bằng JWT sống 120 giây mang danh người tạo phiếu.
// Số liệu do RPC in tính (giảm giá, mốc cắt ngày kinh doanh...) phiếu tự nhận; còn dòng hiển thị mới như khoảng giờ
// của ngày kinh doanh thì phải đi qua props của loader (rangeLabel ở loadDayReport), không tự có.
// Tín hiệu cho phần mềm: <html data-print-ready="1"> khi xong, data-print-error="<lý do>" khi lỗi (xem PrintReady).
const READ_FAILED = 'Không đọc được dữ liệu phiếu'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RenderJob = {
  id: string
  store_id: string
  kind: string
  ref: Record<string, unknown> | null
  created_by: string
  station_name: string | null
}

export default async function PrintAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { jobId } = await params
  const { t } = await searchParams

  // retryable=true: lỗi đọc tạm thời (mạng/DB) — phần mềm in được phép thử lại; còn lại là lỗi vĩnh viễn.
  const fail = (message: string, retryable = false) => (
    <>
      <PrintReady jobId={jobId} error={message} retryable={retryable} />
      <p className="p-6 text-sm text-red-600">{message}</p>
    </>
  )
  // Lỗi đọc DB/RPC luôn báo MỘT câu riêng (không lộ lỗi kỹ thuật, không nhầm với "hết hạn" hay lỗi dữ liệu)
  const readFail = (detail?: string) => {
    if (detail) console.error(`[print/agent ${jobId}] ${detail}`)
    return fail(READ_FAILED, true)
  }
  const fromLoader = (res: { error: string; transient?: true }) => (res.transient ? readFail(res.error) : fail(res.error))

  try {
    // Token thiếu / sai định dạng thì không chạm DB
    if (!t || !UUID.test(jobId)) return fail('Phiếu đã hết hạn')

    const { data, error } = await createAdminClient().rpc('print_job_for_render', {
      p_job_id: jobId,
      p_render_token: t,
    })
    // Hai nhánh KHÁC nhau: RPC lỗi (mạng/DB) thì thử lại được; NULL (token sai/hết hạn/job không còn printing) thì không
    if (error) return readFail(error.message)
    if (!data) return fail('Phiếu đã hết hạn')
    const job = data as RenderJob
    const ref = job.ref ?? {}

    if (job.kind === 'shift_report') return fail('Chưa hỗ trợ')

    const client = await createPrintUserClient(job.created_by)

    if (job.kind === 'kitchen_ticket' || job.kind === 'table_slip') {
      const source = String(ref.source ?? '')
      const sep = source.indexOf(':')
      const type = source.slice(0, sep)
      const id = source.slice(sep + 1)
      if (sep < 0 || !id || (type !== 'order' && type !== 'preorder')) return fail('Phiếu thiếu nguồn đơn')
      const res = await loadOrderSlip(client, job.store_id, type === 'order' ? { orderId: id } : { preorderJobId: id })
      if (!res.ok) return fromLoader(res)
      // Phiếu in lại (bấm In lại ở POS, hoặc thử lại job lỗi) phải có chữ IN LẠI: phiếu xuống thẳng bếp,
      // trông như mới thì bếp làm món hai lần. Phiếu điều chỉnh của đặt trước giữ nguyên tiêu đề riêng.
      const isReprint = (ref.request as { reprint?: unknown } | undefined)?.reprint === true || ref.retried === true
      const slipData =
        isReprint && res.slip.preorderPrintKind !== 'adjustment' ? { ...res.slip, preorderPrintKind: 'reprint' as const } : res.slip

      if (job.kind === 'table_slip') {
        if (slipData.items.length === 0) return fail('Đơn không còn món để in')
        return (
          <>
            <PrintReady jobId={jobId} />
            <SlipStyles />
            <TableSlip slip={slipData} />
          </>
        )
      }

      // Phiếu bếp chỉ gồm món của trạm này (itemKeys lúc xếp hàng); món đã bị bỏ sau đó tự rơi khỏi phiếu
      const keys = new Set(Array.isArray(ref.itemKeys) ? (ref.itemKeys as unknown[]).map(String) : [])
      const items = slipData.items.filter((it) => keys.has(it.key))
      if (items.length === 0) return fail('Các món trên phiếu đã bị bỏ')
      return (
        <>
          <PrintReady jobId={jobId} />
          <SlipStyles />
          <KitchenSlip slip={{ ...slipData, items }} stationName={job.station_name} showPrices={false} />
        </>
      )
    }

    if (job.kind === 'bill') {
      const request = (ref.request ?? {}) as { sessionIds?: string[] }
      const ids = request.sessionIds ?? []
      if (ids.length === 0) return fail('Phiếu thiếu phiên hoá đơn')
      const { data: bill, error: billErr } = await client.rpc('get_sessions_bill', { p_session_ids: ids })
      if (billErr) return readFail(billErr.message)
      if (!bill) return fail('Không lấy được hoá đơn')
      return (
        <>
          <PrintReady jobId={jobId} />
          <PrintBill bill={bill as unknown as SessionsBill} autoPrint={false} />
        </>
      )
    }

    if (job.kind === 'day_report') {
      const request = (ref.request ?? {}) as { date?: string }
      // Người in: tên hiển thị + vai của người tạo phiếu (lọc đúng quán)
      const { data: op, error: opErr } = await createAdminClient()
        .from('mevo_operators')
        .select('display_name, role')
        .eq('user_id', job.created_by)
        .eq('store_id', job.store_id)
        .maybeSingle()
      if (opErr) return readFail(opErr.message)
      const roleLabel = op?.role ? ROLE_LABEL[op.role as OperatorRole] ?? '' : ''
      const printedBy = [op?.display_name?.trim() || 'Không rõ', roleLabel].filter(Boolean).join(' · ')
      const res = await loadDayReport(client, job.store_id, request.date ?? '', printedBy, new Date())
      if (!res.ok) return fromLoader(res)
      return (
        <>
          <PrintReady jobId={jobId} />
          {/* res.props gồm cả rangeLabel: quán có giờ bắt đầu khác 00:00 thì phiếu có dòng khoảng giờ */}
          <DayReportSlip {...res.props} autoPrint={false} />
        </>
      )
    }

    if (job.kind === 'test') {
      const { data: store, error: storeErr } = await client.from('stores').select('name, address, phone').eq('id', job.store_id).maybeSingle()
      if (storeErr) return readFail(storeErr.message)
      if (!store) return fail('Không tìm thấy quán')
      const bill = buildTestBill(
        {
          name: (store?.name as string | null) ?? null,
          address: (store?.address as string | null) ?? null,
          phone: (store?.phone as string | null) ?? null,
        },
        new Date(),
      )
      return (
        <>
          <PrintReady jobId={jobId} />
          <PrintBill bill={bill} testMode autoPrint={false} />
        </>
      )
    }

    return fail('Loại phiếu không hợp lệ')
  } catch (e) {
    // Ngoại lệ bất ngờ (mạng đứt, thiếu secret…): giữ nội dung để dễ dò, coi là có thể thử lại
    return fail(e instanceof Error ? e.message : 'Không dựng được phiếu', true)
  }
}
