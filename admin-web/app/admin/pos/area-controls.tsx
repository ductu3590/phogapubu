'use client'

import { useState } from 'react'
import { Plus, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { areaColorClasses } from '@/lib/area-colors'
import type { FloorController } from './use-floor-layout'

export default function AreaControls({ floor }: { floor: FloorController }) {
  const [name, setName] = useState('')
  return (
    <div className="space-y-3 border-b border-border bg-surface px-4 py-3 md:px-5">
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Khu vực">
        {[{ id: null, name: 'Chưa phân khu', color: undefined as string | undefined }, ...floor.draft.areas].map(area => {
          const isActive = floor.areaId === area.id
          return (
            <button
              key={area.id ?? 'none'}
              type="button"
              aria-pressed={isActive}
              onClick={() => floor.setAreaId(area.id)}
              className={cn(
                'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                isActive ? 'bg-primary-light text-primary' : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground',
              )}
            >
              {area.id && <span className={cn('size-2 shrink-0 rounded-full', areaColorClasses(area.color).dot)} aria-hidden />}
              {area.name}
              <span className={cn('text-[13px] font-normal tabular', isActive ? 'text-primary' : 'text-muted')}>
                {floor.draft.tables.filter(t => t.area_id === area.id).length}
              </span>
            </button>
          )
        })}
      </div>
      {floor.error && <p role="alert" className="text-sm text-error-text">{floor.error}</p>}
      {floor.notice && <p role="status" className="text-sm text-info">{floor.notice}</p>}
      {!floor.ready && (
        <Button icon={<RotateCw />} onClick={() => void floor.refresh()}>
          Tải lại sơ đồ
        </Button>
      )}
      {floor.arrange && (
        <fieldset disabled={floor.saving} className="space-y-3">
          <p className="text-sm text-muted">Kéo bàn bằng chuột hoặc chạm giữ rồi kéo. Thả lên bàn khác để đổi chỗ. Có thể chọn bàn bằng phím Tab và dùng phím mũi tên để di chuyển. Bấm <b className="font-semibold text-foreground">Lưu sơ đồ</b> để lưu tất cả khu vực.</p>
          <div className="flex flex-wrap gap-2">
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (floor.rename(null, name)) setName('') }}>
              <Input aria-label="Tên khu vực mới" placeholder="Ví dụ: Tầng 1" maxLength={60} required value={name} onChange={e => setName(e.target.value)} className="w-44" />
              <Button type="submit" icon={<Plus />}>Tạo khu vực</Button>
            </form>
            {floor.areaId && <RenameArea key={floor.areaId + floor.draft.areas.find(a => a.id === floor.areaId)?.name} floor={floor} />}
          </div>
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Phân bàn vào khu vực</summary>
            <div className="mt-3 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {[...floor.draft.tables].sort((a, b) => a.table_number.localeCompare(b.table_number, 'vi', { numeric: true })).map(table => (
                <label key={table.id} className="flex items-center justify-between gap-2 text-sm text-foreground">
                  <span className="truncate">{table.table_number}</span>
                  <div className="w-40 shrink-0">
                    <Select aria-label={`Khu vực của ${table.table_number}`} value={table.area_id ?? ''}
                      onChange={e => floor.transfer(table.id, e.target.value || null)}>
                      <option value="">Chưa phân khu</option>
                      {floor.draft.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </div>
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
    <Input aria-label="Đổi tên khu vực đang chọn" maxLength={60} required value={name} onChange={e => setName(e.target.value)} className="w-44" />
    <Button type="submit">Đổi tên</Button>
  </form>
}
