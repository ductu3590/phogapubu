'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import ConfirmDialog from '@/app/admin/pos/confirm-dialog'
import { createClient } from '@/lib/supabase/client'
import { readPrintStatus, type PrintStatus } from '@/lib/pos-browser-reads'
import {
  createPairCode,
  deletePrintStation,
  enqueueTestPrint,
  revokePrintAgent,
  savePrintMode,
  savePrintStation,
} from '@/lib/actions/print-settings'
import { canUseAgentMode, printerNames, type PrintSettings, type PrintStation } from '@/lib/print/print-settings'
import { cn } from '@/lib/utils'

const POLL_MS = 5000
const MAX_EMPTY_LIST_REFRESHES = 3

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })

const LINK_IN_THU_CLASS =
  'inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover'

// Link In thử chế độ trình duyệt. Thẻ a thường (không Link): mở tab mới, trang in tự gọi hộp thoại in.
function BrowserTestLink() {
  return (
    <a href="/print/test-slip" target="_blank" rel="noopener" className={LINK_IN_THU_CLASS}>
      In thử
    </a>
  )
}

export default function PrintSettingsSection({ storeId, initial }: { storeId: string; initial: PrintSettings | null }) {
  // Chưa có dữ liệu (mig 114 chưa áp hoặc RPC lỗi): giữ khối In ấn như trước, không văng trang.
  if (!initial) {
    return (
      <div>
        <p className="mb-4 text-sm text-muted">
          In một phiếu mẫu 80mm có tên, địa chỉ, SĐT quán để canh máy in. Không tạo đơn.
        </p>
        <BrowserTestLink />
      </div>
    )
  }
  return <PrintSettingsBody storeId={storeId} settings={initial} />
}

function PrintSettingsBody({ storeId, settings }: { storeId: string; settings: PrintSettings }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null)
  const [confirm, setConfirm] = useState<null | { kind: 'revoke' } | { kind: 'delete'; station: PrintStation }>(null)

  const agentMode = settings.mode === 'agent'
  const agentAllowed = canUseAgentMode(settings)

  // Chạy một action rồi làm mới dữ liệu máy chủ. Mọi lỗi hiện tại chỗ; không ném.
  // always: chạy dù thành công hay lỗi (vd. đóng hộp xác nhận để lỗi không nằm dưới lớp phủ).
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okNotice?: string, after?: () => void, always?: () => void) =>
    start(async () => {
      setError(null)
      setNotice(null)
      try {
        const res = await fn()
        if (!res.ok) { setError(res.error ?? 'Không thực hiện được'); return }
        if (okNotice) setNotice(okNotice)
        after?.()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không thực hiện được')
      } finally {
        always?.()
      }
    })

  return (
    <div className="space-y-5">
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Cách in phiếu</legend>
        <ModeOption
          checked={!agentMode}
          disabled={pending}
          value="browser"
          title="Một nơi (in bằng trình duyệt)"
          hint="In ngầm ra máy in mặc định của máy đang mở POS. Phiếu bếp và phiếu bàn in cùng lúc."
          onSelect={() => run(() => savePrintMode('browser'))}
        />
        <ModeOption
          checked={agentMode}
          disabled={pending || (!agentAllowed && !agentMode)}
          value="agent"
          title="Nhiều nơi (qua phần mềm in)"
          hint={
            !agentAllowed && !agentMode
              ? 'Cần đặt cả “Đơn khách xuống bếp” và “Đơn nhân viên xuống bếp” là “Chờ POS xác nhận” ở mục Quy trình vận hành bên dưới.'
              : 'Phiếu bếp ra máy in bếp, phiếu quầy ra máy in quầy, qua phần mềm in cài ở quầy.'
          }
          onSelect={() => run(() => savePrintMode('agent'))}
        />
      </fieldset>

      {error && <p role="status" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}

      {!agentMode ? (
        <div>
          <p className="mb-3 text-sm text-muted">
            In một phiếu mẫu 80mm có tên, địa chỉ, SĐT quán để canh máy in. Không tạo đơn.
          </p>
          <BrowserTestLink />
        </div>
      ) : (
        <AgentPanel
          storeId={storeId}
          settings={settings}
          pending={pending}
          onSaveStation={(input) => run(() => savePrintStation(input), 'Đã lưu trạm')}
          onTest={(id) => run(() => enqueueTestPrint(id), 'Đã gửi phiếu in thử tới trạm')}
          onDelete={(station) => setConfirm({ kind: 'delete', station })}
          onPair={() =>
            start(async () => {
              setError(null)
              const res = await createPairCode('Máy quầy')
              if (!res.ok) { setError(res.error); return }
              setPair({ code: res.code, expiresAt: res.expiresAt })
            })
          }
          onRevoke={() => setConfirm({ kind: 'revoke' })}
        />
      )}

      {pair && (
        <Dialog
          open
          onClose={() => { setPair(null); router.refresh() }}
          title="Mã ghép phần mềm in"
          description={`Nhập mã này vào phần mềm in ở quầy. Hết hạn lúc ${hhmm(pair.expiresAt)} (10 phút).`}
          footer={<Button variant="primary" onClick={() => { setPair(null); router.refresh() }}>Xong</Button>}
        >
          <p className="text-center font-mono text-4xl font-bold tracking-[0.3em]" aria-label="Mã ghép">{pair.code}</p>
          {settings.agent && (
            <p className="mt-3 text-sm text-muted">Ghép máy mới sẽ thay máy “{settings.agent.name}” hiện tại.</p>
          )}
        </Dialog>
      )}

      {confirm && (
      <ConfirmDialog
        open
        busy={pending}
        tone="danger"
        title={confirm.kind === 'delete' ? `Xoá trạm “${confirm.station.name}”?` : 'Gỡ phần mềm in khỏi quán?'}
        description={
          confirm.kind === 'delete'
            ? 'Món thuộc trạm này sẽ in ở trạm Bếp mặc định.'
            : 'Phần mềm in ở quầy sẽ ngừng nhận phiếu cho tới khi ghép lại bằng mã mới.'
        }
        confirmLabel={confirm.kind === 'delete' ? 'Xoá trạm' : 'Gỡ máy'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          run(
            () => (c.kind === 'delete' ? deletePrintStation(c.station.id) : revokePrintAgent(settings.agent!.id)),
            c.kind === 'delete' ? 'Đã xoá trạm' : 'Đã gỡ máy',
            undefined,
            () => setConfirm(null),
          )
        }}
      />
      )}
    </div>
  )
}

