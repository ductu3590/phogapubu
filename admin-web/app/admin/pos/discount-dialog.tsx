'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { discountAmount, validateDiscount, type BillDiscount } from '@/lib/bill-discount'
import { formatVndInput, parseVnd } from '@/lib/cash-change'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

type Mode = 'amount' | 'percent'

/**
 * Hộp "Giảm giá hoá đơn" (VNĐ hoặc %), theo hộp cùng tên của KiotViet.
 * `subtotals` = tiền hàng CHƯA thu của từng phiên đang xem (1 phiên, hoặc N mâm khi gộp bill) — con số xem trước
 * tính bằng cùng hàm với server (lib/bill-discount.ts) nên thu ngân thấy đúng số sẽ bị trừ.
 * Mở hộp bằng cách render có điều kiện (state khởi tạo từ `current` mỗi lần mở, như QtyDialog).
 * Lưu: onSave trả true khi server đã nhận → cha đóng hộp; lỗi server do cha hiện qua banner lỗi chung.
 */
export default function DiscountDialog({ current, subtotals, busy, onSave, onClose }: {
  current: BillDiscount
  subtotals: number[]
  busy: boolean
  onSave: (d: BillDiscount) => Promise<boolean>
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>(current?.type ?? 'amount')
  const [text, setText] = useState(
    current ? (current.type === 'amount' ? current.value.toLocaleString('vi-VN') : String(current.value)) : '',
  )
  const subtotal = subtotals.reduce((n, v) => n + v, 0)

  // Ô rỗng → null (chưa nhập). VNĐ đi qua parseVnd (bỏ dấu chấm ngăn nghìn); % chỉ lấy chữ số.
  const value = mode === 'amount' ? parseVnd(text) : (text.replace(/\D/g, '') ? Number(text.replace(/\D/g, '')) : null)
  const draft: BillDiscount = value && value > 0 ? { type: mode, value } : null
  const error = validateDiscount(subtotal, draft)
  // Gộp bill: % áp riêng từng mâm (làm tròn từng mâm); VNĐ là đúng số đã nhập (server chia về các mâm).
  const preview = !draft || error
    ? 0
    : draft.type === 'amount' ? draft.value : subtotals.reduce((n, sub) => n + discountAmount(sub, draft), 0)
  const canSave = !!draft && !error && !busy

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!busy}
      title="Giảm giá hoá đơn"
      description={subtotals.length > 1 ? `Áp cho cả ${subtotals.length} mâm đang gộp bill.` : undefined}
      footer={
        <>
          {current && (
            <Button variant="danger" disabled={busy} onClick={() => void onSave(null)} className="mr-auto">Bỏ giảm giá</Button>
          )}
          <Button onClick={onClose} disabled={busy}>Bỏ qua</Button>
          <Button variant="primary" isLoading={busy} disabled={!canSave} onClick={() => void onSave(draft)}>Lưu</Button>
        </>
      }
    >
      <p className="flex justify-between text-sm text-slate-600">
        <span>Tiền hàng</span><b className="font-semibold text-slate-900 tabular">{dong(subtotal)}</b>
      </p>

      <div role="radiogroup" aria-label="Kiểu giảm giá" className="mt-3 grid grid-cols-2 gap-2">
        {([['amount', 'VNĐ'], ['percent', '%']] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={busy}
            onClick={() => { if (mode !== m) { setMode(m); setText('') } }}
            className={cn(
              'min-h-11 cursor-pointer rounded-lg border-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              mode === m ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-[13px] font-semibold text-slate-700" htmlFor="pos-discount-value">
        {mode === 'amount' ? 'Số tiền giảm (VNĐ)' : 'Phần trăm giảm (%)'}
        <Input
          id="pos-discount-value"
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          placeholder={mode === 'amount' ? '0' : '10'}
          value={text}
          disabled={busy}
          onChange={(e) => setText(mode === 'amount' ? formatVndInput(e.target.value) : e.target.value.replace(/\D/g, '').slice(0, 3))}
          className="mt-1 text-lg font-bold tabular"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      ) : (
        <p className="mt-3 flex items-baseline justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-700">
          <span className="text-sm font-semibold">Giảm</span>
          <span className="text-lg font-bold tabular">{dong(preview)}</span>
        </p>
      )}
    </Dialog>
  )
}
