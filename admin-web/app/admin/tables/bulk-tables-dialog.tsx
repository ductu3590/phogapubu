'use client'

import { useMemo, useState, useTransition } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { addTablesBulk } from '@/lib/actions/tables'
import { previewBulkTables } from '@/lib/bulk-tables'

type Initial = { areaId: string | null; prefix: string; from: number; to: number }

// Hộp "Tạo nhiều bàn": tiền tố + số đầu → số cuối vào một khu. Xem trước sống; tên trùng bàn đang có bị bỏ qua.
// Sau khi tạo, hiện kết quả trong hộp rồi MỚI làm mới trang (onClose(true)): TablesClient có key theo danh sách
// bàn nên refresh sớm sẽ dựng lại và mất hộp trước khi người dùng đọc kết quả.
export default function BulkTablesDialog({
  open,
  areas,
  existingNames,
  initial,
  onClose,
}: {
  open: boolean
  areas: { id: string; name: string }[]
  existingNames: string[]
  initial?: Initial
  onClose: (changed: boolean) => void
}) {
  const start: Initial = initial ?? { areaId: areas[0]?.id ?? null, prefix: '', from: 1, to: 10 }
  const [areaId, setAreaId] = useState<string | null>(start.areaId)
  const [prefix, setPrefix] = useState(start.prefix)
  const [from, setFrom] = useState(String(start.from))
  const [to, setTo] = useState(String(start.to))
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; skipped: string[] } | null>(null)
  const [pending, startTransition] = useTransition()

  const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
  const preview = useMemo(
    () => previewBulkTables({ prefix, from: num(from), to: num(to) }, existingNames),
    [prefix, from, to, existingNames],
  )
  const count = preview.ok ? preview.create.length : 0

  const submit = () =>
    startTransition(async () => {
      setError(null)
      try {
        const res = await addTablesBulk({ areaId, prefix, from: num(from), to: num(to) })
        if (!res.ok) { setError(res.error); return }
        setDone({ created: res.created.length, skipped: res.skipped })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không tạo được bàn')
      }
    })

  return (
    <Dialog
      open={open}
      onClose={() => onClose(done !== null)}
      dismissible={!pending}
      title="Tạo nhiều bàn"
      description={done ? undefined : 'Ví dụ tiền tố “A” và số 1 đến 20 sẽ tạo A1, A2, … A20.'}
      footer={
        done ? (
          <div className="flex w-full justify-end">
            <Button type="button" variant="primary" onClick={() => onClose(true)}>Xong</Button>
          </div>
        ) : (
          <div className="flex w-full justify-end gap-2">
            <Button type="button" onClick={() => onClose(false)} disabled={pending}>Huỷ</Button>
            <Button type="button" variant="primary" onClick={submit} isLoading={pending} disabled={!preview.ok || count === 0 || pending}>
              {`Tạo ${count} bàn`}
            </Button>
          </div>
        )
      }
    >
      {done ? (
        <div className="space-y-2 text-sm text-foreground" role="status">
          <p>{`Đã tạo ${done.created} bàn.`}</p>
          {done.skipped.length > 0 && <p className="text-muted">{`Bỏ qua ${done.skipped.length} bàn trùng tên: ${done.skipped.join(', ')}.`}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-foreground/80">Khu</span>
              <Select value={areaId ?? ''} onChange={(e) => setAreaId(e.target.value || null)} disabled={pending}>
                <option value="">Chưa phân khu</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-foreground/80">Tiền tố</span>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="VD: A" disabled={pending} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground/80">Số đầu</span>
              <Input value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" disabled={pending} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground/80">Số cuối</span>
              <Input value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" disabled={pending} />
            </label>
          </div>

          {!preview.ok ? (
            <p role="alert" className="text-sm text-error-text">{preview.error}</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">{`Sẽ tạo ${count} bàn`}</p>
              <ul className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {[...preview.create.map((n) => ({ n, skip: false })), ...preview.skipped.map((n) => ({ n, skip: true }))]
                  .sort((a, b) => a.n.localeCompare(b.n, 'vi', { numeric: true }))
                  .map(({ n, skip }) => (
                    skip
                      ? <li key={`s-${n}`} className="rounded-lg bg-background px-2 py-1 text-[13px] text-muted">{`${n} · đã có, bỏ qua`}</li>
                      : <li key={`c-${n}`} className="rounded-lg border border-border bg-surface px-2 py-1 text-[13px] text-foreground">{n}</li>
                  ))}
              </ul>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-error-text">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}
