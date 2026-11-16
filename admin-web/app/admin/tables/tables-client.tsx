'use client'

import { Ban, Download, MoveRight, Plus, Printer, RotateCcw, Settings2, Trash2, X } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTable, setTableActive, deleteTables } from '@/lib/actions/tables'
import { setTableArea, setTablesArea } from '@/lib/actions/table-areas'
import { deleteTablesConfirmText } from '@/lib/table-delete'
import { buildTableQRUrl } from '@/lib/qr'
import { CLOSE_TABLE_LABEL, REOPEN_TABLE_LABEL, closeTableConfirmText } from '@/lib/table-close'
import { areaColorClasses } from '@/lib/area-colors'
import { groupTablesByArea, type GroupArea } from '@/lib/table-groups'
import { getButtonClasses } from '@/components/ui/button-classes'
import { cn } from '@/lib/utils'
import { useBackdropDismiss } from '@/components/ui/use-backdrop-dismiss'
import QRCode from 'qrcode'
import AreaDialog, { type EditableArea } from './area-dialog'
import BulkTablesDialog from './bulk-tables-dialog'

type Table = { id: string; table_number: string; is_active: boolean; area_id: string | null }

// QR vẽ ở trình duyệt dạng SVG (vài KB, nét sắc khi phóng to) — trang không phải chờ máy chủ dựng ảnh cho mọi bàn.
function TableQrImage({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } })
      .then((svg) => { if (live) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`) })
      .catch(() => { if (live) setSrc('') })
    return () => { live = false }
  }, [url])
  const box = 'mx-auto mb-3 aspect-square w-full max-w-[180px] rounded-lg border border-border bg-surface'
  if (src === null) return <div className={cn(box, 'animate-pulse bg-slate-100')} aria-hidden />
  if (src === '') return <div className={cn(box, 'flex items-center justify-center p-3 text-center text-xs text-muted')}>Không vẽ được QR</div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} className={box} />
}
type Area = GroupArea & { sort_order: number }

// Tab "Sơ đồ bàn & QR" (PA-3, bản vẽ A03): bàn nhóm theo KHU, mỗi khu một màu nhận diện pastel +
// nút Tuỳ chỉnh khu + In QR khu. Vị trí bàn trên sơ đồ vẫn kéo thả ở POS (Sắp xếp bàn).
export default function TablesClient({
  tables: initialTables,
  areas,
  storeSlug,
  zaloAppId,
}: {
  tables: Table[]
  areas: Area[]
  storeId: string
  storeSlug: string
  zaloAppId: string
}) {
  const [tables, setTables] = useState<Table[]>(initialTables)
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState<string | null | false>(false) // false = đóng; string/null = khu mặc định
  const [areaDialog, setAreaDialog] = useState<{ mode: 'create' } | { mode: 'edit'; area: EditableArea } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [generatingQR, setGeneratingQR] = useState<string | null>(null)
  // Tích chọn nhiều bàn (2026-11-16) → chuyển khu / xoá cả lô ở thanh thao tác dính dưới cùng.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const router = useRouter()
  // Bấm nền để đóng form Thêm bàn: chỉ khi nhấn VÀ thả đều trên nền (quét chọn chữ lỡ thả ra ngoài không đóng).
  const addBackdrop = useBackdropDismiss(() => setShowAdd(false))

  const groups = groupTablesByArea(areas, tables)
  const usedColors = areas.map((a) => a.color)

  // Đóng bàn / Mở lại bàn. Server (trigger mig 138) từ chối đóng bàn đang có khách hoặc đang giữ cho
  // lượt đặt bàn → hoàn tác và báo đúng câu của server.
  const handleSetActive = (table: Table, next: boolean) => {
    if (!next && !confirm(closeTableConfirmText(table.table_number))) return
    const snapshot = tables
    setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, is_active: next } : t))
    startTransition(async () => {
      const res = await setTableActive(table.id, next)
      if (!res.ok) { setTables(snapshot); alert(res.error); return }
      router.refresh()
    })
  }

  const toggle = (ids: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  })
  const selectedIds = tables.filter((t) => selected.has(t.id)).map((t) => t.id)

  // Xoá một hoặc nhiều bàn, kể cả bàn đã có đơn: đơn + doanh thu cũ dồn sang bàn nhận (câu xác nhận nêu tên bàn đó,
  // lib/table-delete.ts; server làm trong một giao dịch, mig 142). Bàn đang có khách / đang giữ đặt bàn thì server
  // từ chối cả lô → hoàn tác và báo đúng câu của server.
  const handleDelete = (ids: string[]) => {
    if (ids.length === 0 || !confirm(deleteTablesConfirmText(tables, ids))) return
    const snapshot = tables
    setTables((prev) => prev.filter((t) => !ids.includes(t.id)))
    startTransition(async () => {
      const res = await deleteTables(ids)
      if (!res.ok) {
        setTables(snapshot) // hoàn tác optimistic update khi xoá thất bại
        alert(res.error)
        return
      }
      toggle(ids, false)
      if (res.movedOrders > 0 && res.targetName) {
        alert(`Đã xoá ${res.deleted} bàn. ${res.movedOrders} đơn cũ đã chuyển sang "${res.targetName}" — doanh thu giữ nguyên.`)
      }
      router.refresh()
    })
  }

  // Chuyển các bàn đã chọn sang một khu (một lệnh, lọc store_id ở server).
  const handleMoveMany = (ids: string[], areaId: string | null) => {
    if (ids.length === 0) return
    const snapshot = tables
    setTables((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, area_id: areaId } : t))
    startTransition(async () => {
      const res = await setTablesArea(ids, areaId)
      if (!res.ok) { setTables(snapshot); alert(res.error); return }
      toggle(ids, false)
      router.refresh()
    })
  }

  const handleMove = (tableId: string, areaId: string | null) => {
    const snapshot = tables
    setTables((prev) => prev.map((t) => t.id === tableId ? { ...t, area_id: areaId } : t))
    startTransition(async () => {
      const res = await setTableArea(tableId, areaId)
      if (!res.ok) { setTables(snapshot); alert(res.error); return }
      router.refresh()
    })
  }

  const handleDownloadQR = async (table: Table) => {
    setGeneratingQR(table.id)
    try {
      const url = buildTableQRUrl(zaloAppId, storeSlug, table.id)
      const dataUrl = await QRCode.toDataURL(url, {
        width: 600,
        margin: 3,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      })
      // Tạo link download
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `QR-${table.table_number.replace(/\s+/g, '-')}.png`
      a.click()
    } catch (e) {
      alert('Không tạo được QR: ' + String(e))
    } finally {
      setGeneratingQR(null)
    }
  }

  const printHref = (q: string) => `/print/table-qr?${q}`

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Thanh trên: đếm + thêm khu / thêm bàn / in cả quán */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {tables.length} bàn · {areas.length} khu
          {tables.some((t) => !t.is_active) && <> · {tables.filter((t) => !t.is_active).length} bàn đã đóng</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAreaDialog({ mode: 'create' })} className={getButtonClasses('outline')}>
            <Plus className="size-4" aria-hidden />Thêm khu
          </button>
          <button type="button" onClick={() => setShowAdd(null)} className={getButtonClasses('primary')}>
            <Plus className="size-4" aria-hidden />Thêm bàn
          </button>
          <button type="button" onClick={() => setBulkOpen(true)} className={getButtonClasses('outline')}>
            <Plus className="size-4" aria-hidden />Tạo nhiều bàn
          </button>
          <a href={printHref('area=all')} target="_blank" rel="noopener" className={getButtonClasses('outline')}>
            <Printer className="size-4" aria-hidden />In QR cả quán
          </a>
        </div>
      </div>

      <div className="space-y-6">
        {groups.map((g) => {
          const color = g.area ? areaColorClasses(g.area.color) : null
          return (
            <section key={g.area?.id ?? 'none'} aria-label={g.area?.name ?? 'Chưa phân khu'}>
              {/* Đầu khu: vạch + chấm màu nhận diện (không phải trạng thái) */}
              <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3', color?.bar ?? 'border-l-4 border-l-slate-200')}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('size-3 shrink-0 rounded-full', color?.dot ?? 'bg-slate-300')} aria-hidden />
                  <h2 className="truncate text-base font-bold text-foreground">{g.area?.name ?? 'Chưa phân khu'}</h2>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1', color?.chip ?? 'bg-slate-50 text-slate-600 ring-slate-200')}>
                    {g.tables.length} bàn
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.tables.length > 0 && (() => {
                    const ids = g.tables.map((t) => t.id)
                    const all = ids.every((id) => selected.has(id))
                    return (
                      <label className={cn(getButtonClasses('ghost'), 'cursor-pointer')}>
                        <input
                          type="checkbox"
                          className="size-4 accent-orange-600"
                          checked={all}
                          ref={(el) => { if (el) el.indeterminate = !all && ids.some((id) => selected.has(id)) }}
                          onChange={(e) => toggle(ids, e.target.checked)}
                          aria-label={`Chọn cả khu ${g.area?.name ?? 'Chưa phân khu'}`}
                        />
                        {all ? 'Bỏ chọn khu' : 'Chọn cả khu'}
                      </label>
                    )
                  })()}
                  {g.area && (
                    <button
                      type="button"
                      onClick={() => setAreaDialog({ mode: 'edit', area: { id: g.area!.id, name: g.area!.name, color: g.area!.color, tableCount: g.tables.length } })}
                      className={getButtonClasses('ghost')}
                    >
                      <Settings2 className="size-4" aria-hidden />Tuỳ chỉnh khu
                    </button>
                  )}
                  {g.tables.some((t) => t.is_active) && (
                    <a href={printHref(`area=${g.area?.id ?? 'none'}`)} target="_blank" rel="noopener" className={getButtonClasses('ghost')}>
                      <Printer className="size-4" aria-hidden />In QR khu này
                    </a>
                  )}
                </div>
              </div>

              {g.tables.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
                  Chưa có bàn — chọn khu cho bàn ở ô &quot;Khu&quot; của bàn bất kỳ, hoặc bấm Thêm bàn.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.tables.map((table) => (
                    <div
                      key={table.id}
                      className={cn(
                        'rounded-xl border p-4 transition-all',
                        table.is_active ? 'border-border bg-surface' : 'border-border bg-background',
                        selected.has(table.id) && 'border-orange-500 ring-2 ring-orange-500',
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <label className="flex min-w-0 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-orange-600"
                            checked={selected.has(table.id)}
                            onChange={(e) => toggle([table.id], e.target.checked)}
                            aria-label={`Chọn ${table.table_number}`}
                          />
                          <span className={cn('truncate font-bold', table.is_active ? 'text-foreground' : 'text-muted')}>
                            {table.table_number}
                          </span>
                        </label>
                        {/* Nhãn trạng thái — chỉ để đọc; nút đổi trạng thái nằm ở hàng nút bên dưới */}
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            table.is_active ? 'bg-success-bg text-success' : 'bg-secondary text-muted'
                          }`}
                        >
                          {table.is_active ? 'Đang dùng' : 'Đã đóng'}
                        </span>
                      </div>

                      {/* Ảnh QR hiện sẵn trên trang */}
                      {zaloAppId ? (
                        <TableQrImage url={buildTableQRUrl(zaloAppId, storeSlug, table.id)} label={`QR ${table.table_number}`} />
                      ) : (
                        <div className="mx-auto mb-3 flex aspect-square w-full max-w-[180px] items-center justify-center rounded-lg border border-dashed border-border bg-background p-3 text-center text-xs text-muted">
                          Chưa cấu hình Zalo Mini App cho quán
                        </div>
                      )}

                      <label className="mb-2 block">
                        <span className="sr-only">Khu của {table.table_number}</span>
                        <select
                          aria-label={`Khu của ${table.table_number}`}
                          value={table.area_id ?? ''}
                          disabled={isPending}
                          onChange={(e) => handleMove(table.id, e.target.value || null)}
                          className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-focus"
                        >
                          <option value="">Chưa phân khu</option>
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </label>

                      <div className="flex flex-col gap-2">
                        {/* Tải QR */}
                        <button
                          onClick={() => handleDownloadQR(table)}
                          disabled={generatingQR === table.id || !zaloAppId}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-strong py-2 text-[13px] font-medium text-foreground hover:bg-button-hover disabled:opacity-50"
                        >
                          <Download className="size-3.5" aria-hidden />{generatingQR === table.id ? 'Đang tạo...' : 'Tải QR PNG'}
                        </button>
                        {table.is_active && zaloAppId && (
                          <a
                            href={printHref(`table=${table.id}`)}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-strong py-2 text-[13px] font-medium text-foreground hover:bg-button-hover"
                          >
                            <Printer className="size-3.5" aria-hidden />In QR
                          </a>
                        )}

                        {/* Đóng bàn / Mở lại bàn */}
                        <button
                          type="button"
                          onClick={() => handleSetActive(table, !table.is_active)}
                          disabled={isPending}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-strong py-2 text-[13px] font-medium text-foreground hover:bg-button-hover disabled:opacity-50"
                        >
                          {table.is_active
                            ? <><Ban className="size-3.5" aria-hidden />{CLOSE_TABLE_LABEL}</>
                            : <><RotateCcw className="size-3.5" aria-hidden />{REOPEN_TABLE_LABEL}</>}
                        </button>

                        {/* Xoá */}
                        <button
                          onClick={() => handleDelete([table.id])}
                          disabled={isPending}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] text-muted hover:bg-danger-bg hover:text-danger"
                        >
                          <Trash2 className="size-3.5" aria-hidden />Xoá
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* Thanh thao tác cho các bàn đã tích chọn — dính đáy vùng cuộn, luôn thấy khi cuộn qua nhiều khu */}
      {selectedIds.length > 0 && (
        <div
          role="toolbar"
          aria-label="Thao tác với bàn đã chọn"
          className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-t border-border bg-surface/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:-mx-6 md:px-6"
        >
          <p className="mr-auto text-sm font-semibold text-foreground">Đã chọn {selectedIds.length} bàn</p>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <MoveRight className="size-4 text-muted" aria-hidden />
            <select
              aria-label="Chuyển các bàn đã chọn sang khu"
              value=""
              disabled={isPending}
              onChange={(e) => { const v = e.target.value; if (v) handleMoveMany(selectedIds, v === '__none' ? null : v) }}
              className="min-h-10 rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground outline-none focus:border-focus"
            >
              <option value="">Chuyển sang khu…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__none">Chưa phân khu</option>
            </select>
          </label>
          <button type="button" onClick={() => handleDelete(selectedIds)} disabled={isPending} className={getButtonClasses('danger')}>
            <Trash2 className="size-4" aria-hidden />Xoá {selectedIds.length} bàn
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className={getButtonClasses('ghost')}>
            <X className="size-4" aria-hidden />Bỏ chọn
          </button>
        </div>
      )}

      {/* Modal thêm bàn */}
      {showAdd !== false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...addBackdrop}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl text-foreground">
            <h3 className="mb-4 text-lg font-bold text-foreground">Thêm bàn mới</h3>
            <form
              action={async (fd) => {
                try {
                  await addTable(fd)
                  setShowAdd(false)
                  router.refresh()
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Không thêm được bàn')
                }
              }}
              className="flex flex-col gap-3"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">Tên bàn *</label>
                <input
                  name="table_number"
                  required
                  placeholder="VD: Bàn 11, Bàn VIP A, Sân thượng 1..."
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-foreground bg-surface placeholder-muted outline-none focus:border-focus"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">Khu</label>
                <select
                  name="area_id"
                  defaultValue={showAdd ?? ''}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-focus"
                >
                  <option value="">Chưa phân khu</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border border-border-strong py-2.5 text-sm font-medium text-foreground hover:bg-button-hover">Huỷ</button>
                <button type="submit" className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">Thêm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkTablesDialog
          open
          areas={areas.map((a) => ({ id: a.id, name: a.name }))}
          existingNames={tables.map((t) => t.table_number)}
          // Refresh SAU khi người dùng đọc kết quả: TablesClient có key theo danh sách bàn nên refresh
          // sớm sẽ dựng lại component và mất hộp thoại.
          onClose={(changed) => {
            setBulkOpen(false)
            if (changed) router.refresh()
          }}
        />
      )}

      {areaDialog && (
        <AreaDialog
          mode={areaDialog.mode}
          area={areaDialog.mode === 'edit' ? areaDialog.area : undefined}
          usedColors={usedColors}
          onClose={() => setAreaDialog(null)}
        />
      )}
    </div>
  )
}
