'use client'

import { Download, Plus, Printer, Settings2, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTable, toggleTable, deleteTable } from '@/lib/actions/tables'
import { setTableArea } from '@/lib/actions/table-areas'
import { buildTableQRUrl } from '@/lib/qr'
import { areaColorClasses } from '@/lib/area-colors'
import { groupTablesByArea, type GroupArea } from '@/lib/table-groups'
import { getButtonClasses } from '@/components/ui/button-classes'
import { cn } from '@/lib/utils'
import QRCode from 'qrcode'
import AreaDialog, { type EditableArea } from './area-dialog'

type Table = { id: string; table_number: string; is_active: boolean; area_id: string | null; qrDataUrl: string }
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
  const [generatingQR, setGeneratingQR] = useState<string | null>(null)
  const router = useRouter()

  const groups = groupTablesByArea(areas, tables)
  const usedColors = areas.map((a) => a.color)

  const handleToggle = (tableId: string, current: boolean) => {
    // Optimistic update
    setTables((prev) => prev.map((t) => t.id === tableId ? { ...t, is_active: !current } : t))
    startTransition(() => toggleTable(tableId, !current))
  }

  const handleDelete = (tableId: string, name: string) => {
    if (!confirm(`Xoá "${name}"? Thao tác không thể hoàn tác.`)) return
    const snapshot = tables
    setTables((prev) => prev.filter((t) => t.id !== tableId))
    startTransition(async () => {
      const res = await deleteTable(tableId)
      if (res?.error) {
        setTables(snapshot) // hoàn tác optimistic update khi xoá thất bại
        alert(res.error)
      }
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

  const printHref = (q: string) => `/admin/tables/print-qr?${q}`

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Thanh trên: đếm + thêm khu / thêm bàn / in cả quán */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{tables.length} bàn · {areas.length} khu</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAreaDialog({ mode: 'create' })} className={getButtonClasses('outline')}>
            <Plus className="size-4" aria-hidden />Thêm khu
          </button>
          <button type="button" onClick={() => setShowAdd(null)} className={getButtonClasses('primary')}>
            <Plus className="size-4" aria-hidden />Thêm bàn
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
                      className={`rounded-xl border p-4 transition-all ${
                        table.is_active ? 'border-border bg-surface' : 'border-border bg-background'
                      }`}
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <p className={`font-bold ${table.is_active ? 'text-foreground' : 'text-muted'}`}>
                          {table.table_number}
                        </p>
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggle(table.id, table.is_active)}
                          disabled={isPending}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            table.is_active
                              ? 'bg-success-bg text-success'
                              : 'bg-secondary text-muted'
                          }`}
                        >
                          {table.is_active ? 'Mở' : 'Đóng'}
                        </button>
                      </div>

                      {/* Ảnh QR hiện sẵn trên trang */}
                      {table.qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={table.qrDataUrl}
                          alt={`QR ${table.table_number}`}
                          className="mx-auto mb-3 aspect-square w-full max-w-[180px] rounded-lg border border-border bg-surface"
                        />
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

                        {/* Xoá */}
                        <button
                          onClick={() => handleDelete(table.id, table.table_number)}
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

      {/* Modal thêm bàn */}
      {showAdd !== false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl text-foreground" onClick={(e) => e.stopPropagation()}>
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
