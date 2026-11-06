// Sinh chuỗi VietQR (EMVCo, dịch vụ NAPAS247 QRIBFTTA) có sẵn số tiền + nội dung chuyển khoản.
// Hàm thuần, không import gì của server để dùng được cả ở client lẫn trang in.
import { VIETQR_BANKS } from './vietqr-banks'

export type BankAccountFields = {
  bank_bin: string | null
  bank_account_number: string | null
  bank_account_name: string | null
}
export type BankAccountInput = { bin: string; accountNumber: string; accountName: string }

const BIN_RE = /^\d{6}$/
const ACCOUNT_RE = /^[0-9A-Za-z]{6,19}$/
const MAX_MEMO = 25

/** Bỏ dấu, in hoa, mọi chuỗi ký tự ngoài A-Z0-9 thành một dấu cách (ngân hàng chỉ nhận ASCII). */
export function toBankText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), in hoa 4 ký tự hex. */
export function crc16CcittFalse(text: string): string {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= (text.charCodeAt(i) & 0xff) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// TLV: tag 2 số + độ dài 2 số + giá trị. Giá trị luôn là ASCII nên độ dài ký tự = độ dài byte.
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value
}

export function buildVietQrPayload(input: {
  bin: string
  accountNumber: string
  amount: number
  memo: string
}): string {
  const { bin, accountNumber, amount } = input
  if (!BIN_RE.test(bin)) throw new Error('BIN ngân hàng không hợp lệ')
  if (!ACCOUNT_RE.test(accountNumber)) throw new Error('Số tài khoản không hợp lệ')
  if (!Number.isInteger(amount) || amount <= 0 || String(amount).length > 13) {
    throw new Error('Số tiền không hợp lệ')
  }
  const memo = toBankText(input.memo).slice(0, MAX_MEMO).trim()

  const account = tlv('00', bin) + tlv('01', accountNumber)
  const merchant = tlv('00', 'A000000727') + tlv('01', account) + tlv('02', 'QRIBFTTA')
  const body =
    tlv('00', '01') +
    tlv('01', '12') + // 12 = mã động có số tiền, dùng một lần
    tlv('38', merchant) +
    tlv('53', '704') +
    tlv('54', String(amount)) +
    tlv('58', 'VN') +
    (memo ? tlv('62', tlv('08', memo)) : '') +
    '6304'
  return body + crc16CcittFalse(body)
}

/** Nội dung chuyển khoản: "<bàn rút gọn> <mã bill>", tối đa 25 ký tự, mã bill luôn nguyên vẹn. */
export function billTransferMemo(input: { tableLabel: string; billCode: string }): string {
  const code = toBankText(input.billCode).replace(/ /g, '')
  const room = code ? MAX_MEMO - code.length - 1 : MAX_MEMO
  const table = toBankText(input.tableLabel).slice(0, Math.max(room, 0)).trim()
  return [table, code].filter(Boolean).join(' ')
}

export function hasBankAccount(
  store: BankAccountFields | null | undefined,
): store is { bank_bin: string; bank_account_number: string; bank_account_name: string } {
  if (!store) return false
  return (
    typeof store.bank_bin === 'string' &&
    BIN_RE.test(store.bank_bin) &&
    typeof store.bank_account_number === 'string' &&
    ACCOUNT_RE.test(store.bank_account_number) &&
    typeof store.bank_account_name === 'string' &&
    store.bank_account_name.trim() !== ''
  )
}

export function parseBankAccountInput(
  input: BankAccountInput,
): { ok: true; value: BankAccountFields } | { ok: false; error: string } {
  const bin = input.bin.trim()
  const accountNumber = input.accountNumber.replace(/[\s.\-]/g, '').toUpperCase()
  const accountName = toBankText(input.accountName).slice(0, 50).trim()

  if (!bin && !accountNumber && !input.accountName.trim()) {
    return { ok: true, value: { bank_bin: null, bank_account_number: null, bank_account_name: null } }
  }
  if (!bin || !accountNumber || !accountName) {
    return { ok: false, error: 'Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản' }
  }
  if (!VIETQR_BANKS.some((b) => b.bin === bin)) return { ok: false, error: 'Ngân hàng không hợp lệ' }
  if (!ACCOUNT_RE.test(accountNumber)) {
    return { ok: false, error: 'Số tài khoản gồm 6 đến 19 chữ hoặc số' }
  }
  return {
    ok: true,
    value: { bank_bin: bin, bank_account_number: accountNumber, bank_account_name: accountName },
  }
}
