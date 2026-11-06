import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/store', () => ({ saveBankAccount: vi.fn() }))

import BankAccountSection from './bank-account-section'

const empty = { bank_bin: null, bank_account_number: null, bank_account_name: null }
const full = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }

describe('BankAccountSection', () => {
  it('chưa khai báo: có danh sách ngân hàng, không có QR', () => {
    const html = renderToStaticMarkup(<BankAccountSection initial={empty} />)
    expect(html).toContain('Vietcombank')
    expect(html).not.toContain('Mã VietQR')
    expect(html).not.toContain('Quét thử')
  })
  it('đã khai báo: điền sẵn và có mã quét thử 10.000đ', () => {
    const html = renderToStaticMarkup(<BankAccountSection initial={full} />)
    expect(html).toContain('value="0011001234567"')
    expect(html).toContain('value="DO DUC TU"')
    expect(html).toContain('Quét thử')
    expect(html).toContain('10.000đ')
    expect(html).toContain('Mã VietQR')
  })
})
