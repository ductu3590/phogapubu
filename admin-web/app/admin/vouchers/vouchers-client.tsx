'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/utils'
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
  const [dValue, setDValue] = useState(5000)
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
      return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">Đã tắt</span>
    if (v.kind === 'shipper' && !v.zalo_user_id)
      return <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-600">Chưa kích hoạt</span>
    if (v.expires_at && new Date(v.expires_at) <= new Date())
      return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Hết hạn</span>
    return <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
      {v.kind === 'shipper' ? 'Đã khoá máy' : 'Còn hiệu lực'}
    </span>
  }

  const renderList = (list: VoucherRow[]) => (
    <div className="flex flex-col gap-2">
      {list.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Chưa có mã nào</p>}
      {list.map((v) => {
        const uses = usesByVoucher.get(v.id) ?? []
        const totalSaved = uses.reduce((s, o) => s + o.discount_amount, 0)
        return (
          <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-gray-900">{v.code}</span>
              {statusBadge(v)}
              <span className="flex-1 text-sm text-gray-600">{v.label}</span>
              <span className="text-sm text-gray-500">{discountText(v)}</span>
              {v.daily_limit != null && (
                <span className="text-xs text-gray-400">tối đa {v.daily_limit} đơn/ngày</span>
              )}
              {v.kind === 'shipper' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggle(v)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                    v.is_active
                      ? 'border border-red-200 text-red-500 hover:bg-red-50'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {v.is_active ? 'Thu hồi' : 'Bật lại'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpenHistory(openHistory === v.id ? null : v.id)}
              className="mt-1 text-xs text-orange-600 hover:underline"
            >
              {uses.length} lượt dùng • đã giảm {formatVND(totalSaved)} {openHistory === v.id ? '▲' : '▼'}
            </button>
            {openHistory === v.id && uses.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                {uses.map((o) => (
                  <p key={o.id} className="text-xs text-gray-500">
                    {new Date(o.created_at).toLocaleString('vi-VN')} — đơn #
                    {o.id.slice(-6).toUpperCase()} • giảm {formatVND(o.discount_amount)} • trả{' '}
                    {formatVND(o.total_amount)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-5 text-gray-900">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('shipper')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'shipper' ? 'bg-white shadow' : 'text-gray-500'}`}
        >
          🛵 Mã shipper ({shipperVouchers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('spin')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'spin' ? 'bg-white shadow' : 'text-gray-500'}`}
        >
          🎁 Mã vòng quay ({spinVouchers.length})
        </button>
      </div>

      {tab === 'shipper' && (
        <>
          {/* Form tạo mã */}
          <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
            <p className="mb-3 font-semibold">Tạo mã shipper mới</p>
            <p className="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
              Code tự sinh khó đoán — đưa TẬN TAY shipper. Lần đầu shipper nhập mã khi
              thanh toán, mã sẽ khoá vĩnh viễn vào Zalo của shipper đó.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-gray-500">
                Tên shipper
                <input value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder="VD: Shipper Tuấn Anh" className="input mt-1 w-44" />
              </label>
              <label className="flex flex-col text-xs text-gray-500">
                Loại giảm
                <select value={dType} onChange={(e) => setDType(e.target.value as 'fixed' | 'percent')}
                  className="input mt-1 w-28">
                  <option value="fixed">Số tiền (đ)</option>
                  <option value="percent">Phần trăm</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-gray-500">
                {dType === 'fixed' ? 'Giảm (đ)/đơn' : 'Giảm (%)'}
                <input type="number" min={1} value={dValue}
                  onChange={(e) => setDValue(Number(e.target.value))} className="input mt-1 w-24" />
              </label>
              {dType === 'percent' && (
                <label className="flex flex-col text-xs text-gray-500">
                  Giảm tối đa (đ)
                  <input type="number" min={1} value={dMax}
                    onChange={(e) => setDMax(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input mt-1 w-28" />
                </label>
              )}
              <label className="flex flex-col text-xs text-gray-500">
                Tối đa đơn/ngày (bỏ trống = không giới hạn)
                <input type="number" min={1} value={dLimit}
                  onChange={(e) => setDLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input mt-1 w-24" />
              </label>
              <button type="button" onClick={() => void handleCreate()} disabled={busy}
                className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                Tạo mã
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
          {renderList(shipperVouchers)}
        </>
      )}

      {tab === 'spin' && (
        <>
          <p className="text-xs text-gray-400">
            Mã khách trúng từ vòng quay — chỉ xem. Cấu hình ô trúng ở trang Vòng quay.
          </p>
          {renderList(spinVouchers)}
        </>
      )}
    </div>
  )
}
