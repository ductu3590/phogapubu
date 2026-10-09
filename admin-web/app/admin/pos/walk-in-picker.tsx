'use client'

import { useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { areaColorClasses } from '@/lib/area-colors'
import { groupTablesByArea, type StaffArea } from '@/lib/staff-area-groups'
import { cn } from '@/lib/utils'

type FreeTable = { id: string; table_number: string; area_id: string | null }

/** "Khách lẻ" bước 1: chọn một bàn TRỐNG theo khu. Bàn chỉ thật sự mở khi thu ngân gửi món (pos_walk_in_order,
 *  mig 099) — đóng hộp thoại giữa chừng không để lại phiên rỗng nào. */
export default function WalkInPicker({ tables, areas, onPick, onClose }: {
  tables: FreeTable[]
  areas: StaffArea[]
  onPick: (table: FreeTable) => void
  onClose: () => void
}) {
  const sorted = useMemo(
    () => [...tables].sort((a, b) => a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' })),
    [tables],
  )
  const groups = useMemo(() => groupTablesByArea(sorted, areas), [sorted, areas])

  return (
    <Dialog
      open
      onClose={onClose}
      title="Khách lẻ · chọn bàn trống"
      description="Chọn bàn rồi chọn món hộ khách. Món ghi tay không gửi bếp — hợp với món ăn sẵn."
      className="max-w-xl sm:max-w-xl"
    >
      {groups.length === 0 ? (
        <EmptyState>Không còn bàn trống nào.</EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const c = g.area ? areaColorClasses(g.area.color) : null
            const title = g.area ? g.area.name : groups.length > 1 ? 'Chưa phân khu' : null
            return (
              <section key={g.area?.id ?? 'loose'} aria-label={title ?? 'Bàn trống'}>
                {title && (
                  <p className={cn('mb-2 flex items-center gap-2 text-[13px] font-semibold', c ? c.text : 'text-slate-500')}>
                    {c && <span className={cn('size-2.5 rounded-full', c.dot)} aria-hidden />}
                    {title}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {g.tables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onPick(t)}
                      className="min-h-12 cursor-pointer rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 transition-colors hover:border-orange-400 hover:bg-orange-50"
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}
