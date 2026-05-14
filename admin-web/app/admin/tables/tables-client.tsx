'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTable, toggleTable, deleteTable } from '@/lib/actions/tables'
import { buildTableQRUrl } from '@/lib/qr'
import QRCode from 'qrcode'

type Table = { id: string; table_number: string; is_active: boolean }

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
    setTables((prev) => prev.filter((t) => t.id !== tableId))
    startTransition(() => deleteTable(tableId))
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
        <p className="text-sm text-gray-500">{tables.length} bàn</p>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
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
              table.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <p className={`font-bold ${table.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                {table.table_number}
              </p>
              {/* Toggle active */}
              <button
                onClick={() => handleToggle(table.id, table.is_active)}
                disabled={isPending}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  table.is_active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {table.is_active ? 'Mở' : 'Đóng'}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {/* Tải QR */}
              <button
                onClick={() => handleDownloadQR(table)}
                disabled={generatingQR === table.id}
                className="w-full rounded-lg border border-orange-200 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
              >
                {generatingQR === table.id ? '⏳ Đang tạo...' : '📥 Tải QR PNG'}
              </button>

              {/* Xoá */}
              <button
                onClick={() => handleDelete(table.id, table.table_number)}
                className="w-full rounded-lg py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
              >
                🗑️ Xoá
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal thêm bàn */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-gray-900">Thêm bàn mới</h3>
            <form
              action={async (fd) => {
                await addTable(fd)
                setShowAdd(false)
                router.refresh()
              }}
              className="flex flex-col gap-3"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tên bàn *</label>
                <input
                  name="table_number"
                  required
                  placeholder="VD: Bàn 11, Bàn VIP A, Sân thượng 1..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 bg-white placeholder-gray-400 outline-none focus:border-orange-400"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-gray-600">Huỷ</button>
                <button type="submit" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">Thêm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
