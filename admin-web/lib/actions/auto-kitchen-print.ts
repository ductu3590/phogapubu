'use server'

import { requireOperator } from '@/lib/auth/operator'
import { isPosRole } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/server'
import { enqueuePrint } from '@/lib/actions/print-jobs'
import { AUTO_PRINT_BATCH_MAX, isAutoKitchenOrder, type AutoPrintConfig } from '@/lib/print/auto-kitchen-print'
import type { KitchenReleasePolicy, StorePaymentTiming } from '@/lib/kitchen-announce'

export type AutoPrintResult = { orderId: string; status: 'queued' | 'already' | 'skipped' | 'error'; error?: string }
type Result = { ok: true; results: AutoPrintResult[] } | { ok: false; error: string }

type OrderRow = {
  id: string
  status: string
  order_source: string
  created_at: string
  payment_received_at: string | null
  payment_method: string
  confirmed_at: string | null
}

// Xếp phiếu bếp cho đơn "tự vào bếp" (POS gửi lên theo định kỳ). Server action dùng createAdminClient
// (bỏ qua RLS) nên PHẢI tự kiểm quyền và lọc store_id; mọi điều kiện in được kiểm lại ở server theo
// giờ server, KHÔNG tin danh sách client gửi. Lỗi trả {ok:false}, không ném (Next production giấu lỗi ném).
export async function enqueueAutoKitchenPrints(orderIds: string[]): Promise<Result> {
  try {
    const operator = await requireOperator()
    if (!operator.storeId || !isPosRole(operator.role)) {
      return { ok: false, error: 'Bạn không có quyền in phiếu này' }
    }
    const storeId = operator.storeId

    const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).filter((id) => typeof id === 'string' && id !== ''))]
    if (ids.length === 0) return { ok: true, results: [] }
    if (ids.length > AUTO_PRINT_BATCH_MAX) return { ok: false, error: `Tối đa ${AUTO_PRINT_BATCH_MAX} đơn một lần` }

    const admin = createAdminClient()
    const [settingsRes, storeRes, ordersRes] = await Promise.all([
      admin
        .from('store_workflow_settings')
        .select('print_mode, kitchen_release_policy, staff_order_release_policy')
        .eq('store_id', storeId)
        .maybeSingle(),
      admin.from('stores').select('payment_timing').eq('id', storeId).maybeSingle(),
      admin
        .from('orders')
        .select('id, status, order_source, created_at, payment_received_at, payment_method, confirmed_at')
        .eq('store_id', storeId)
        .in('id', ids),
    ])
    if (settingsRes.error) return { ok: false, error: settingsRes.error.message }
    if (storeRes.error) return { ok: false, error: storeRes.error.message }
    if (ordersRes.error) return { ok: false, error: ordersRes.error.message }

    const settings = settingsRes.data as {
      print_mode: string
      kitchen_release_policy: KitchenReleasePolicy
      staff_order_release_policy: KitchenReleasePolicy
    } | null
    if (!settings || settings.print_mode !== 'agent') {
      return { ok: true, results: ids.map((orderId) => ({ orderId, status: 'skipped' as const })) }
    }
    const cfg: AutoPrintConfig = {
      mode: 'agent',
      kitchenReleasePolicy: settings.kitchen_release_policy,
      staffOrderReleasePolicy: settings.staff_order_release_policy,
      paymentTiming: ((storeRes.data as { payment_timing?: StorePaymentTiming } | null)?.payment_timing ?? 'prepay'),
    }
    const byId = new Map(((ordersRes.data ?? []) as OrderRow[]).map((o) => [o.id, o]))

    const results: AutoPrintResult[] = []
    const now = Date.now()
    for (const orderId of ids) {
      const o = byId.get(orderId)
      const eligible =
        !!o &&
        isAutoKitchenOrder(
          {
            status: o.status,
            orderSource: o.order_source,
            createdAt: o.created_at,
            paymentReceivedAt: o.payment_received_at,
            paymentMethod: o.payment_method,
            confirmedAt: o.confirmed_at,
          },
          cfg,
          now,
        )
      if (!eligible) {
        results.push({ orderId, status: 'skipped' })
        continue
      }
      // Tuần tự, không reprint: đơn đã có phiếu thì enqueuePrint trả queued 0
      const res = await enqueuePrint({ kind: 'order', orderId })
      if (!res.ok) results.push({ orderId, status: 'error', error: res.error })
      else results.push({ orderId, status: res.queued > 0 ? 'queued' : 'already' })
    }
    return { ok: true, results }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không xếp được phiếu bếp' }
  }
}
