'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import VietQrCode from '@/components/vietqr-code'
import { saveBankAccount } from '@/lib/actions/store'
import { VIETQR_BANKS, bankName } from '@/lib/vietqr-banks'
import { buildVietQrPayload, hasBankAccount, type BankAccountFields } from '@/lib/vietqr'

const TEST_AMOUNT = 10000

export default function BankAccountSection({ initial }: { initial: BankAccountFields }) {
  const router = useRouter()
  const [bin, setBin] = useState(initial.bank_bin ?? '')
  const [accountNumber, setAccountNumber] = useState(initial.bank_account_number ?? '')
  const [accountName, setAccountName] = useState(initial.bank_account_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  // onSubmit + preventDefault (không dùng action): React 19 tự reset form sau action, mất chữ đang gõ khi báo lỗi.
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveBankAccount({ bin, accountNumber, accountName })
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  // Mã quét thử dựng từ bản ĐÃ LƯU (initial), không dựng từ ô đang gõ.
  const testPayload = hasBankAccount(initial)
    ? buildVietQrPayload({
        bin: initial.bank_bin,
        accountNumber: initial.bank_account_number,
        amount: TEST_AMOUNT,
        memo: 'MEVO QUET THU',
      })
    : null

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ngân hàng" htmlFor="bank-bin">
          <Select id="bank-bin" value={bin} onChange={(e) => setBin(e.target.value)}>
            <option value="">Chọn ngân hàng</option>
            {VIETQR_BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Số tài khoản" htmlFor="bank-number">
          <Input
            id="bank-number"
            inputMode="numeric"
            autoComplete="off"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </Field>
        <Field
          label="Tên chủ tài khoản"
          htmlFor="bank-name"
          hint="Viết như tên trên app ngân hàng. Hệ thống tự bỏ dấu."
        >
          <Input
            id="bank-name"
            autoComplete="off"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Đang lưu…' : 'Lưu tài khoản'}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : saved ? <p className="text-[13px] text-muted">Đã lưu</p> : null}
        </div>
        <p className="text-[13px] text-muted">Muốn xoá tài khoản: để trống cả ba ô rồi bấm Lưu tài khoản.</p>
      </form>

      {testPayload && hasBankAccount(initial) ? (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Quét thử</p>
          <VietQrCode payload={testPayload} size={176} />
          <p className="mt-2 text-sm text-foreground">
            {bankName(initial.bank_bin)} · {initial.bank_account_number}
          </p>
          <p className="text-sm text-foreground">{initial.bank_account_name}</p>
          <p className="mt-1 text-[13px] text-muted">
            Quét bằng app ngân hàng để kiểm tra: 10.000đ. Không cần chuyển.
          </p>
        </div>
      ) : null}
    </div>
  )
}
