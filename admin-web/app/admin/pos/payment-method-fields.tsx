'use client'

import type { ReactNode } from 'react'
import { Banknote, Landmark, Split } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { cashChange, cashSuggestions, formatVndInput, parseVnd } from '@/lib/cash-change'
import type { PayMethod } from '@/lib/collect-payment'
import { cn } from '@/lib/utils'

// Phần chọn phương thức + ô tiền của màn Thanh toán POS (mig 112a). KHÔNG giữ state: PaymentView giữ chữ
// đang gõ và dựng p_lines (buildPaymentLines). Tiền khách đưa / tiền thối so với PHẦN TIỀN MẶT, không so
// cả bill. Số phải thu vẫn do server tự tính và kiểm.

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const METHODS: readonly [PayMethod, string, ReactNode][] = [
  ['cash', 'Tiền mặt', <Banknote key="cash" />],
  ['bank', 'Chuyển khoản', <Landmark key="bank" />],
  ['mixed', 'Kết hợp', <Split key="mixed" />],
]

export default function PaymentMethodFields({
  method, total, cashPart, cashText, bankText, givenText, mixedError,
  onMethod, onCashText, onBankText, onGivenText,
}: {
  method: PayMethod
  /** Khách cần trả cả bill. */
  total: number
  /** Phần tiền mặt hiện tại: cả bill khi 'cash', 0 khi 'bank', ô tiền mặt khi 'mixed'. */
  cashPart: number
  cashText: string
  bankText: string
  givenText: string
  /** Lỗi chia hai khoản ('Tổng hai khoản phải đúng …'); null = không hiện. */
  mixedError: string | null
  onMethod: (m: PayMethod) => void
  onCashText: (t: string) => void
  onBankText: (t: string) => void
  onGivenText: (t: string) => void
}) {
  const change = cashChange(cashPart, parseVnd(givenText))
  const bankAmount = method === 'bank' ? total : method === 'mixed' ? parseVnd(bankText) ?? 0 : 0
  const showGiven = method !== 'bank' && cashPart > 0

  return (
    <>
      <section className="mt-3">
        <p className="mb-2 text-[12px] font-bold tracking-wide text-slate-700 uppercase">Phương thức thu tiền thực tế</p>
        <div role="radiogroup" aria-label="Phương thức thu tiền" className="grid grid-cols-3 gap-2">
          {METHODS.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => onMethod(value)}
              className={cn(
                'flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 px-1 text-sm font-bold transition-colors [&>svg]:size-4 [&>svg]:shrink-0',
                method === value ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      </section>

      {method === 'mixed' && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="pos-mixed-cash">
              Tiền mặt (VND)
              <Input
                id="pos-mixed-cash"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={cashText}
                onChange={(e) => onCashText(formatVndInput(e.target.value))}
                className="mt-1 text-lg font-bold tabular"
              />
            </label>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="pos-mixed-bank">
              Chuyển khoản (VND)
              <Input
                id="pos-mixed-bank"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={bankText}
                onChange={(e) => onBankText(formatVndInput(e.target.value))}
                className="mt-1 text-lg font-bold tabular"
              />
            </label>
          </div>
          <p className="text-[12px] text-slate-500">Gõ một ô, ô kia tự điền phần còn lại của {dong(total)}.</p>
          {mixedError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 tabular">
              {mixedError}
            </p>
          )}
        </div>
      )}

      {showGiven && (
        <div className="mt-3 space-y-3">
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="pos-cash-given">
            {method === 'mixed' ? 'Tiền khách đưa cho phần tiền mặt (VND)' : 'Tiền khách đưa (VND)'}
            <Input
              id="pos-cash-given"
              inputMode="numeric"
              autoComplete="off"
              placeholder={cashPart.toLocaleString('vi-VN')}
              value={givenText}
              onChange={(e) => onGivenText(formatVndInput(e.target.value))}
              className="mt-1 text-lg font-bold tabular"
            />
            <span className="mt-1 block text-[12px] font-normal text-slate-500">Gõ số, dấu chấm tự thêm. Để trống nếu khách đưa vừa đủ</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-slate-500">Gợi ý nhanh:</span>
            {cashSuggestions(cashPart).map((v) => (
              <Button key={v} onClick={() => onGivenText(v.toLocaleString('vi-VN'))} className="min-h-9 font-semibold tabular md:min-h-9">
                {v === cashPart ? `Vừa đủ ${dong(v)}` : dong(v)}
              </Button>
            ))}
          </div>
          {change.kind === 'ok' && (
            <p className="flex items-baseline justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
              <span className="text-sm font-semibold">Tiền thối lại cho khách</span>
              <span className="text-xl font-bold tabular">{dong(change.change)}</span>
            </p>
          )}
          {change.kind === 'short' && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 tabular">
              Khách đưa còn thiếu {dong(change.missing)}
            </p>
          )}
        </div>
      )}

      {bankAmount > 0 && (
        <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
          Cho khách quét mã QR của quán, <b className="font-bold">nghe loa báo tiền về đủ {dong(bankAmount)}</b> rồi mới bấm xác nhận.
        </p>
      )}
    </>
  )
}
