'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { loadOrderSlip } from '@/lib/print/load-order-slip'
import { planDocumentJob, planOrderJobs, type PlannedJob } from '@/lib/print/print-plan'
import { AGENT_KINDS, type PrintRequest } from '@/lib/print/print-request'

type Result = { ok: true; queued: number } | { ok: false; error: string }
const fail = (error: string): Result => ({ ok: false, error })

const NGAY = /^\d{4}-\d{2}-\d{2}$/
const vnDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

// Xếp phiếu vào hàng đợi cho phần mềm in ở quầy (chế độ `agent`). Server action: PHẢI tự kiểm quyền và
// lọc store_id ở mọi truy vấn admin (createAdminClient bỏ qua RLS). Lỗi người dùng trả {ok:false}, không ném
// (Next production giấu nội dung lỗi ném).
export async function enqueuePrint(req: PrintRequest): Promise<Result> {
  try {
    const operator = await requireOperator()
    if (!operator.storeId) return fail('Tài khoản không thuộc quán nào')
    const storeId = operator.storeId

    // Nhân viên phục vụ chỉ in được hoá đơn (màn chốt bàn); đơn, đặt trước, báo cáo là việc thu ngân/chủ quán.
    const posRole = operator.role === 'store_owner' || operator.role === 'store_cashier'
    if (!posRole && req.kind !== 'bill') return fail('Bạn không có quyền in phiếu này')

    const supabase = await createClient()
    const { data: mode, error: modeErr } = await supabase.rpc('get_print_mode')
    if (modeErr) return fail(modeErr.message)
    if (mode !== 'agent') return fail('Quán chưa bật phần mềm in')
    if (!AGENT_KINDS.has(req.kind)) return fail('Loại phiếu này chưa in qua phần mềm in được')

    const admin = createAdminClient()
    const { data: stationRows, error: stErr } = await admin
      .from('print_stations')
      .select('id, name, is_pos, is_default_kitchen')
      .eq('store_id', storeId)
    if (stErr) return fail(stErr.message)
    const stations = (stationRows ?? []) as Array<{ id: string; name: string; is_pos: boolean; is_default_kitchen: boolean }>
    const pos = stations.find((s) => s.is_pos)
    const kitchen = stations.find((s) => s.is_default_kitchen)
    if (!pos || !kitchen) return fail('Chưa cài trạm in: vào Cài đặt → In ấn để tạo trạm Quầy và Bếp')
    const stationNames = Object.fromEntries(stations.map((s) => [s.id, s.name]))

    let planned: PlannedJob[]
    if (req.kind === 'order' || req.kind === 'preorder_job') {
      const source = req.kind === 'order' ? { orderId: req.orderId } : { preorderJobId: req.jobId }
      const sourceKey = req.kind === 'order' ? `order:${req.orderId}` : `preorder:${req.jobId}`
      // Đọc đơn bằng phiên đăng nhập (RLS + auth.uid() cho get_reservation_preorder_print_job), lọc storeId
      const loaded = await loadOrderSlip(supabase, storeId, source)
      if (!loaded.ok) return fail(loaded.error)
      const slip = loaded.slip
      if (slip.items.length === 0) return fail('Đơn không còn món để in')

      // Trạm của món: menu_items → menu_categories.print_station_id (lọc store_id). Trạm đã xoá / chưa gán /
      // món đã xoá khỏi menu → null → rơi về trạm bếp mặc định NGAY LÚC TẠO JOB (RPC poll không tự chuyển).
      const itemIds = [...new Set(slip.items.map((i) => i.menuItemId).filter((x): x is string => !!x))]
      const stationOfItem = new Map<string, string>()
      if (itemIds.length > 0) {
        const { data: mi, error: miErr } = await admin
          .from('menu_items').select('id, category_id').eq('store_id', storeId).in('id', itemIds)
        if (miErr) return fail(miErr.message)
        const catIds = [...new Set(((mi ?? []) as Array<{ category_id: string | null }>).map((m) => m.category_id).filter((x): x is string => !!x))]
        const stationOfCat = new Map<string, string>()
        if (catIds.length > 0) {
          const { data: cats, error: cErr } = await admin
            .from('menu_categories').select('id, print_station_id').eq('store_id', storeId).in('id', catIds)
          if (cErr) return fail(cErr.message)
          for (const c of (cats ?? []) as Array<{ id: string; print_station_id: string | null }>) {
            if (c.print_station_id && stationNames[c.print_station_id]) stationOfCat.set(c.id, c.print_station_id)
          }
        }
        for (const m of (mi ?? []) as Array<{ id: string; category_id: string | null }>) {
          const sid = m.category_id ? stationOfCat.get(m.category_id) : undefined
          if (sid) stationOfItem.set(m.id, sid)
        }
      }

      planned = planOrderJobs({
        request: req,
        sourceKey,
        items: slip.items.map((i) => ({ key: i.key, stationId: i.menuItemId ? stationOfItem.get(i.menuItemId) ?? null : null })),
        posStationId: pos.id,
        defaultKitchenStationId: kitchen.id,
        stationNames,
        tableLabel: slip.tableLabel,
        reprintToken: req.reprint ? crypto.randomUUID() : null,
      })
      if (planned.length === 0) return fail('Đơn không còn món để in')
    } else if (req.kind === 'bill') {
      const ids = [...new Set(req.sessionIds.filter(Boolean))]
      if (ids.length === 0) return fail('Thiếu phiên để in hoá đơn')
      // Mọi phiên phải thuộc quán này, nếu không từ chối cả lệnh
      const { data: owned, error: sErr } = await admin
        .from('table_sessions').select('id').eq('store_id', storeId).in('id', ids)
      if (sErr) return fail(sErr.message)
      if ((owned ?? []).length !== ids.length) return fail('Không tìm thấy phiên của quán này')
      planned = [planDocumentJob(req, pos.id, ids.length > 1 ? `Hoá đơn tổng · ${ids.length} mâm` : 'Hoá đơn', crypto.randomUUID())]
    } else if (req.kind === 'day_report') {
      if (!NGAY.test(req.date)) return fail('Ngày báo cáo không hợp lệ')
      planned = [planDocumentJob(req, pos.id, `Báo cáo cuối ngày · ${vnDate(req.date)}`, crypto.randomUUID())]
    } else {
      return fail('Loại phiếu này chưa in qua phần mềm in được')
    }

    const rows = planned.map((j) => ({
      store_id: storeId,
      station_id: j.stationId,
      kind: j.kind,
      ref: j.ref,
      dedupe_key: j.dedupeKey,
      created_by: operator.userId,
    }))
    // Một lệnh cho cả đơn nên nguyên tử; trùng khoá (đã xếp hàng rồi) thì bỏ qua, không lỗi.
    const { data: inserted, error } = await admin
      .from('print_jobs')
      .upsert(rows, { onConflict: 'store_id,dedupe_key', ignoreDuplicates: true })
      .select('id')
    if (error) return fail(error.message)
    return { ok: true, queued: (inserted ?? []).length }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Không xếp được phiếu in')
  }
}
