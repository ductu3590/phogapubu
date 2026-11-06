import { describe, it, expect } from 'vitest'
import {
  buildVietQrPayload,
  billTransferMemo,
  hasBankAccount,
  crc16CcittFalse,
  parseBankAccountInput,
} from './vietqr'
import { VIETQR_BANKS, bankName } from './vietqr-banks'

const A = '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C'
const B = '00020101021238540010A00000072701240006970422011001234567890208QRIBFTTA53037045405100005802VN62170813MEVO QUET THU630452CB'
const C = '00020101021238560010A0000007270126000697041501121080001234560208QRIBFTTA5303704540115802VN6304F903'
const D = '00020101021238610010A000000727013100069704180117123456789012345670208QRIBFTTA53037045405990005802VN62290825BAN VIP SAN VUON S A1B2C363040999'

describe('crc16CcittFalse', () => {
  it('giá trị kiểm tra chuẩn', () => expect(crc16CcittFalse('123456789')).toBe('29B1'))
})

describe('buildVietQrPayload', () => {
  it('khớp mẫu tính độc lập', () => {
    expect(buildVietQrPayload({ bin: '970436', accountNumber: '0011001234567', amount: 155000, memo: 'BAN 12 A1B2C3' })).toBe(A)
    expect(buildVietQrPayload({ bin: '970422', accountNumber: '0123456789', amount: 10000, memo: 'MEVO QUET THU' })).toBe(B)
    expect(buildVietQrPayload({ bin: '970418', accountNumber: '12345678901234567', amount: 99000, memo: 'BAN VIP SAN VUON S A1B2C3' })).toBe(D)
  })
  it('nội dung rỗng thì bỏ hẳn tag 62', () => {
    expect(buildVietQrPayload({ bin: '970415', accountNumber: '108000123456', amount: 1, memo: '' })).toBe(C)
  })
  it('nội dung có dấu vẫn ra độ dài đúng theo byte', () => {
    expect(buildVietQrPayload({ bin: '970436', accountNumber: '0011001234567', amount: 1000, memo: 'Bàn 12' })).toContain('62100806BAN 12')
  })
  it('nội dung quá 25 ký tự bị cắt', () => {
    expect(buildVietQrPayload({ bin: '970436', accountNumber: '0011001234567', amount: 1000, memo: 'X'.repeat(30) })).toContain(`62290825${'X'.repeat(25)}6304`)
  })
  it.each([0, -1, 1.5, Number.NaN, 10 ** 13])('từ chối số tiền %s', (amount) => {
    expect(() => buildVietQrPayload({ bin: '970436', accountNumber: '0011001234567', amount, memo: '' })).toThrow()
  })
  it('từ chối BIN và số tài khoản sai', () => {
    expect(() => buildVietQrPayload({ bin: '97043', accountNumber: '0011001234567', amount: 1000, memo: '' })).toThrow()
    expect(() => buildVietQrPayload({ bin: '970436', accountNumber: '12 34', amount: 1000, memo: '' })).toThrow()
  })
})

describe('billTransferMemo', () => {
  const code = '#A1B2C3'
  it('bỏ dấu, in hoa, bỏ #', () => expect(billTransferMemo({ tableLabel: 'Bàn 12', billCode: code })).toBe('BAN 12 A1B2C3'))
  it('đổi đ/Đ thành D', () => expect(billTransferMemo({ tableLabel: 'Đường đá 3', billCode: code })).toBe('DUONG DA 3 A1B2C3'))
  it('tên dài chỉ cắt phần bàn, giữ nguyên mã', () => {
    const memo = billTransferMemo({ tableLabel: 'Bàn VIP Sân Vườn Số 12 Góc Trái', billCode: code })
    expect(memo).toBe('BAN VIP SAN VUON S A1B2C3')
    expect(memo).toHaveLength(25)
  })
  it('ký tự lạ thành dấu cách, không để dấu cách thừa chỗ cắt', () => {
    expect(billTransferMemo({ tableLabel: 'Bàn 1, Bàn 2 + Bàn 3 · Mâm #2', billCode: code })).toBe('BAN 1 BAN 2 BAN 3 A1B2C3')
  })
  it('bàn không có chữ hợp lệ thì chỉ còn mã', () => expect(billTransferMemo({ tableLabel: '?', billCode: code })).toBe('A1B2C3'))
  it('mã "—" của billCode thì chỉ còn bàn', () => expect(billTransferMemo({ tableLabel: 'Bàn 5', billCode: '—' })).toBe('BAN 5'))
})

describe('hasBankAccount', () => {
  const ok = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }
  it('đủ ba trường', () => expect(hasBankAccount(ok)).toBe(true))
  it.each([
    [null], [undefined],
    [{ ...ok, bank_bin: null }], [{ ...ok, bank_bin: '123' }],
    [{ ...ok, bank_account_number: null }], [{ ...ok, bank_account_number: '12 34' }],
    [{ ...ok, bank_account_name: '   ' }],
  ])('thiếu hoặc sai: %j', (s) => expect(hasBankAccount(s)).toBe(false))
})

describe('parseBankAccountInput', () => {
  it('chuẩn hoá số tài khoản và tên', () => {
    expect(parseBankAccountInput({ bin: '970436', accountNumber: ' 0011 0012-34.567 ', accountName: 'Đỗ Đức Tú' }))
      .toEqual({ ok: true, value: { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' } })
  })
  it('để trống cả ba là xoá tài khoản', () => {
    expect(parseBankAccountInput({ bin: '', accountNumber: ' ', accountName: '' }))
      .toEqual({ ok: true, value: { bank_bin: null, bank_account_number: null, bank_account_name: null } })
  })
  it('thiếu một trường thì báo lỗi', () => {
    expect(parseBankAccountInput({ bin: '970436', accountNumber: '', accountName: 'A' }))
      .toEqual({ ok: false, error: 'Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản' })
  })
  it('tên toàn ký tự lạ thì coi là thiếu ô', () => {
    expect(parseBankAccountInput({ bin: '970436', accountNumber: '0011001234567', accountName: '?!#' }))
      .toEqual({ ok: false, error: 'Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản' })
  })
  it('ngân hàng ngoài danh sách', () => {
    expect(parseBankAccountInput({ bin: '999999', accountNumber: '123456', accountName: 'A' }))
      .toEqual({ ok: false, error: 'Ngân hàng không hợp lệ' })
  })
  it.each(['12345', '1'.repeat(20), 'ABC#123456'])('số tài khoản sai: %s', (accountNumber) => {
    expect(parseBankAccountInput({ bin: '970436', accountNumber, accountName: 'A' }))
      .toEqual({ ok: false, error: 'Số tài khoản gồm 6 đến 19 chữ hoặc số' })
  })
})

describe('VIETQR_BANKS', () => {
  it('BIN 6 số, không trùng', () => {
    const bins = VIETQR_BANKS.map((b) => b.bin)
    expect(bins.every((b) => /^\d{6}$/.test(b))).toBe(true)
    expect(new Set(bins).size).toBe(bins.length)
  })
  it('bankName tra được, không có thì trả BIN', () => {
    expect(bankName('970436')).toBe('Vietcombank')
    expect(bankName('111111')).toBe('111111')
  })
})