function ModeOption({ checked, disabled, value, title, hint, onSelect }: {
  checked: boolean
  disabled: boolean
  value: 'browser' | 'agent'
  title: string
  hint: string
  onSelect: () => void
}) {
  return (
    <label className={cn(
      'flex items-start gap-3 rounded-lg border p-3',
      checked ? 'border-orange-600 bg-orange-50' : 'border-border',
      disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
    )}>
      <input
        type="radio"
        name="print_mode"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => { if (!checked) onSelect() }}
        className="mt-1 accent-orange-600"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  )
}

function AgentPanel({ storeId, settings, pending, onSaveStation, onTest, onDelete, onPair, onRevoke }: {
  storeId: string
  settings: PrintSettings
  pending: boolean
  onSaveStation: (input: { id: string | null; name: string; printerName: string | null }) => void
  onTest: (stationId: string) => void
  onDelete: (station: PrintStation) => void
  onPair: () => void
  onRevoke: () => void
}) {
  // Trạng thái phần mềm: đọc từ TRÌNH DUYỆT mỗi 5 giây (không qua server action — server action xếp chung hàng
  // đợi với điều hướng của Next, xem CLAUDE.md 2026-10-04). Không mở kênh realtime nên không có kênh trùng tên
  // khi trang cài đặt xuất hiện cả trong hộp thoại lẫn trang thường; hai bản thì chỉ poll hai lần, vô hại.
  const router = useRouter()
  const client = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<PrintStatus | null>(null)
  const inflight = useRef(false)
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      if (inflight.current) return
      inflight.current = true
      try {
        const res = await readPrintStatus(client, storeId)
        if (!stopped && res.ok) setStatus(res.status)
      } catch {
        // mất mạng thoáng qua: giữ trạng thái cũ
      } finally {
        inflight.current = false
      }
    }
    void tick()
    const timer = setInterval(tick, POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [client, storeId])

  const agent = settings.agent

  // Máy vừa kết nối (online false -> true, thường sau khi ghép): làm mới dữ liệu máy chủ để ô chọn máy in có
  // danh sách máy in phần mềm báo lên và hiện đúng tên máy.
  const printers = printerNames(agent)
  const lastOnline = useRef(agent?.online === true)
  const emptyListRefreshes = useRef(0)
  useEffect(() => {
    if (!status) return
    if (status.agent_online && !lastOnline.current) {
      router.refresh()
    } else if (status.agent_online && printers.length === 0 && emptyListRefreshes.current < MAX_EMPTY_LIST_REFRESHES) {
      // Đã kết nối mà danh sách máy in còn rỗng (phần mềm chưa kịp báo lên lúc refresh trước): refresh tiếp,
      // tối đa vài lần để không refresh mãi khi máy thật sự không có máy in nào.
      emptyListRefreshes.current += 1
      router.refresh()
    }
    if (printers.length > 0) emptyListRefreshes.current = 0
    lastOnline.current = status.agent_online
  }, [status, router, printers.length])

  const online = status ? status.agent_online : agent?.online === true
  const [newName, setNewName] = useState('')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <span className={cn('inline-block size-2.5 rounded-full', online ? 'bg-green-600' : 'bg-slate-400')} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Phần mềm in: {online ? 'Đã kết nối' : 'Chưa kết nối'}
            {agent ? ` · ${agent.name}` : ' · chưa ghép máy nào'}
          </p>
          <p className="text-[13px] text-muted">
            {status && status.queued_count > 0 ? `${status.queued_count} phiếu đang chờ in. ` : ''}
            {status && status.problem_jobs.length > 0 ? `${status.problem_jobs.length} phiếu lỗi cần xem lại ở POS.` : ''}
          </p>
        </div>
        <Button variant="primary" disabled={pending} onClick={onPair}>Thêm máy</Button>
        {agent && <Button variant="danger" disabled={pending} onClick={onRevoke}>Gỡ máy</Button>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Trạm in</p>
        {settings.stations.map((st) => (
          // key theo dữ liệu máy chủ: sau router.refresh() ô nhập dựng lại đúng giá trị mới (bài học PA-3)
          <StationRow
            key={`${st.id}:${st.name}:${st.printer_name ?? ''}`}
            station={st}
            printers={printers}
            pending={pending}
            onSave={onSaveStation}
            onTest={onTest}
            onDelete={onDelete}
          />
        ))}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newName.trim()) return
            onSaveStation({ id: null, name: newName, printerName: null })
            setNewName('')
          }}
        >
          <input
            className="input max-w-xs"
            value={newName}
            maxLength={60}
            placeholder="Tên trạm mới (vd. Bếp nướng)"
            aria-label="Tên trạm mới"
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" disabled={pending || !newName.trim()}>Thêm trạm</Button>
        </form>
      </div>
    </div>
  )
}

