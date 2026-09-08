'use client'

import { useState } from 'react'
import type { FloorController } from './use-floor-layout'

const button = 'rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-50'

export default function AreaControls({ floor }: { floor: FloorController }) {
  const [name, setName] = useState('')
  return (
    <div className="space-y-3 border-b border-gray-200 bg-white px-5 py-3">
      <div className="flex flex-wrap items-center gap-2" aria-label="Khu vực">
        {[{ id: null, name: 'Chưa phân khu' }, ...floor.draft.areas].map(area => (
          <button key={area.id ?? 'none'} type="button" aria-pressed={floor.areaId === area.id}
            onClick={() => floor.setAreaId(area.id)} className={`${button} ${floor.areaId === area.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'text-gray-600'}`}>
            {area.name} · {floor.draft.tables.filter(t => t.area_id === area.id).length}
          </button>
        ))}
      </div>
      {floor.error && <p role="alert" className="text-sm text-red-700">{floor.error}</p>}
      {floor.notice && <p role="status" className="text-xs text-blue-700">{floor.notice}</p>}
      {!floor.ready && <button type="button" className={button} onClick={() => void floor.refresh()}>Tải lại sơ đồ</button>}
      {floor.arrange && (
        <fieldset disabled={floor.saving} className="space-y-3">
          <p className="text-xs text-blue-800">Kéo bàn bằng chuột hoặc chạm giữ rồi kéo. Thả lên bàn khác để đổi chỗ. Có thể chọn bàn bằng phím Tab và dùng phím mũi tên để di chuyển. Bấm <b>Lưu sơ đồ</b> để lưu tất cả khu vực.</p>
          <div className="flex flex-wrap gap-2">
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (floor.rename(null, name)) setName('') }}>
              <input aria-label="Tên khu vực mới" placeholder="Ví dụ: Tầng 1" maxLength={60} required value={name} onChange={e => setName(e.target.value)} className="min-w-0 w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <button className={button}>+ Tạo khu vực</button>
            </form>
            {floor.areaId && <RenameArea key={floor.areaId + floor.draft.areas.find(a => a.id === floor.areaId)?.name} floor={floor} />}
          </div>
          <details className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Phân bàn vào khu vực</summary>
            <div className="mt-3 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {[...floor.draft.tables].sort((a, b) => a.table_number.localeCompare(b.table_number, 'vi', { numeric: true })).map(table => (
                <label key={table.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{table.table_number}</span>
                  <select aria-label={`Khu vực của ${table.table_number}`} value={table.area_id ?? ''}
                    onChange={e => floor.transfer(table.id, e.target.value || null)} className="w-36 rounded border border-gray-200 p-2">
                    <option value="">Chưa phân khu</option>
                    {floor.draft.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
        </fieldset>
      )}
    </div>
  )
}

function RenameArea({ floor }: { floor: FloorController }) {
  const [name, setName] = useState(floor.draft.areas.find(a => a.id === floor.areaId)?.name ?? '')
  return <form className="flex gap-2" onSubmit={e => { e.preventDefault(); floor.rename(floor.areaId, name) }}>
    <input aria-label="Đổi tên khu vực đang chọn" maxLength={60} required value={name} onChange={e => setName(e.target.value)} className="min-w-0 w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
    <button className={button}>Đổi tên</button>
  </form>
}
