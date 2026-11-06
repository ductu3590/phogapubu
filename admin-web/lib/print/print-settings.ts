// Kiểu + hàm thuần cho khối "In ấn" ở Cài đặt (dữ liệu từ RPC get_print_settings, mig 114).
export type PrintStation = {
  id: string
  name: string
  is_pos: boolean
  is_default_kitchen: boolean
  printer_name: string | null
}

export type PrintAgentInfo = {
  id: string
  name: string
  version: string | null
  last_seen_at: string | null
  online: boolean
  printers: unknown
}

export type PrintSettings = {
  mode: 'browser' | 'agent'
  stations: PrintStation[]
  agent: PrintAgentInfo | null
  kitchen_release_policy: 'automatic' | 'pos_confirmation'
  staff_order_release_policy: 'automatic' | 'pos_confirmation'
}

/** Tên các máy in phần mềm báo lên; chấp nhận cả mảng chuỗi lẫn mảng {name}. */
export function printerNames(agent: PrintAgentInfo | null): string[] {
  if (!agent || !Array.isArray(agent.printers)) return []
  const names = agent.printers
    .map((p) => (typeof p === 'string' ? p : (p as { name?: unknown } | null)?.name))
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
  return [...new Set(names)]
}

/** Chế độ phần mềm in chỉ bật được khi cả hai đường đơn xuống bếp đều qua thu ngân xác nhận. */
export function canUseAgentMode(s: Pick<PrintSettings, 'kitchen_release_policy' | 'staff_order_release_policy'>): boolean {
  return s.kitchen_release_policy === 'pos_confirmation' && s.staff_order_release_policy === 'pos_confirmation'
}

export function parsePrintSettings(raw: unknown): PrintSettings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PrintSettings>
  if (r.mode !== 'browser' && r.mode !== 'agent') return null
  return {
    mode: r.mode,
    stations: Array.isArray(r.stations) ? (r.stations as PrintStation[]) : [],
    agent: r.agent ?? null,
    kitchen_release_policy: r.kitchen_release_policy === 'pos_confirmation' ? 'pos_confirmation' : 'automatic',
    staff_order_release_policy: r.staff_order_release_policy === 'pos_confirmation' ? 'pos_confirmation' : 'automatic',
  }
}
