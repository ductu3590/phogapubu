'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSpinEnabled, saveRewards, type RewardInput } from '@/lib/actions/spin'

type Row = RewardInput & { key: string }

const DEFAULT_REWARDS: Omit<RewardInput, 'id'>[] = [
  { label: 'Giảm 10.000đ đơn sau', type: 'gift', weight: 1, is_active: true },
  { label: 'Tặng 1 trà đá', type: 'gift', weight: 2, is_active: true },
  { label: 'Chúc may mắn lần sau', type: 'none', weight: 4, is_active: true },
  { label: 'Giảm 5% đơn sau', type: 'gift', weight: 1, is_active: true },
  { label: 'Tặng khăn lạnh', type: 'gift', weight: 2, is_active: true },
  { label: 'Chúc may mắn lần sau', type: 'none', weight: 4, is_active: true },
]

let keySeq = 0
const newKey = () => `r${keySeq++}`

export default function SpinClient({
  enabled,
  initialRewards,
}: {
  enabled: boolean
  initialRewards: RewardInput[]
}) {
  const router = useRouter()
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [rows, setRows] = useState<Row[]>(
    initialRewards.map((r) => ({ ...r, key: newKey() })),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const activeCount = rows.filter((r) => r.is_active && r.label.trim()).length

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key))
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { key: newKey(), label: '', type: 'gift', weight: 1, is_active: true },
    ])
  const loadDefaults = () =>
    setRows(DEFAULT_REWARDS.map((r) => ({ ...r, key: newKey() })))

  const handleSave = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await saveRewards(rows.map(({ key: _key, ...r }) => r))
      if (res?.error) {
        setError(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } catch {
      setError('Lỗi kết nối khi lưu quà, thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async () => {
    setError('')
    const next = !isEnabled
    setBusy(true)
    try {
      const res = await setSpinEnabled(next)
      if (res?.error) {
        setError(res.error)
        return
      }
      setIsEnabled(next)
      router.refresh()
    } catch {
      setError('Lỗi kết nối, thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5 text-gray-900">
      {/* Toggle bật/tắt */}
      <div className="flex items-center justify-between rounded-xl border-2 border-gray-200 bg-white p-4">
        <div>
          <p className="font-semibold">{isEnabled ? '🟢 Đang bật' : '⚪ Đang tắt'}</p>
          <p className="text-xs text-gray-500">
            Tắt = khách thanh toán xong KHÔNG thấy vòng quay.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          className={`h-7 w-12 rounded-full transition-colors ${isEnabled ? 'bg-green-500' : 'bg-gray-300'} disabled:opacity-50`}
        >
          <div
            className={`h-6 w-6 translate-y-0.5 rounded-full bg-white shadow transition-transform ${isEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {isEnabled && activeCount === 0 && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-600">
          ⚠️ Cần ít nhất 1 quà đang bật, nếu không khách sẽ không thấy vòng quay.
        </p>
      )}

      {/* Danh sách quà */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label">Danh sách ô quà ({activeCount} đang bật)</label>
          {rows.length === 0 && (
            <button
              type="button"
              onClick={loadDefaults}
              className="text-sm font-medium text-orange-600 hover:underline"
            >
              + Tạo bộ mặc định 6 ô
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2.5"
            >
              <input
                value={r.label}
                onChange={(e) => update(r.key, { label: e.target.value })}
                placeholder="Tên phần thưởng"
                className="input min-w-[160px] flex-1"
              />
              <select
                value={r.type}
                onChange={(e) => update(r.key, { type: e.target.value as 'gift' | 'none' })}
                className="input w-28"
                title="Loại"
              >
                <option value="gift">🎁 Có quà</option>
                <option value="none">— Trượt</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                Tỉ lệ
                <input
                  type="number"
                  min={1}
                  value={r.weight}
                  onChange={(e) => update(r.key, { weight: Number(e.target.value) })}
                  className="input w-16"
                  title="Tỉ trọng (số càng lớn càng dễ trúng)"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={r.is_active}
                  onChange={(e) => update(r.key, { is_active: e.target.checked })}
                />
                Bật
              </label>
              <button
                type="button"
                onClick={() => remove(r.key)}
                className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                title="Xoá ô"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <button
            type="button"
            onClick={addRow}
            className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            + Thêm ô
          </button>
        )}
        <p className="mt-2 text-xs text-gray-400">
          &quot;Tỉ lệ&quot; là tỉ trọng random — ô tỉ lệ 4 dễ trúng gấp 4 lần ô tỉ lệ 1.
          Nên để vài ô &quot;Trượt&quot; tỉ lệ cao để không tặng quà mọi lượt.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          Lưu quà
        </button>
        {saved && <span className="text-sm text-green-600">✓ Đã lưu</span>}
      </div>
    </div>
  )
}
