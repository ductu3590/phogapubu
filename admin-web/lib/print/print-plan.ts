import type { PrintRequest } from './print-request'

export type PlannedJob = {
  stationId: string
  kind: 'kitchen_ticket' | 'table_slip' | 'bill' | 'day_report' | 'shift_report'
  ref: Record<string, unknown>
  dedupeKey: string
}

/**
 * Chia một đơn thành các phiếu: mỗi trạm có món → 1 phiếu bếp (chỉ món của trạm đó);
 * 1 phiếu bàn (đủ món) ở trạm Quầy. Món chưa gán trạm (stationId null) ra trạm bếp mặc định.
 * Đơn không còn món → [] để action báo lỗi (không in tờ trắng).
 * Khoá chống trùng là khoá tự nhiên theo nguồn + trạm, nên bấm "Duyệt" hai lần không ra hai phiếu;
 * in lại (reprintToken) thêm hậu tố để ra phiếu mới.
 */
export function planOrderJobs(input: {
  request: PrintRequest
  sourceKey: string // 'order:<id>' | 'preorder:<id>'
  items: { key: string; stationId: string | null }[]
  posStationId: string
  defaultKitchenStationId: string
  stationNames: Record<string, string>
  tableLabel: string
  reprintToken: string | null
}): PlannedJob[] {
  if (input.items.length === 0) return []
  const suffix = input.reprintToken ? `:r${input.reprintToken}` : ''

  // Giữ thứ tự xuất hiện đầu tiên của trạm để phiếu ra ổn định
  const byStation = new Map<string, string[]>()
  for (const it of input.items) {
    const sid = it.stationId ?? input.defaultKitchenStationId
    const list = byStation.get(sid)
    if (list) list.push(it.key)
    else byStation.set(sid, [it.key])
  }

  const jobs: PlannedJob[] = []
  for (const [stationId, itemKeys] of byStation) {
    const name = input.stationNames[stationId] ?? 'Bếp'
    jobs.push({
      stationId,
      kind: 'kitchen_ticket',
      ref: {
        label: `Phiếu bếp · ${name} · ${input.tableLabel}`,
        request: input.request,
        source: input.sourceKey,
        itemKeys,
      },
      dedupeKey: `${input.sourceKey}:kitchen:${stationId}${suffix}`,
    })
  }
  jobs.push({
    stationId: input.posStationId,
    kind: 'table_slip',
    ref: {
      label: `Phiếu bàn · ${input.tableLabel}`,
      request: input.request,
      source: input.sourceKey,
    },
    dedupeKey: `${input.sourceKey}:table${suffix}`,
  })
  return jobs
}

/** Phiếu tài liệu (hoá đơn, báo cáo) ra trạm Quầy. Mỗi lần bấm một khoá riêng: in tạm tính nhiều lần là hợp lệ. */
export function planDocumentJob(
  request: PrintRequest,
  posStationId: string,
  label: string,
  uniqueToken: string,
): PlannedJob {
  if (request.kind !== 'bill' && request.kind !== 'day_report' && request.kind !== 'shift_report') {
    throw new Error(`planDocumentJob không dùng cho phiếu ${request.kind}`)
  }
  return {
    stationId: posStationId,
    kind: request.kind,
    ref: { label, request },
    dedupeKey: `${request.kind}:${uniqueToken}`,
  }
}
