'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Ellipsis, Landmark, Layers, Link2, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react'
import { StatusDot } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Banner, EmptyState } from '@/components/ui/feedback'
import { TABLE_STATE } from '@/components/ui/status'
import { tableVisualState } from '@/lib/table-status'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  addTableToSession,
  closeTableSession,
  closeTableSessionsBulk,
  createTraySession,
  listOpenTableSessions,
  mergeSessionIntoTray,
  releaseTableSessionHost,
  type OpenTableSession,
  type SessionTable,
} from '@/lib/actions/table-session'
import { assignTrayColors } from '@/lib/tray-colors'
import { sessionTimeoutMessage } from '@/lib/session-timeout'
import ServiceRequestQueue from '@/app/admin/cashier/service-request-queue'
import type { ServiceRequestRow } from '@/lib/actions/service-requests'
import { serviceRequestSession } from '@/lib/service-request-queue'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const gio = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã nhận',
  cooking: 'Đang làm',
  ready: 'Xong',
  paid: 'Hoàn tất',
}

type Sheet =
  | { kind: 'none' }
  | { kind: 'pay'; sessions: OpenTableSession[] }
  | { kind: 'more'; session: OpenTableSession }
  | { kind: 'reset'; session: OpenTableSession }
  | { kind: 'tray' }
  | { kind: 'merge'; session: OpenTableSession }
  | { kind: 'addTable'; session: OpenTableSession }

