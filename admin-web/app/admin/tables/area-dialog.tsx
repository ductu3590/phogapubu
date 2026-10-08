'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { AREA_COLORS, nextAreaColor, parseAreaColor } from '@/lib/area-colors'
import { createArea, deleteArea, updateArea } from '@/lib/actions/table-areas'
import { cn } from '@/lib/utils'

export type EditableArea = { id: string; name: string; color: string; tableCount: number }

// Hộp "Thêm khu" / "Tuỳ chỉnh khu" (PA-3): tên + màu nhận diện (5 màu pastel) + xoá khi khu trống.
// Xoá bấm 2 lần trong hộp — KHÔNG dùng window.confirm (chặn luồng, xấu trên POS).
export default function AreaDialog({
  mode,
  area,
  usedColors,
  onClose,
}: {
  mode: 'create' | 'edit'
  area?: EditableArea
  usedColors: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(area?.name ?? '')
  const [color, setColor] = useState<string>(area ? parseAreaColor(area.color) : nextAreaColor(usedColors))
  const [error, setError] = useState<string | null>(null)
  const [armDelete, setArmDelete] = useState(false)
  const [pending, start] = useTransition()

  const finish = (res: { ok: true } | { ok: false; error: string }) => {
    if (!res.ok) { setError(res.error); return }
    router.refresh()
    onClose()
  }

  const save = () => start(async () => {
    setError(null)
    finish(mode === 'create' ? await createArea(name, color) : await updateArea(area!.id, { name, color }))
  })

  const remove = () => {
    if (!armDelete) { setArmDelete(true); return }
    start(async () => { setError(null); finish(await deleteArea(area!.id)) })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      title={mode === 'create' ? 'Thêm khu' : 'Tuỳ chỉnh khu'}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {mode === 'edit' && area ? (
            <Button type="button" variant="danger" icon={<Trash2 />} disabled={pending || area.tableCount > 0} onClick={remove}>
              {armDelete ? 'Bấm lần nữa để xoá' : 'Xoá khu'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" onClick={onClose} disabled={pending}>Huỷ</Button>
            <Button type="button" variant="primary" onClick={save} isLoading={pending}>Lưu</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">Tên khu</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="VD: Trong nhà, Sân vườn, Tầng 2" autoFocus />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground/80">Màu nhận diện</legend>
          <div className="flex flex-wrap gap-3">
            {AREA_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.key}
                onClick={() => setColor(c.key)}
                className={cn(
                  'grid size-10 cursor-pointer place-items-center rounded-full ring-offset-2 transition',
                  color === c.key ? 'ring-2 ring-slate-900' : 'ring-1 ring-slate-200 hover:ring-slate-400',
                )}
              >
                <span className={cn('size-7 rounded-full', c.dot)} />
              </button>
            ))}
          </div>
        </fieldset>
        {mode === 'edit' && area && area.tableCount > 0 && (
          <p className="text-[13px] text-muted">Khu còn {area.tableCount} bàn — chuyển hết bàn sang khu khác trước rồi mới xoá được.</p>
        )}
        {error && <p role="alert" className="text-sm text-error-text">{error}</p>}
      </div>
    </Dialog>
  )
}
