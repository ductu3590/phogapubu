'use client'

import { Download, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTable, toggleTable, deleteTable } from '@/lib/actions/tables'
import { buildTableQRUrl } from '@/lib/qr'
import QRCode from 'qrcode'

type Table = { id: string; table_number: string; is_active: boolean; qrDataUrl: string }

export default function TablesClient({
  tables: initialTables,
  storeSlug,
  zaloAppId,
}: {
  tables: Table[]
  storeId: string
  storeSlug: string
  zaloAppId: string
}) {
  const [tables, setTables] = useState<Table[]>(initialTables)
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [generatingQR, setGeneratingQR] = useState<string | null>(null)
  const router = useRouter()

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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Nút thêm bàn */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{tables.length} bàn</p>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          + Thêm bàn
        </button>
      </div>

      {/* Grid bàn */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => (
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

            <div className="flex flex-col gap-2">
              {/* Tải QR */}
              <button
                onClick={() => handleDownloadQR(table)}
                disabled={generatingQR === table.id}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-strong py-2 text-[13px] font-medium text-foreground hover:bg-button-hover disabled:opacity-50"
              >
                <Download className="size-3.5" aria-hidden />{generatingQR === table.id ? 'Đang tạo...' : 'Tải QR PNG'}
              </button>

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

      {/* Modal thêm bàn */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl text-foreground" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-foreground">Thêm bàn mới</h3>
            <form
              action={async (fd) => {
                await addTable(fd)
                setShowAdd(false)
                router.refresh()
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
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border border-border-strong py-2.5 text-sm font-medium text-foreground hover:bg-button-hover">Huỷ</button>
                <button type="submit" className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">Thêm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