export default function TablesClient({
  storeId,
  paymentTiming,
  allTables,
  initialSessions,
  initialError,
  canClose,
  initialRequests,
  initialRequestError,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  allTables: SessionTable[]
  initialSessions: OpenTableSession[]
  initialError: string | null
  canClose: boolean
  initialRequests: ServiceRequestRow[]
  initialRequestError: string | null
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })
  const [connected, setConnected] = useState(false)
  // Chế độ gộp bill: tick nhiều mâm rồi thu một lần. Tách bill là MẶC ĐỊNH (mỗi mâm vốn là
  // một bill con) — chỉ bật chế độ này khi trưởng đoàn trả chung.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickTables, setPickTables] = useState<Set<string>>(new Set())
  const reloading = useRef(false)

  // Realtime: KHÔNG cộng dồn tại chỗ mà tải lại CẢ danh sách. Tổng tiền phải do server tính —
  // nhiều nguồn cùng đổi một phiên (khách gọi thêm, bếp đổi trạng thái, nhân viên khác chốt
  // bill), cộng tay ở client là mời hai số lệch nhau, và optimistic + event realtime cùng đến
  // sẽ đếm đôi.
  const reload = useCallback(async () => {
    if (reloading.current) return
    reloading.current = true
    try {
      const res = await listOpenTableSessions()
      if (res.ok) {
        setSessions(res.sessions)
        setError(null)
      } else {
        setError(res.error)
      }
    } finally {
      reloading.current = false
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`staff-tables-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_sessions', filter: `store_id=eq.${storeId}` },
        () => void reload(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        () => void reload(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_tables' },
        () => void reload(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          // Nối lại sau khi rớt mạng có thể đã lỡ sự kiện → tải lại cho chắc.
          void reload()
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          setConnected(false)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [storeId, reload])

  // Bàn trống = bàn không nằm trong phiên nào đang mở.
  const freeTables = useMemo(() => {
    const busyIds = new Set<string>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      for (const t of s.tables) busyIds.add(t.id)
    }
    return allTables.filter((t) => !busyIds.has(t.id))
  }, [sessions, allTables])

  // Cùng hàm với màn Chọn bàn (/staff/order) → một mâm chỉ có đúng một màu trên cả hai màn.
  const trayColors = useMemo(() => assignTrayColors(sessions), [sessions])

  const openSessions = sessions.filter((s) => s.status === 'open')
  const pickedSessions = sessions.filter((s) => picked.has(s.session_id))
  const pickedTotal = pickedSessions.reduce((n, s) => n + s.total, 0)

  const finish = async (msg?: string) => {
    setBusy(false)
    setSheet({ kind: 'none' })
    setPicked(new Set())
    setPickTables(new Set())
    if (msg) setError(msg)
    await reload()
  }

  const doClose = async (
    list: OpenTableSession[],
    reason: 'paid' | 'staff_reset',
    instrument: 'cash' | 'bank' | null,
  ) => {
    if (!canClose) return
    setBusy(true)
    const ids = list.map((s) => s.session_id)
    const res =
      ids.length === 1
        ? await closeTableSession(ids[0], reason, instrument)
        : await closeTableSessionsBulk(ids, reason, instrument)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    await finish(
      reason === 'staff_reset' && res.ordersLeftInKitchen > 0
        ? `Đã bỏ bàn. Còn ${res.ordersLeftInKitchen} món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay.`
        : undefined,
    )
  }

  const printBill = (list: OpenTableSession[]) => {
    const ids = list.map((s) => s.session_id).join(',')
    window.open(`/staff/tables/print?ids=${ids}`, '_blank')
  }

  const doSimple = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    if (!res.ok) {
      setBusy(false)
      setError(res.error ?? 'Lỗi')
      return
    }
    await finish()
  }

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleTable = (id: string) =>
    setPickTables((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const dongSheet = () => { if (!busy) setSheet({ kind: 'none' }) }

  const sheetTitle =
    sheet.kind === 'pay'
      ? `Thu ${dong(sheet.sessions.reduce((n, s) => n + s.total, 0))}${sheet.sessions.length === 1 ? ` — ${sheet.sessions[0].table_number}` : ` — ${sheet.sessions.length} mâm`}`
      : sheet.kind === 'more'
        ? sheet.session.table_number
        : sheet.kind === 'reset'
          ? `Bỏ ${sheet.session.table_number} mà KHÔNG thu tiền?`
          : sheet.kind === 'tray'
            ? 'Ghép bàn thành mâm'
            : sheet.kind === 'merge'
              ? `Nhập ${sheet.session.table_number} vào mâm nào?`
              : sheet.kind === 'addTable'
                ? `Thêm bàn vào ${sheet.session.table_number}`
                : ''

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted" role="status">
          <StatusDot tone={connected ? 'success' : 'neutral'} />
          {connected ? 'Đang cập nhật trực tiếp' : 'Mất kết nối — đang thử lại...'}
        </span>
        <Button icon={<Layers />} onClick={() => setSheet({ kind: 'tray' })} disabled={busy || freeTables.length === 0}>
          Ghép mâm
        </Button>
      </div>

      {error && (
        <div className="px-4 pt-3">
          <Banner tone="warning" title={error} onClose={() => setError(null)} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <ServiceRequestQueue
          storeId={storeId}
          initialRequests={initialRequests}
          initialError={initialRequestError}
          sessions={sessions}
          onSelect={(request) => {
            const session = serviceRequestSession(request, sessions)
            if (session) document.getElementById(`session-${session.session_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            else setError(`${request.table_number}: không còn phiên tương ứng. Yêu cầu vẫn chờ xử lý.`)
          }}
        />
        <div className="px-4 py-3">
        {sessions.length === 0 ? (
          <div className="py-8">
            <EmptyState className="py-0">Chưa có bàn nào đang mở.</EmptyState>
            {paymentTiming === 'prepay' && (
              <p className="mt-2 text-center text-[13px] text-muted">
                Quán đang chạy <b className="font-semibold">trả trước</b> — phiên bàn chỉ dùng ở chế độ trả sau.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const tray = trayColors.get(s.session_id)
              const state = TABLE_STATE[tableVisualState(s)]
              return (
              <li
                key={s.session_id}
                id={`session-${s.session_id}`}
                className={cn(
                  'rounded-xl border bg-surface p-3',
                  picked.has(s.session_id) ? 'border-primary ring-2 ring-primary/20' : s.needs_review ? 'border-critical-border' : 'border-border',
                  tray?.color.bar,
                )}
              >
                {s.needs_review && (
                  <Banner tone="error" title={`${sessionTimeoutMessage(s.idle_timeout_minutes)} nên bàn được mở khoá`} className="mb-3 p-3">
                    Vẫn còn <b className="font-semibold tabular">{dong(s.unpaid_total)} chưa thu</b>. {canClose ? 'Xử lý nốt rồi đóng.' : 'Báo chủ quán xử lý bill.'}
                  </Banner>
                )}

                <div className="mb-2 flex items-start gap-3">
                  {canClose && <input
                    type="checkbox"
                    checked={picked.has(s.session_id)}
                    onChange={() => togglePick(s.session_id)}
                    className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
                    aria-label={`Chọn ${s.table_number} để gộp bill`}
                  />}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-foreground">
                      {s.table_number}
                      {tray && <span className={`text-[13px] font-medium ${tray.color.label}`}>Mâm {tray.index}</span>}
                      {s.is_open_ordering && s.tables.length > 1 && (
                        <span className="text-[13px] font-normal text-muted">· mâm {s.tables.length} bàn</span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                      <StatusDot tone={state.tone} />
                      {state.label} · mở lúc {gio(s.opened_at)} · {s.order_count} đơn
                      {s.opened_by === 'staff' && ' · nhân viên mở'}
                      {!s.is_open_ordering && !s.has_host && ' · chưa có máy giữ bàn'}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-foreground tabular">{dong(s.total)}</span>
                </div>

                {s.orders.length > 0 && (
                  <ul className="mb-3 space-y-1 border-t border-border pt-2">
                    {s.orders.map((o) => (
                      <li key={o.id} className="flex items-start justify-between gap-2 text-[13px]">
                        <span className="min-w-0 text-foreground/80">
                          {o.items.map((it) => it.name + ' ×' + it.quantity).join(', ') || 'Không có món'}
                        </span>
                        <span className="shrink-0 text-muted tabular">
                          {gio(o.created_at)} {STATUS_LABEL[o.status] ?? o.status}
                          {o.payment_received_at && ' ✓'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  {canClose && (
                    <Button variant="primary" onClick={() => setSheet({ kind: 'pay', sessions: [s] })} disabled={busy} className="flex-1">
                      Thu tiền &amp; đóng bàn
                    </Button>
                  )}
                  <IconButton icon={<Printer />} label="In bill" onClick={() => printBill([s])} disabled={busy} className="border border-border-strong bg-surface" />
                  <IconButton icon={<Ellipsis />} label="Thao tác khác" onClick={() => setSheet({ kind: 'more', session: s })} disabled={busy} className="border border-border-strong bg-surface" />
                </div>
              </li>
              )
            })}
          </ul>
        )}
        </div>
      </div>

      {/* Thanh gộp bill — chỉ hiện khi đã tick từ 2 mâm trở lên */}
      {canClose && picked.size > 1 && (
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-modal">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted">Gộp {picked.size} mâm</span>
            <span className="font-semibold text-foreground tabular">{dong(pickedTotal)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPicked(new Set())}>Bỏ chọn</Button>
            <Button icon={<Printer />} onClick={() => printBill(pickedSessions)}>In 1 hoá đơn</Button>
            <Button variant="primary" onClick={() => setSheet({ kind: 'pay', sessions: pickedSessions })} disabled={busy} className="flex-1">
              Thu tiền
            </Button>
          </div>
        </div>
      )}

      {sheet.kind !== 'none' && (
        <Dialog
          open
          placement="side"
          title={sheetTitle}
          onClose={dongSheet}
          dismissible={!busy}
          className="md:inset-x-0 md:top-auto md:bottom-0 md:mx-auto md:h-auto md:max-h-[85dvh] md:w-full md:max-w-md md:rounded-none md:rounded-t-2xl"
        >
            {canClose && sheet.kind === 'pay' && (
              <>
                {sheet.sessions.some((s) => s.cooking_count > 0) && (
                  <Banner tone="warning" title={`Còn ${sheet.sessions.reduce((n, s) => n + s.cooking_count, 0)} món chưa xong`} className="mb-3">
                    Vẫn thu tiền và đóng bàn? Món đang làm vẫn nằm ở màn bếp.
                  </Banner>
                )}
                <p className="text-sm text-muted">Khách trả bằng gì?</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant="primary" size="touch" icon={<Banknote />} onClick={() => void doClose(sheet.sessions, 'paid', 'cash')} disabled={busy}>
                    Tiền mặt
                  </Button>
                  <Button size="touch" icon={<Landmark />} onClick={() => void doClose(sheet.sessions, 'paid', 'bank')} disabled={busy}>
                    Chuyển khoản
                  </Button>
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  Chuyển khoản: cho khách quét mã QR của quán, nghe loa báo tiền về rồi mới bấm.
                </p>
              </>
            )}

            {sheet.kind === 'more' && (
              <div className="space-y-2">
                <ActionRow
                  icon={<Plus />}
                  title="Thêm bàn vào mâm"
                  description="Đoàn đông thêm người. Thêm bàn xong là cả nhóm cùng gọi vào một bill."
                  onClick={() => setSheet({ kind: 'addTable', session: sheet.session })}
                  disabled={busy || freeTables.length === 0}
                />
                <ActionRow
                  icon={<Link2 />}
                  title="Nhập vào mâm khác"
                  description="Khách quét QR trước khi kịp ghép bàn. Chuyển cả món lẫn bàn sang mâm đích."
                  onClick={() => setSheet({ kind: 'merge', session: sheet.session })}
                  disabled={busy || openSessions.length < 2}
                />
                {!sheet.session.is_open_ordering && (
                  <ActionRow
                    icon={<RefreshCw />}
                    title="Chuyển quyền gọi món"
                    description="Nhả máy đang giữ bàn. Máy nào gọi món tiếp theo sẽ thành chủ. Bàn vẫn mở, bill giữ nguyên."
                    onClick={() => void doSimple(() => releaseTableSessionHost(sheet.session.session_id))}
                    disabled={busy || sheet.session.status !== 'open'}
                  />
                )}
                {canClose && (
                  <ActionRow
                    danger
                    icon={<Trash2 />}
                    title="Bỏ bàn (không thu tiền)"
                    description="Dùng cho đơn ma. Huỷ món chưa nấu, giữ nguyên món đã vào bếp."
                    onClick={() => setSheet({ kind: 'reset', session: sheet.session })}
                    disabled={busy}
                  />
                )}
              </div>
            )}

            {canClose && sheet.kind === 'reset' && (
              <>
                <p className="text-sm text-muted">
                  <span className="font-semibold text-foreground tabular">{dong(sheet.session.total)}</span> sẽ không được ghi nhận. Món chưa nấu bị huỷ; món đã
                  vào bếp giữ nguyên và vẫn phải xử lý tay.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button size="touch" onClick={() => setSheet({ kind: 'more', session: sheet.session })}>Quay lại</Button>
                  <Button variant="danger" size="touch" onClick={() => void doClose([sheet.session], 'staff_reset', null)} disabled={busy}>Bỏ bàn</Button>
                </div>
              </>
            )}

            {sheet.kind === 'tray' && (
              <>
                <p className="text-sm text-muted">
                  Chọn các bàn đoàn đang ngồi. QR của bàn nào trong mâm cũng dẫn về đúng mâm này,
                  và cả nhóm gọi thêm được — không khoá theo một máy.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {freeTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={pickTables.has(t.id)}
                      onClick={() => toggleTable(t.id)}
                      className={cn(
                        'min-h-12 cursor-pointer rounded-lg border text-sm font-medium transition-colors',
                        pickTables.has(t.id) ? 'border-primary bg-primary-light text-primary' : 'border-border-strong text-foreground active:bg-item-hover',
                      )}
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
                {freeTables.length === 0 && <EmptyState>Không còn bàn trống nào.</EmptyState>}
                <Button
                  variant="primary"
                  size="touch"
                  onClick={() => void doSimple(() => createTraySession([...pickTables]))}
                  disabled={busy || pickTables.size === 0}
                  className="mt-4 w-full"
                >
                  Ghép {pickTables.size > 0 ? `${pickTables.size} bàn ` : ''}thành mâm
                </Button>
              </>
            )}

            {sheet.kind === 'merge' && (
              <>
                <p className="text-sm text-muted">
                  Cả món đã gọi lẫn bàn sẽ chuyển sang mâm đích. Phiên này đóng lại, tiền gộp vào
                  bill của mâm đích.
                </p>
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  {openSessions
                    .filter((s) => s.session_id !== sheet.session.session_id)
                    .map((s) => (
                      <li key={s.session_id}>
                        <button
                          type="button"
                          onClick={() =>
                            void doSimple(() =>
                              mergeSessionIntoTray(sheet.session.session_id, s.session_id),
                            )
                          }
                          disabled={busy}
                          className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-3 text-left active:bg-item-hover disabled:opacity-50"
                        >
                          <span className="text-sm font-medium text-foreground">{s.table_number}</span>
                          <span className="text-[13px] text-muted tabular">{s.order_count} đơn · {dong(s.total)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}

            {sheet.kind === 'addTable' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {freeTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        void doSimple(() => addTableToSession(sheet.session.session_id, t.id))
                      }
                      disabled={busy}
                      className="min-h-12 cursor-pointer rounded-lg border border-border-strong text-sm font-medium text-foreground active:bg-item-hover disabled:opacity-50"
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
                {freeTables.length === 0 && <EmptyState>Không còn bàn trống nào.</EmptyState>}
              </>
            )}
        </Dialog>
      )}
    </div>
  )
}

function ActionRow({ icon, title, description, onClick, disabled, danger = false }: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        danger ? 'border-transparent bg-danger-bg active:bg-danger-bg-hover' : 'border-border-strong active:bg-item-hover',
      )}
    >
      <span className={cn('mt-0.5 inline-flex shrink-0 [&>svg]:size-5', danger ? 'text-danger' : 'text-muted')} aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', danger ? 'text-danger' : 'text-foreground')}>{title}</span>
        <span className={cn('mt-0.5 block text-[13px]', danger ? 'text-danger/80' : 'text-muted')}>{description}</span>
      </span>
    </button>
  )
}
