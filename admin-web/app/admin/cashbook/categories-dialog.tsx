'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/field'
import { Tabs } from '@/components/ui/tabs'
import { saveCashBookCategory, setCashBookCategoryActive } from '@/lib/actions/cash-book'
import {
  REPORT_GROUP_LABEL, userReportGroups, type CashBookCategory, type CashBookKind, type ReportGroup,
} from '@/lib/cash-book'
import { cn } from '@/lib/utils'

// Quản lý danh mục sổ thu chi (chủ quán + quản lý). Danh mục hệ thống ("Nhập hàng") không đổi tên / ẩn được;
// danh mục người dùng không chọn được nhóm "Nhập hàng". Đổi nhóm của danh mục đã có phiếu bị server chặn nên ở đây
// chỉ cho chọn nhóm lúc tạo, sửa chỉ đổi tên.

export function CategoryList({ categories, busyId, onRename, onToggle }: {
  categories: CashBookCategory[]
  busyId: string | null
  onRename: (c: CashBookCategory, name: string) => void
  onToggle: (c: CashBookCategory) => void
}) {
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  if (categories.length === 0) return <p className="text-sm text-muted">Chưa có danh mục.</p>
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          {editing?.id === c.id ? (
            <form
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); onRename(c, editing.name); setEditing(null) }}
            >
              <Input aria-label="Tên danh mục" maxLength={60} value={editing.name} className="min-w-40 flex-1"
                onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
              <Button type="submit" variant="primary" disabled={!editing.name.trim()}>Lưu</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Huỷ</Button>
            </form>
          ) : (
            <>
              <div className={cn('min-w-0', !c.isActive && 'text-muted')}>
                <p className="text-sm font-medium">
                  {c.name}
                  {c.isSystem ? <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[12px] font-medium text-foreground/70">Hệ thống</span> : null}
                  {!c.isActive ? <span className="ml-2 text-[12px]">(đang ẩn)</span> : null}
                </p>
                <p className="text-[13px] text-muted">{REPORT_GROUP_LABEL[c.reportGroup]}{c.requiresNote ? ' · cần ghi chú' : ''}</p>
              </div>
              {c.isSystem ? null : (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" disabled={busyId === c.id} onClick={() => setEditing({ id: c.id, name: c.name })}>Đổi tên</Button>
                  <Button variant="ghost" isLoading={busyId === c.id} onClick={() => onToggle(c)}>{c.isActive ? 'Ẩn' : 'Hiện lại'}</Button>
                </div>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export function CategoryCreateForm({ kind, busy, onCreate }: {
  kind: CashBookKind
  busy: boolean
  onCreate: (name: string, group: ReportGroup) => void
}) {
  const groups = userReportGroups(kind)
  const [name, setName] = useState('')
  const [group, setGroup] = useState<ReportGroup>(groups[0])
  // Đổi tab Chi ↔ Thu thì nhóm đang chọn có thể không còn hợp lệ → về nhóm đầu của loại mới.
  const current = groups.includes(group) ? group : groups[0]
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name.trim(), current); setName('') } }}
    >
      <label className="min-w-40 flex-1 text-sm">
        <span className="mb-1 block font-medium text-foreground">Danh mục mới</span>
        <Input maxLength={60} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ Thuê loa" />
      </label>
      <label className="min-w-40 text-sm">
        <span className="mb-1 block font-medium text-foreground">Nhóm báo cáo</span>
        <Select value={current} disabled={busy} onChange={(e) => setGroup(e.target.value as ReportGroup)}>
          {groups.map((g) => <option key={g} value={g}>{REPORT_GROUP_LABEL[g]}</option>)}
        </Select>
      </label>
      <Button type="submit" variant="primary" isLoading={busy} disabled={!name.trim()}>Thêm</Button>
    </form>
  )
}

export default function CategoriesDialog({ open, categories, onClose, onChanged }: {
  open: boolean
  categories: CashBookCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  const [kind, setKind] = useState<CashBookKind>('payment')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<{ ok: true } | { ok: true; id: string } | { ok: false; error: string }>) => {
    setError(null)
    try {
      const res = await fn()
      if (!res.ok) { setError(res.error); return }
      onChanged()
    } catch {
      setError('Lỗi kết nối. Thử lại.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} placement="side" title="Danh mục thu chi">
      {open ? (
        <div className="space-y-4">
          <Tabs<CashBookKind>
            label="Loại danh mục" variant="segmented" value={kind} onValueChange={(k) => { setKind(k); setError(null) }}
            items={[{ value: 'payment', label: 'Chi' }, { value: 'receipt', label: 'Thu' }]}
          />
          <CategoryList
            categories={categories.filter((c) => c.kind === kind)}
            busyId={busyId}
            onRename={(c, name) => {
              setBusyId(c.id)
              void run(() => saveCashBookCategory({ id: c.id, kind: c.kind, name, reportGroup: null })).finally(() => setBusyId(null))
            }}
            onToggle={(c) => {
              setBusyId(c.id)
              void run(() => setCashBookCategoryActive({ id: c.id, active: !c.isActive })).finally(() => setBusyId(null))
            }}
          />
          <CategoryCreateForm
            key={kind}
            kind={kind}
            busy={creating}
            onCreate={(name, group) => {
              setCreating(true)
              void run(() => saveCashBookCategory({ id: null, kind, name, reportGroup: group })).finally(() => setCreating(false))
            }}
          />
          {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
        </div>
      ) : null}
    </Dialog>
  )
}