function StationRow({ station, printers, pending, onSave, onTest, onDelete }: {
  station: PrintStation
  printers: string[]
  pending: boolean
  onSave: (input: { id: string | null; name: string; printerName: string | null }) => void
  onTest: (stationId: string) => void
  onDelete: (station: PrintStation) => void
}) {
  const [name, setName] = useState(station.name)
  const [printer, setPrinter] = useState(station.printer_name ?? '')
  const dirty = name.trim() !== station.name || printer !== (station.printer_name ?? '')
  const protectedStation = station.is_pos || station.is_default_kitchen
  // Máy đã lưu mà phần mềm không còn báo lên: vẫn hiện để người dùng thấy, không âm thầm đổi
  const options = printer && !printers.includes(printer) ? [printer, ...printers] : printers

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
      <input
        className="input w-44"
        value={name}
        maxLength={60}
        aria-label={`Tên trạm ${station.name}`}
        onChange={(e) => setName(e.target.value)}
      />
      {protectedStation && (
        <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted">
          {station.is_pos ? 'Quầy' : 'Bếp mặc định'}
        </span>
      )}
      <select
        className="input w-56"
        value={printer}
        aria-label={`Máy in của trạm ${station.name}`}
        onChange={(e) => setPrinter(e.target.value)}
      >
        <option value="">Chưa chọn máy in</option>
        {options.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <Button disabled={pending || !dirty || !name.trim()} onClick={() => onSave({ id: station.id, name, printerName: printer || null })}>
        Lưu
      </Button>
      <Button disabled={pending || dirty || !station.printer_name} onClick={() => onTest(station.id)}>In thử</Button>
      {!protectedStation && (
        <Button variant="danger" disabled={pending} onClick={() => onDelete(station)}>Xoá</Button>
      )}
    </div>
  )
}
