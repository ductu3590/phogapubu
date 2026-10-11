'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/utils'
import { formatVndTyping, parseVnd } from '@/lib/money'
import {
  createShipperVoucher,
  setVoucherActive,
  type ShipperVoucherInput,
} from '@/lib/actions/vouchers'

type VoucherRow = {
  id: string
  code: string
  kind: 'spin' | 'shipper'
  label: string
  discount_type: 'fixed' | 'percent'
  discount_value: number
  max_discount: number | null
  zalo_user_id: string | null
  daily_limit: number | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

type UsedOrder = {
  id: string
  voucher_id: string
  discount_amount: number
  total_amount: number
  status: string
  created_at: string
}

function discountText(v: VoucherRow): string {
  return v.discount_type === 'fixed'
    ? `Giảm ${formatVND(v.discount_value)}`
    : `Giảm ${v.discount_value}%${v.max_discount ? ` (tối đa ${formatVND(v.max_discount)})` : ''}`
}

export default function VouchersClient({
  vouchers,
  usedOrders,
}: {
  vouchers: VoucherRow[]
  usedOrders: UsedOrder[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'shipper' | 'spin'>('shipper')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Form tạo mã shipper
  const [label, setLabel] = useState('')
  const [dType, setDType] = useState<'fixed' | 'percent'>('fixed')
  const [dValue, setDValue] = useState<number | ''>(5000)
  const [dMax, setDMax] = useState<number | ''>('')
  const [dLimit, setDLimit] = useState<number | ''>(10)
  // Mã đang mở lịch sử dùng
  const [openHistory, setOpenHistory] = useState<string | null>(null)

  const usesByVoucher = useMemo(() => {
    const m = new Map<string, UsedOrder[]>()
    for (const o of usedOrders) {
      const arr = m.get(o.voucher_id) ?? []
      arr.push(o)
      m.set(o.voucher_id, arr)
    }
    return m
  }, [usedOrders])

  const shipperVouchers = vouchers.filter((v) => v.kind === 'shipper')
  const spinVouchers = vouchers.filter((v) => v.kind === 'spin')

  const handleCreate = async () => {
    setError('')
    setBusy(true)
    try {
      const input: ShipperVoucherInput = {
        label,
        discount_type: dType,
        discount_value: Number(dValue),
        max_discount: dType === 'percent' && dMax !== '' ? Number(dMax) : null,
        daily_limit: dLimit === '' ? null : Number(dLimit),
      }
      const res = await createShipperVoucher(input)
      if (res?.error) {
        setError(res.error)
        return
      }
      setLabel('')
      router.refresh()
    } catch {
      setError('Lỗi kết nối, thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async (v: VoucherRow) => {
    setBusy(true)
    try {
      const res = await setVoucherActive(v.id, !v.is_active)
      if (res?.error) setError(res.error)
      else router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const statusBadge = (v: VoucherRow) => {
    if (!v.is_active)
      return <span className="rounded-full bg-critical-bg px-2 py-0.5 text-xs text-danger">Đã tắt</span>
    if (v.kind === 'shipper' && !v.zalo_user_id)
      return <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning">Chưa kích hoạt</span>
    if (v.expires_at && new Date(v.expires_at) <= new Date())
      return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted">Hết hạn</span>
    return <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs text-success">
      {v.kind === 'shipper' ? 'Đã khoá máy' : 'Còn hiệu lực'}
    </span>
  }

  // Bảng mã: mỗi dòng một mã, nút thao tác ở cuối dòng; bấm "lượt dùng" để mở lịch sử ngay dưới dòng.
  const renderList = (list: VoucherRow[]) => (
    list.length === 0 ? (
      <p className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-muted">Chưa có mã nào</p>
    ) : (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5">Mã</th>
              <th className="px-3 py-2.5">Mức giảm</th>
              <th className="px-3 py-2.5">Trạng thái</th>
              <th className="px-3 py-2.5">Lượt dùng</th>
              <th className="px-3 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((v) => {
              const uses = usesByVoucher.get(v.id) ?? []
              const totalSaved = uses.reduce((sum, o) => sum + o.discount_amount, 0)
              const expanded = openHistory === v.id
              return (
                <Fragment key={v.id}>
                  <tr>
                    <td className="px-3 py-3">
                      <span className="font-mono text-sm font-bold text-foreground">{v.code}</span>
                      <span className="block max-w-48 truncate text-xs text-muted">{v.label}</span>
                    </td>
                    <td className="px-3 py-3 text-foreground/80">
                      {discountText(v)}
                      {v.daily_limit != null && <span className="block text-xs text-muted">tối đa {v.daily_limit} đơn/ngày</span>}
                    </td>
                    <td className="px-3 py-3">{statusBadge(v)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setOpenHistory(expanded ? null : v.id)}
                        aria-expanded={expanded}
                        className="text-left text-xs text-primary hover:underline"
                      >
                        {uses.length} lượt · giảm {formatVND(totalSaved)} {expanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {v.kind === 'shipper' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggle(v)}
                          className={`min-h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${
                            v.is_active
                              ? 'border border-critical-border text-danger hover:bg-danger-bg'
                              : 'border border-border-strong text-foreground hover:bg-button-hover'
                          }`}
                        >
                          {v.is_active ? 'Thu hồi' : 'Bật lại'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-background">
                      <td colSpan={5} className="px-3 py-2">
                        {uses.length === 0 ? (
                          <p className="text-xs text-muted">Chưa có lượt dùng.</p>
                        ) : (
                          <div className="space-y-1">
                            {uses.map((o) => (
                              <p key={o.id} className="text-xs text-muted">
                                {new Date(o.created_at).toLocaleString('vi-VN')} — đơn #
                                {o.id.slice(-6).toUpperCase()} • giảm {formatVND(o.discount_amount)} • trả{' '}
                                {formatVND(o.total_amount)}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  )

  return (
    <div className="flex flex-col gap-4 text-foreground">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-secondary p-1">
        <button
          type="button"
          onClick={() => setTab('shipper')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'shipper' ? 'bg-surface shadow' : 'text-muted'}`}
        >
          Mã shipper ({shipperVouchers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('spin')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'spin' ? 'bg-surface shadow' : 'text-muted'}`}
        >
          Mã vòng quay ({spinVouchers.length})
        </button>
      </div>

      {tab === 'shipper' && (
        <>
          {/* Form tạo mã */}
          <div className="rounded-xl border-2 border-border bg-surface p-4">
            <p className="mb-3 font-semibold">Tạo mã shipper mới</p>
            <p className="mb-3 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-[13px] text-warning">
              Code tự sinh khó đoán — đưa TẬN TAY shipper. Lần đầu shipper nhập mã khi
              thanh toán, mã sẽ khoá vĩnh viễn vào Zalo của shipper đó.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-muted">
                Tên shipper
                <input value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder="VD: Shipper Tuấn Anh" className="input mt-1 w-44" />
              </label>
              <label className="flex flex-col text-xs text-muted">
                Loại giảm
                <select value={dType} onChange={(e) => setDType(e.target.value as 'fixed' | 'percent')}
                  className="input mt-1 w-28">
                  <option value="fixed">Số tiền (đ)</option>
                  <option value="percent">Phần trăm</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-muted">
                {dType === 'fixed' ? 'Giảm (đ)/đơn' : 'Giảm (%)'}
                {/* Ô này là TIỀN khi loại giảm là "đ", là PHẦN TRĂM khi là "%".
                    Chỉ chèn dấu ngăn nghìn ở chế độ tiền. */}
                {dType === 'percent' ? (
                  <input type="number" min={1} value={dValue}
                    onChange={(e) => setDValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input mt-1 w-24" />
                ) : (
                  <input inputMode="numeric" placeholder="VD 5.000"
                    value={dValue === '' ? '' : formatVndTyping(String(dValue))}
                    onChange={(e) => {
                      const text = formatVndTyping(e.target.value)
                      setDValue(text === '' ? '' : (parseVnd(text) ?? ''))
                    }}
                    className="input mt-1 w-24" />
                )}
              </label>
              {dType === 'percent' && (
                <label className="flex flex-col text-xs text-muted">
                  Giảm tối đa (đ)
                  <input inputMode="numeric" placeholder="VD 20.000"
                    value={dMax === '' ? '' : formatVndTyping(String(dMax))}
                    onChange={(e) => {
                      const text = formatVndTyping(e.target.value)
                      setDMax(text === '' ? '' : (parseVnd(text) ?? ''))
                    }}
                    className="input mt-1 w-28" />
                </label>
              )}
              <label className="flex flex-col text-xs text-muted">
                Tối đa đơn/ngày (bỏ trống = không giới hạn)
                <input type="number" min={1} value={dLimit}
                  onChange={(e) => setDLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input mt-1 w-24" />
              </label>
              <button type="button" onClick={() => void handleCreate()} disabled={busy}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
                Tạo mã
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>
          {renderList(shipperVouchers)}
        </>
      )}

      {tab === 'spin' && (
        <>
          <p className="text-xs text-muted">
            Mã khách trúng từ vòng quay — chỉ xem. Cấu hình ô trúng ở khối Vòng quay bên cạnh.
          </p>
          {renderList(spinVouchers)}
        </>
      )}
    </div>
  )
}
