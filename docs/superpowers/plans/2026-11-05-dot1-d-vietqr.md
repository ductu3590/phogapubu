# Đợt 1 mục D: VietQR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho khách quét mã VietQR có sẵn số tiền và nội dung, ở màn Thanh toán POS và trên tờ tạm tính, để không phải gõ tay. Thu ngân vẫn tự bấm xác nhận như hôm nay.

**Architecture:** Hàm thuần `lib/vietqr.ts` sinh chuỗi EMVCo. Component `VietQrCode` vẽ SVG đồng bộ bằng `QRCode.create`, nên mã có ngay ở lần render đầu. Hàm `lib/bill-qr.ts` quyết định số tiền, nội dung, và có hiện QR hay không; POS và tờ in cùng đi qua hàm này nên hai nơi ra cùng một mã. Không có migration: ba cột `stores.bank_*` đã có từ mig 039.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (`renderToStaticMarkup`, môi trường node), `qrcode` 1.5.4.

**Spec:** `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §6 (và §7, §8, §9)

**Hai phần:**
- **Part 1 (Đợt 1, song song):** Task 1–3. Tạo từ `main`, không phụ thuộc mục nào.
- **Part 2 (Đợt 3, song song):** Task 4–6. Chỉ bắt đầu sau khi mục A đã merge và anh Tú PASS đợt 2.

Mục D không có migration, nên không có bước "Controller áp migration" và không có test SQL.

## Global Constraints

- Tên bắt buộc, plan khác dựa vào: `admin-web/lib/vietqr.ts` xuất `buildVietQrPayload(input: {bin:string; accountNumber:string; amount:number; memo:string}): string`, `billTransferMemo(input: {tableLabel:string; billCode:string}): string`, `hasBankAccount(store): boolean`. `admin-web/components/vietqr-code.tsx` xuất `<VietQrCode payload size />`.
- Chuỗi EMVCo: GUID `A000000727`, dịch vụ `QRIBFTTA`, `53=704`, `58=VN`, nội dung ở `62/08`, `63` là CRC16-CCITT-FALSE, in hoa 4 ký tự.
- Nội dung chuyển khoản: không dấu, in hoa, tối đa 25 ký tự, gồm tên bàn rút gọn và mã bill 6 ký tự đang hiện ở A04.
- Chưa khai báo tài khoản thì không hiện QR ở đâu cả.
- Bill đã thu không in QR.
- QR trên giấy in rộng tối thiểu 35mm.
- Chỉ chủ quán sửa tài khoản. Server action có lỗi người dùng trả `{ok, error}`, không ném. Action dùng `createAdminClient` phải tự kiểm quyền và lọc `store_id`.
- Không đụng Zalo Checkout, không đụng Mini App, không thêm QR vào `/staff/tables` trên màn hình.
- Text UI tiếng Việt, comment logic phức tạp tiếng Việt. Không `window.confirm`.
- Form cần giữ chữ đang gõ khi báo lỗi dùng `onSubmit` + `preventDefault`, không dùng `action` (React 19 tự reset form).
- Worktree mới chưa có `node_modules`: chạy `npm ci` trong `admin-web/` trước test đầu tiên.
- Số dòng trong plan đo tại commit `92935bc`. Part 2 chạy sau mục A nên `bill-panel.tsx` và `print-bill.tsx` sẽ lệch: tìm theo tên hàm, đừng theo số dòng.

## Review Focus

1. Tên bàn có `đ`/`Đ`, dấu, ký tự lạ, hoặc rất dài: nội dung vẫn đúng ký tự cho phép, không quá 25, và mã bill không bị cắt mất. (Task 1)
2. Bill có đơn đã thu trước: `get_sessions_bill.grand_total` cộng cả đơn đã thu, nên QR trên giấy phải lấy số POS thu, không lấy `grand_total`. (Task 4)
3. In lại bill đã thu ở A04, hoặc gộp bill mà một mâm đã thu: không có QR, kể cả khi quán có tài khoản. (Task 4, Task 6)
4. Số tiền 0đ (tặng hết, giảm 100%, ô Chuyển khoản trống hoặc vượt số cần thu): không có QR và không văng lỗi, vì EMVCo không nhận số tiền 0. (Task 4)
5. Trang in tự gọi `window.print()` ngay sau lần render đầu: nếu QR dựng bất đồng bộ thì tờ in mất mã mà không ai báo. QR phải có sẵn trong HTML lần đầu, và rộng đủ 35mm cả với mã nhỏ nhất. (Task 2, Task 6)

---

# Part 1 (Đợt 1): nền VietQR

## File Structure (Part 1)

| File | Việc |
|---|---|
| `admin-web/lib/vietqr.ts` (mới) | Chuỗi EMVCo, nội dung, kiểm tài khoản. Hàm thuần, không import server |
| `admin-web/lib/vietqr-banks.ts` (mới) | Danh sách ngân hàng |
| `admin-web/components/vietqr-code.tsx` (mới) | Vẽ QR bằng SVG |
| `admin-web/lib/actions/store.ts` | Thêm `saveBankAccount` |
| `admin-web/app/admin/settings/bank-account-section.tsx` (mới) | Form Tài khoản nhận tiền + mã quét thử |
| `admin-web/app/admin/settings/page.tsx` | Đọc 3 cột, gắn section |
| `admin-web/types/database.types.ts` | `StoreRow` thêm 3 cột |
| `docs/testing/dot1/vietqr-nen.md` (mới) | Checklist test tay |

### Task 1: Chuỗi EMVCo, nội dung, kiểm tài khoản

**Files:**
- Create: `admin-web/lib/vietqr.ts`, `admin-web/lib/vietqr-banks.ts`
- Test: `admin-web/lib/vietqr.test.ts`

**Interfaces:**
- Produces:
  - `type BankAccountFields = { bank_bin: string|null; bank_account_number: string|null; bank_account_name: string|null }`
  - `type BankAccountInput = { bin: string; accountNumber: string; accountName: string }`
  - `buildVietQrPayload`, `billTransferMemo`, `hasBankAccount(store: BankAccountFields|null|undefined): store is {bank_bin:string; bank_account_number:string; bank_account_name:string}`
  - `crc16CcittFalse(text: string): string`
  - `toBankText(text: string): string`
  - `parseBankAccountInput(input: BankAccountInput): {ok:true; value: BankAccountFields} | {ok:false; error:string}`
  - `VIETQR_BANKS: {bin:string; name:string}[]`, `bankName(bin: string): string` (trong `vietqr-banks.ts`)

- [ ] **Step 1: Viết test hỏng**

Bốn mẫu dưới đây tính độc lập bằng Python, CRC lấy từ `binascii.crc_hqx(data, 0xFFFF)` của thư viện chuẩn (kiểm tra chuẩn: `123456789` ra `29B1`). Không sinh lại mẫu từ code của mình.

```ts
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
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd admin-web && npx vitest run lib/vietqr.test.ts`
Expected: FAIL, không tìm thấy module `./vietqr`.

- [ ] **Step 3: Viết `lib/vietqr-banks.ts`**

Lấy từ `api.vietqr.io/v2/banks` ngày 2026-11-05, chỉ giữ ngân hàng `transferSupported=1`, bỏ ví. Giữ thứ tự này, các ngân hàng lớn lên đầu:

```
970436 Vietcombank · 970415 VietinBank · 970418 BIDV · 970405 Agribank · 970422 MBBank
970407 Techcombank · 970416 ACB · 970432 VPBank · 970423 TPBank · 970403 Sacombank
970437 HDBank · 970441 VIB · 970443 SHB · 970431 Eximbank · 970426 MSB
970448 OCB · 970440 SeABank · 970449 LPBank · 970428 NamABank · 970412 PVcomBank
970409 BacABank · 970427 VietABank · 970425 ABBANK · 970438 BaoVietBank · 970452 KienLongBank
970400 SaigonBank · 970430 PGBank · 970419 NCB · 970454 VietCapitalBank · 970433 VietBank
970414 MBV · 970446 COOPBANK · 546034 CAKE · 546035 Ubank · 963388 Timo
970424 ShinhanBank · 970457 Woori · 422589 CIMB · 668888 KBank · 970434 IndovinaBank
```

- [ ] **Step 4: Viết `lib/vietqr.ts`**

Thứ tự tag: `00`=`01`, `01`=`12` (mã có số tiền, dùng một lần), `38`, `53`, `54`, `58`, `62` (bỏ nếu nội dung rỗng), `63`. Trong `38`: `00`=GUID, `01`={`00`=BIN, `01`=số tài khoản}, `02`=`QRIBFTTA`. CRC tính trên toàn chuỗi kể cả `6304`.

Quy tắc các hàm:
- `toBankText`: NFD, bỏ dấu, `đ`/`Đ` thành `D`, in hoa, mọi chuỗi ký tự ngoài `A-Z0-9` thành một dấu cách, trim.
- `buildVietQrPayload`: tự chạy memo qua `toBankText`, cắt 25 rồi trim, để TLV luôn là ASCII. Ném `Error` nếu BIN không phải 6 số, số tài khoản không khớp `^[0-9A-Za-z]{6,19}$`, số tiền không phải số nguyên dương hoặc quá 13 chữ số.
- `billTransferMemo`: mã = `toBankText(billCode)` bỏ dấu cách. Phần bàn chỉ được dài `25 - mã.length - 1`, cắt rồi trim. Ghép bằng một dấu cách, bỏ phần rỗng.
- `hasBankAccount`: cùng hai regex trên, tên sau trim không rỗng.
- `parseBankAccountInput`: số tài khoản bỏ dấu cách, chấm, gạch ngang rồi in hoa. Tên qua `toBankText`, cắt còn 50 ký tự. Thứ tự kiểm: trống cả ba, thiếu một ô, ngân hàng, số tài khoản. `lib/vietqr.ts` không import gì của server.

- [ ] **Step 5: Chạy test, phải qua**

Run: `cd admin-web && npx vitest run lib/vietqr.test.ts`
Expected: PASS hết.

- [ ] **Step 6: Commit**

```bash
git add admin-web/lib/vietqr.ts admin-web/lib/vietqr-banks.ts admin-web/lib/vietqr.test.ts
git commit -m "feat: sinh chuoi VietQR EMVCo va noi dung chuyen khoan"
```

### Task 2: Component `VietQrCode`

**Files:**
- Create: `admin-web/components/vietqr-code.tsx`
- Test: `admin-web/components/vietqr-code.test.tsx`

**Interfaces:**
- Produces: `export default function VietQrCode({ payload, size }: { payload: string; size: number | string })`, `export const VIETQR_QUIET_ZONE = 4`. `size` là số px, hoặc chuỗi CSS như `"44mm"`.

Vì sao SVG đồng bộ, không dùng `QRCode.toDataURL` trong `useEffect`: `useAutoPrint` chụp `document.images` ngay lúc mount rồi gọi in sau 350ms, ảnh dựng bất đồng bộ không nằm trong danh sách chờ nên có thể in thiếu mã. `QRCode.create` chạy đồng bộ ở cả server lẫn trình duyệt, và SVG in nét trên máy nhiệt.

- [ ] **Step 1: Viết test hỏng**

```tsx
const PAYLOAD = '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C'
const qr = QRCode.create(PAYLOAD, { errorCorrectionLevel: 'M' })

it('render đầu tiên đã có SVG, không dùng thẻ img', () => {
  const html = renderToStaticMarkup(<VietQrCode payload={PAYLOAD} size="44mm" />)
  expect(html).toContain('<svg')
  expect(html).not.toContain('<img')
  expect(html).toContain('width="44mm"')
  expect(html).toContain(`viewBox="0 0 ${qr.modules.size + 2 * VIETQR_QUIET_ZONE} ${qr.modules.size + 2 * VIETQR_QUIET_ZONE}"`)
  expect(html).toContain('shape-rendering="crispEdges"')
  expect(html).toContain('role="img"')
})

it('nhận size là số px', () => {
  expect(renderToStaticMarkup(<VietQrCode payload={PAYLOAD} size={176} />)).toContain('width="176"')
})

it('vẽ đủ mọi module đen', () => {
  const html = renderToStaticMarkup(<VietQrCode payload={PAYLOAD} size={176} />)
  const drawn = [...html.matchAll(/M\d+ \d+h(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0)
  expect(drawn).toBe(qr.modules.data.reduce((n, v) => n + (v ? 1 : 0), 0))
})
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd admin-web && npx vitest run components/vietqr-code.test.tsx`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết component**

`import QRCode from 'qrcode'` như `lib/qr.ts`, `errorCorrectionLevel: 'M'`. Một `<rect>` nền trắng phủ hết, một `<path fill="#000">`. Mỗi đoạn module đen liền nhau trên một hàng ghi thành `M{x} {y}h{n}v1h-{n}z`, cộng thêm lề `VIETQR_QUIET_ZONE`. Có `aria-label="Mã VietQR"`.

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd admin-web && npx vitest run components/vietqr-code.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/components/vietqr-code.tsx admin-web/components/vietqr-code.test.tsx
git commit -m "feat: component VietQrCode ve SVG dong bo"
```

### Task 3: Mục Tài khoản nhận tiền trong Cài đặt

**Files:**
- Modify: `admin-web/lib/actions/store.ts` (thêm sau `saveBellStyle`, cuối file)
- Modify: `admin-web/app/admin/settings/page.tsx:21` (select), `:75-77` (section mới giữa khối Âm thanh/In ấn và Quy trình vận hành)
- Modify: `admin-web/types/database.types.ts:7` (`StoreRow`)
- Create: `admin-web/app/admin/settings/bank-account-section.tsx`
- Create: `docs/testing/dot1/vietqr-nen.md`
- Test: `admin-web/lib/actions/store.test.ts`, `admin-web/app/admin/settings/bank-account-section.test.tsx`

**Interfaces:**
- Consumes: `parseBankAccountInput`, `hasBankAccount`, `buildVietQrPayload`, `VIETQR_BANKS`, `bankName`, `VietQrCode`.
- Produces: `saveBankAccount(input: BankAccountInput): Promise<{ok:true}|{ok:false; error:string}>`. `export default function BankAccountSection({ initial }: { initial: BankAccountFields })`.

Mã "Quét thử" không có trong spec. Em thêm vì Part 1 phải test được một mình: bài quét bằng app ngân hàng thật là rủi ro lớn nhất của mục D, và làm ở đây thì sai sớm, sửa sớm.

- [ ] **Step 1: Viết test hỏng cho action, thêm vào `store.test.ts`**

Import thêm `saveBankAccount` ở dòng `await import('./store')`.

```ts
describe('saveBankAccount', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.patch.value = null })

  it('lưu bản đã chuẩn hoá', async () => {
    await expect(saveBankAccount({ bin: '970436', accountNumber: '0011 0012-34567', accountName: 'Đỗ Đức Tú' })).resolves.toEqual({ ok: true })
    expect(mocks.patch.value).toEqual({ bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin', 'layout')
  })
  it('trống cả ba thì ghi null', async () => {
    await saveBankAccount({ bin: '', accountNumber: '', accountName: '' })
    expect(mocks.patch.value).toEqual({ bank_bin: null, bank_account_number: null, bank_account_name: null })
  })
  it('dữ liệu sai thì trả lỗi, không ghi', async () => {
    const res = await saveBankAccount({ bin: '970436', accountNumber: '', accountName: 'A' })
    expect(res.ok).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('không phải chủ quán thì trả lỗi, không ném, không ghi', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(saveBankAccount({ bin: '970436', accountNumber: '0011001234567', accountName: 'A' }))
      .resolves.toEqual({ ok: false, error: 'Chỉ chủ quán mới thao tác được ở đây' })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Viết test hỏng cho section**

`vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))` và `vi.mock('@/lib/actions/store', () => ({ saveBankAccount: vi.fn() }))`.

```tsx
const empty = { bank_bin: null, bank_account_number: null, bank_account_name: null }
const full = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }

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
```

- [ ] **Step 3: Chạy test, phải hỏng**

Run: `cd admin-web && npx vitest run lib/actions/store.test.ts app/admin/settings/bank-account-section.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Viết `saveBankAccount`**

`try { storeId = await getStoreId() } catch (e) { return {ok:false, error: e.message} }`, rồi `parseBankAccountInput`, rồi `createAdminClient().from('stores').update(value).eq('id', storeId)`, rồi `revalidatePath('/admin', 'layout')` như `saveBellStyle`.

- [ ] **Step 5: Viết `BankAccountSection` và gắn vào trang**

- Ba ô có state, dùng `Field`, `Select`, `Input` từ `components/ui/field` và `Button`. `Select` có một lựa chọn trống "Chọn ngân hàng". Nút "Lưu tài khoản". `<form onSubmit>` có `preventDefault`, `useTransition`. Lưu xong gọi `router.refresh()`, hiện "Đã lưu".
- Gợi ý dưới ô tên: "Viết như tên trên app ngân hàng. Hệ thống tự bỏ dấu."
- Xoá tài khoản bằng cách để trống cả ba rồi lưu. Ghi rõ một dòng gợi ý dưới form.
- Khi `hasBankAccount(initial)`: hiện khối "Quét thử", `VietQrCode size={176}` với `amount: 10000`, `memo: 'MEVO QUET THU'`, kèm `bankName`, số tài khoản, tên, và dòng "Quét bằng app ngân hàng để kiểm tra: 10.000đ. Không cần chuyển." Mã này dựng từ `initial` (bản đã lưu), không dựng từ ô đang gõ.
- `page.tsx`: thêm `bank_bin, bank_account_number, bank_account_name` vào select. Section mới tiêu đề "Tài khoản nhận tiền", mô tả "Khai báo để hiện mã VietQR ở màn Thanh toán và trên tờ tạm tính." Truyền `key={`${bin}:${number}`}` để sau `router.refresh()` form nhận dữ liệu mới.
- `StoreRow` thêm 3 trường `string | null`.

- [ ] **Step 6: Chạy test và type-check**

Run: `cd admin-web && npx vitest run lib/actions/store.test.ts app/admin/settings/bank-account-section.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc không có lỗi mới.

- [ ] **Step 7: Viết checklist `docs/testing/dot1/vietqr-nen.md`**

Test trên Bảo Lương bằng tài khoản chủ quán. Mỗi bài ghi rõ bước và kết quả đúng:

1. Cài đặt có mục Tài khoản nhận tiền; chưa khai báo thì không có mã.
2. Nhập số tài khoản có dấu cách, tên có dấu, Lưu: số và tên được chuẩn hoá, hiện mã Quét thử.
3. Thiếu một ô rồi Lưu: báo lỗi tiếng Việt, chữ đang gõ còn nguyên.
4. Quét mã thử bằng **3 app ngân hàng khác nhau**: app điền sẵn đúng ngân hàng, số tài khoản, 10.000đ, nội dung `MEVO QUET THU`. Chỉ xem, không chuyển.
5. Tài khoản thu ngân: không vào được Cài đặt.
6. Để trống cả ba ô rồi Lưu: mã biến mất. Làm bước này cuối cùng nếu quán chưa muốn bật.

- [ ] **Step 8: Commit**

```bash
git add admin-web/lib/actions/store.ts admin-web/lib/actions/store.test.ts admin-web/app/admin/settings/bank-account-section.tsx admin-web/app/admin/settings/bank-account-section.test.tsx admin-web/app/admin/settings/page.tsx admin-web/types/database.types.ts docs/testing/dot1/vietqr-nen.md
git commit -m "feat: muc Tai khoan nhan tien trong Cai dat, co ma quet thu"
```

- [ ] **Step 9: Dừng, chờ anh Tú**

Báo: "Xong rồi anh, test theo `docs/testing/dot1/vietqr-nen.md` nhé". Không làm tiếp cho tới khi anh báo PASS.

---

# Part 2 (Đợt 3): QR ở màn Thanh toán và tờ in

Điều kiện bắt đầu: mục A đã merge vào `main`, Part 1 đã PASS. Tạo worktree mới từ `main`.

## File Structure (Part 2)

| File | Việc |
|---|---|
| `admin-web/lib/bill-qr.ts` (mới) | Số tiền, nội dung, có hiện QR hay không. Hàm thuần |
| `admin-web/lib/print/load-bill-qr.ts` (mới) | Đọc dữ liệu cho trang in, chỉ chạy ở server |
| `admin-web/app/admin/pos/payment-vietqr.tsx` (mới) | Khối QR trong màn Thanh toán |
| `admin-web/app/admin/pos/page.tsx`, `pos-client.tsx`, `bill-panel.tsx` | Truyền tài khoản xuống `PaymentView` |
| `admin-web/app/print/bill/page.tsx`, `print-bill.tsx` | In QR |
| `docs/testing/dot1/vietqr-ghep.md` (mới) | Checklist test tay |

### Task 4: `lib/bill-qr.ts`

**Files:**
- Create: `admin-web/lib/bill-qr.ts`
- Test: `admin-web/lib/bill-qr.test.ts`

**Interfaces:**
- Consumes: `buildVietQrPayload`, `billTransferMemo`, `hasBankAccount`, `bankName`, `billCode` (`lib/bills-report.ts`), `billTotals` (`lib/bill-discount.ts`).
- Produces:
  - `type BillQr = { payload:string; amount:number; memo:string; bankName:string; accountNumber:string; accountName:string }`
  - `buildBillQr(input: {bank: BankAccountFields|null|undefined; amount:number; sessions: {sessionId:string; tableLabel:string}[]}): BillQr|null`
  - `paymentQrAmount(input: {method:'cash'|'bank'|'mixed'; total:number; bankPart:number}): number`
  - `pickBillQr(input: {sessionIds:string[]; openSessions: OpenBillSession[]; bank: BankAccountFields|null|undefined}): BillQr|null`, với `OpenBillSession = DiscountedSession & {session_id:string; table_number:string; total:number}`

`pickBillQr` trả lời câu hỏi "bill này còn phải thu bao nhiêu" bằng đúng dữ liệu và đúng hàm của POS (`list_open_table_sessions` + `billTotals`). Không dùng `get_sessions_bill.grand_total` vì số đó cộng cả đơn đã thu.

- [ ] **Step 1: Viết test hỏng**

```ts
const bank = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }
const ID = '11111111-2222-3333-4444-555555a1b2c3'
const open = (over = {}) => ({ session_id: ID, table_number: 'Bàn 12', total: 155000, unpaid_total: 155000, ...over })

describe('buildBillQr', () => {
  it('ra đúng mẫu độc lập ở Task 1', () => {
    expect(buildBillQr({ bank, amount: 155000, sessions: [{ sessionId: ID, tableLabel: 'Bàn 12' }] })).toEqual({
      payload: '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C',
      amount: 155000, memo: 'BAN 12 A1B2C3', bankName: 'Vietcombank', accountNumber: '0011001234567', accountName: 'DO DUC TU',
    })
  })
  it('gộp bill: thứ tự đầu vào không đổi nội dung, mã lấy theo phiên nhỏ nhất như A04', () => {
    const a = { sessionId: '00000000-0000-0000-0000-000000a1b2c3', tableLabel: 'Bàn 1' }
    const b = { sessionId: 'ffffffff-0000-0000-0000-000000000002', tableLabel: 'Bàn 2' }
    expect(buildBillQr({ bank, amount: 1000, sessions: [b, a] })?.memo).toBe('BAN 1 BAN 2 A1B2C3')
    expect(buildBillQr({ bank, amount: 1000, sessions: [a, b] })?.memo).toBe('BAN 1 BAN 2 A1B2C3')
  })
  it.each([0, -1000, 1.5])('số tiền %s thì không có QR', (amount) => {
    expect(buildBillQr({ bank, amount, sessions: [{ sessionId: ID, tableLabel: 'Bàn 12' }] })).toBeNull()
  })
  it('chưa có tài khoản thì không có QR', () => {
    expect(buildBillQr({ bank: null, amount: 1000, sessions: [{ sessionId: ID, tableLabel: 'Bàn 12' }] })).toBeNull()
  })
  it('không có phiên thì không có QR', () => expect(buildBillQr({ bank, amount: 1000, sessions: [] })).toBeNull())
})

describe('paymentQrAmount', () => {
  it('tiền mặt: 0', () => expect(paymentQrAmount({ method: 'cash', total: 100000, bankPart: 0 })).toBe(0))
  it('chuyển khoản: số cần thu', () => expect(paymentQrAmount({ method: 'bank', total: 100000, bankPart: 0 })).toBe(100000))
  it('kết hợp: phần chuyển khoản', () => expect(paymentQrAmount({ method: 'mixed', total: 100000, bankPart: 40000 })).toBe(40000))
  it.each([0, 100001])('kết hợp, phần CK %s: 0', (bankPart) => {
    expect(paymentQrAmount({ method: 'mixed', total: 100000, bankPart })).toBe(0)
  })
})

describe('pickBillQr', () => {
  it('bill có đơn đã thu trước: số trong QR là phần chưa thu sau giảm giá', () => {
    const s = open({ total: 200000, unpaid_total: 155000, bill_discount_type: 'percent', bill_discount_value: 10 })
    expect(pickBillQr({ sessionIds: [ID], openSessions: [s], bank })?.amount).toBe(139500)
  })
  it('bill đã thu: không còn trong danh sách mở thì không có QR', () => {
    expect(pickBillQr({ sessionIds: [ID], openSessions: [], bank })).toBeNull()
  })
  it('gộp bill có một mâm đã thu: không có QR', () => {
    expect(pickBillQr({ sessionIds: [ID, 'khac'], openSessions: [open()], bank })).toBeNull()
  })
  it('phiên hết hạn còn nợ vẫn có QR, không giảm giá', () => {
    expect(pickBillQr({ sessionIds: [ID], openSessions: [open({ bill_discount_type: null, bill_discount_value: null })], bank })?.amount).toBe(155000)
  })
  it('giảm giá lỗi: không có QR', () => {
    const s = open({ unpaid_total: 50000, total: 50000, bill_discount_type: 'amount', bill_discount_value: 80000 })
    expect(pickBillQr({ sessionIds: [ID], openSessions: [s], bank })).toBeNull()
  })
  it('giảm 100%: không có QR', () => {
    expect(pickBillQr({ sessionIds: [ID], openSessions: [open({ bill_discount_type: 'percent', bill_discount_value: 100 })], bank })).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd admin-web && npx vitest run lib/bill-qr.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết `lib/bill-qr.ts`**

- `buildBillQr`: sắp phiên theo `sessionId`, ghép `tableLabel` bằng `, `, mã bill là `billCode(ids, [])`.
- `pickBillQr`: lấy các phiên có id trong `sessionIds`. Thiếu phiên nào so với `new Set(sessionIds).size` thì trả `null`. `billTotals()` có `error` thì `null`. Còn lại gọi `buildBillQr` với `payable`, `tableLabel` là `table_number`.

File này được import từ client (`bill-panel.tsx`): chỉ dùng `import type` với `OpenTableSession`, không kéo `lib/actions/*` vào bundle.

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd admin-web && npx vitest run lib/bill-qr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/bill-qr.ts admin-web/lib/bill-qr.test.ts
git commit -m "feat: chon so tien va noi dung VietQR cho bill"
```

### Task 5: QR ở màn Thanh toán POS

**Files:**
- Create: `admin-web/app/admin/pos/payment-vietqr.tsx`
- Modify: `admin-web/app/admin/pos/page.tsx:32` (select), `:103` (prop)
- Modify: `admin-web/app/admin/pos/pos-client.tsx:130-175` (prop), `:1315` (`PosBillPanel`)
- Modify: `admin-web/app/admin/pos/bill-panel.tsx`: `PosBillPanelProps` (`:49`), chỗ render `PaymentView` (`:208`), `PaymentView` (`:753`), khối chuyển khoản (`:919-923`)
- Test: `admin-web/app/admin/pos/payment-vietqr.test.tsx`

**Interfaces:**
- Consumes: `buildBillQr`, `paymentQrAmount`, `BillQr`, `VietQrCode`. Từ mục A: `PaymentView` có state chọn phương thức (`'cash'|'bank'|'mixed'`) và số tiền ô Chuyển khoản đã parse thành số. Tên state do mục A đặt, đọc code thật sau khi A merge. A không có hai thứ này thì dừng và báo.
- Produces: `export default function PaymentVietQr({ qr }: { qr: BillQr | null })`. Prop mới `bankAccount?: BankAccountFields | null` trên `PosClient`, `PosBillPanel`, `PaymentView`. Để optional vì các test đang render `PaymentView` không truyền prop này.

- [ ] **Step 1: Viết test hỏng**

Dùng lại hàm `session()` và `view()` theo kiểu `bill-discount-ui.test.tsx`. Prop phương thức khởi tạo không có sẵn vì đây là state trong component, nên test khối `PaymentVietQr` trực tiếp và test luật chọn số tiền qua `paymentQrAmount` (đã có ở Task 4).

```tsx
const qr = { payload: '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C',
  amount: 155000, memo: 'BAN 12 A1B2C3', bankName: 'Vietcombank', accountNumber: '0011001234567', accountName: 'DO DUC TU' }

it('không có QR thì không render gì', () => {
  expect(renderToStaticMarkup(<PaymentVietQr qr={null} />)).toBe('')
})
it('hiện mã, số tiền, tài khoản, nội dung', () => {
  const html = renderToStaticMarkup(<PaymentVietQr qr={qr} />)
  expect(html).toContain('<svg')
  expect(html).toContain('155.000')
  expect(html).toContain('Vietcombank')
  expect(html).toContain('0011001234567')
  expect(html).toContain('DO DUC TU')
  expect(html).toContain('BAN 12 A1B2C3')
})
it('PaymentView mặc định là tiền mặt: có tài khoản cũng không hiện QR', () => {
  const html = view({ bankAccount: { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' } })
  expect(html).not.toContain('Mã VietQR')
})
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd admin-web && npx vitest run app/admin/pos/payment-vietqr.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Viết `PaymentVietQr` và nối prop**

- Khối nền trắng, `VietQrCode size={176}` ở giữa, dưới là số tiền, ngân hàng, số tài khoản, tên, "Nội dung: …". Không có nút "Đã nhận tiền" riêng: thu ngân vẫn bấm nút xác nhận có sẵn.
- `page.tsx`: select thêm 3 cột, truyền `bankAccount`. Thu ngân đọc được vì RLS `stores` theo `is_store_scoped_operator` (đã kiểm trên prod).
- `PaymentView` tính:
  `const qr = discountError ? null : buildBillQr({ bank: bankAccount, amount: paymentQrAmount({ method, total, bankPart }), sessions: list.map((s) => ({ sessionId: s.session_id, tableLabel: s.table_number })) })`
- Render `<PaymentVietQr qr={qr} />` trong nhánh Chuyển khoản và nhánh Kết hợp. Ở Kết hợp mã đổi theo ô nhập, không cần debounce vì `QRCode.create` chạy trong vài mili giây.
- Có `qr` thì đổi câu ở khối chuyển khoản thành: "Cho khách quét mã này, **nghe loa báo tiền về đủ {số trong QR}** rồi mới bấm xác nhận." Không có `qr` thì giữ nguyên câu cũ "Cho khách quét mã QR của quán…".

- [ ] **Step 4: Chạy toàn bộ test POS và type-check**

Run: `cd admin-web && npx vitest run app/admin/pos && npx tsc --noEmit`
Expected: PASS, gồm `bill-discount-ui.test.tsx` không phải sửa.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/pos
git commit -m "feat: hien VietQR o man Thanh toan POS"
```

### Task 6: QR trên tờ in `/print/bill`

**Files:**
- Create: `admin-web/lib/print/load-bill-qr.ts`
- Modify: `admin-web/app/print/bill/page.tsx:17-26`
- Modify: `admin-web/app/print/bill/print-bill.tsx:42` (prop), `:74` (CSS), sau `:195` (khối QR)
- Modify: `CLAUDE.md` (bảng §10, thêm một dòng cuối)
- Create: `docs/testing/dot1/vietqr-ghep.md`
- Test: `admin-web/lib/print/load-bill-qr.test.ts`, `admin-web/app/print/bill/print-bill.test.tsx`

**Interfaces:**
- Consumes: `pickBillQr`, `BillQr`, `listOpenTableSessions`, `requireOperator`, `VietQrCode`, `VIETQR_QUIET_ZONE`.
- Produces: `loadBillQr(sessionIds: string[]): Promise<BillQr|null>`, không bao giờ ném. `PrintBill` nhận thêm `qr?: BillQr | null`. `export const QR_PRINT_MM = 44`.

Vì sao 44mm: khung SVG có lề 4 module mỗi bên. Mã nhỏ nhất (98 ký tự, version 4, 33 module) ở 44mm có phần mã 35,41mm; ở 42mm chỉ còn 33,80mm, không đạt spec.

- [ ] **Step 1: Viết test hỏng cho `PrintBill`, thêm vào `print-bill.test.tsx`**

```tsx
const qr = { payload: '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C',
  amount: 155000, memo: 'BAN 12 A1B2C3', bankName: 'Vietcombank', accountNumber: '0011001234567', accountName: 'DO DUC TU' }

describe('VietQR trên tờ in', () => {
  it('có QR ngay trong HTML lần đầu, kèm số tiền và tài khoản', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} qr={qr} />)
    expect(html).toContain('<svg')
    expect(html).toContain(`width="${QR_PRINT_MM}mm"`)
    expect(html).toContain('Chuyển khoản 155.000đ')
    expect(html).toContain('0011001234567')
    expect(html).toContain('DO DUC TU')
    expect(html).toContain('BAN 12 A1B2C3')
  })
  it('không có QR thì tờ in như cũ', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} qr={null} />)
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('Chuyển khoản')
  })
  it('phiếu in thử không bao giờ có QR', () => {
    expect(renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} qr={qr} testMode />)).not.toContain('<svg')
  })
  it('phần mã trên giấy đủ 35mm với mã nhỏ nhất', () => {
    const n = QRCode.create('00020101021238560010A0000007270126000697041501121080001234560208QRIBFTTA5303704540115802VN6304F903', { errorCorrectionLevel: 'M' }).modules.size
    expect((QR_PRINT_MM * n) / (n + 2 * VIETQR_QUIET_ZONE)).toBeGreaterThanOrEqual(35)
  })
})
```

- [ ] **Step 2: Viết test hỏng cho `loadBillQr`**

Mock `@/lib/actions/table-session` (`listOpenTableSessions`), `@/lib/auth/operator` (`requireOperator` trả `{storeId:'store-1'}`), `@/lib/supabase/server` (`createClient` trả `from('stores').select().eq().maybeSingle()`).

```ts
const ID = '11111111-2222-3333-4444-555555a1b2c3'
const session = { session_id: ID, table_number: 'Bàn 12', total: 155000, unpaid_total: 155000 }

it('bill còn mở: ra QR, đọc đúng quán của người đăng nhập', async () => {
  mocks.listOpenTableSessions.mockResolvedValue({ ok: true, sessions: [session] })
  expect((await loadBillQr([ID]))?.amount).toBe(155000)
  expect(mocks.eq).toHaveBeenCalledWith('id', 'store-1')
})
it('danh sách phiên lỗi: trả null', async () => {
  mocks.listOpenTableSessions.mockResolvedValue({ ok: false, error: 'x' })
  await expect(loadBillQr([ID])).resolves.toBeNull()
})
it('requireOperator ném: trả null, không ném', async () => {
  mocks.requireOperator.mockRejectedValueOnce(new Error('x'))
  await expect(loadBillQr([ID])).resolves.toBeNull()
})
it('đọc tài khoản lỗi: trả null', async () => {
  mocks.listOpenTableSessions.mockResolvedValue({ ok: true, sessions: [session] })
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
  await expect(loadBillQr([ID])).resolves.toBeNull()
})
```

- [ ] **Step 3: Chạy test, phải hỏng**

Run: `cd admin-web && npx vitest run lib/print/load-bill-qr.test.ts app/print/bill/print-bill.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Viết `loadBillQr` và sửa trang in**

- `loadBillQr`: gọi `requireOperator`, `listOpenTableSessions`, đọc 3 cột `stores` theo `operator.storeId` bằng `createClient`, rồi `pickBillQr`. Bọc toàn bộ trong `try/catch` trả `null`: lỗi QR không được làm hỏng việc in bill.
- `page.tsx`: sau khi `getSessionsBill` thành công, `const qr = await loadBillQr(sessionIds)`, truyền `<PrintBill bill={res.bill} qr={qr} />`.
- `print-bill.tsx`: khối mới ngay sau dòng "Khách cần trả", trước `<hr />` của lời cảm ơn, chỉ render khi `qr && !testMode`. Nội dung căn giữa: dòng đậm "Chuyển khoản {dong(qr.amount)}đ", `<VietQrCode payload={qr.payload} size={`${QR_PRINT_MM}mm`} />`, `{qr.bankName} · {qr.accountNumber}`, `{qr.accountName}`, `Nội dung: {qr.memo}`. Thêm CSS `.qr { text-align:center; break-inside:avoid; }`, SVG `display:block; margin:4px auto`.
- Dòng "In lúc" đã có sẵn, không thêm.

- [ ] **Step 5: Kiểm mọi chỗ render `PrintBill`**

Run: `cd admin-web && grep -rn "<PrintBill" app --include=*.tsx | grep -v test`
Expected: chỉ có `print/bill/page.tsx` (có `qr`) và `print/test-slip/page.tsx` (không cần).

Nếu có thêm `app/print/agent/` từ mục C: trang đó phải truyền `qr` bằng `pickBillQr` với dữ liệu nó đọc được. `loadBillQr` không dùng được ở đó vì nó cần phiên đăng nhập, mà agent chỉ có token. Trang agent không đọc được phiên đang mở thì đừng tự chế: ghi vào checklist "chế độ agent chưa có QR" và báo controller.

- [ ] **Step 6: Chạy test đầy đủ và build**

Run: `cd admin-web && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS, build xong.

- [ ] **Step 7: Viết checklist `docs/testing/dot1/vietqr-ghep.md`**

Test trên Bảo Lương đã khai tài khoản. Dựng bill bằng nút Khách lẻ, dọn bằng **Bỏ bàn** để không vào doanh thu, trừ bài 7. Mỗi bài ghi rõ bước và kết quả đúng:

1. Thanh toán, chọn Chuyển khoản: có QR đúng số cần thu.
2. Đặt giảm giá: QR đổi theo số sau giảm.
3. Chọn Kết hợp, gõ ô Chuyển khoản: QR đổi theo ô nhập. Xoá trắng ô đó: QR biến mất.
4. Chọn Tiền mặt: không có QR.
5. Gộp 2 mâm: một QR cho cả bill, nội dung có cả hai bàn.
6. In tạm tính: tờ in có QR, số tiền đúng. Đo bằng thước: phần mã rộng từ 35mm. Quét bằng **3 app ngân hàng** trên tờ in nhiệt thật (chỉ xem, không chuyển).
7. Thu xong một bill nhỏ nhất, in lại ở A04: không có QR. Bài này cộng vào doanh thu, ghi lại số tiền.
8. Tài khoản thu ngân: thấy QR ở màn Thanh toán.
9. Xoá tài khoản ở Cài đặt: POS và tờ in không còn QR, câu nhắc cũ trở lại.
10. Quán chưa khai tài khoản in bill: tờ in y như trước.

- [ ] **Step 8: Thêm một dòng vào CLAUDE.md §10**

Ngày, quyết định VietQR, lý do. Ghi ba điều phải nhớ: số trong QR đi qua `pickBillQr`, không lấy `grand_total` vì số đó cộng cả đơn đã thu; QR là SVG đồng bộ vì `useAutoPrint` không chờ ảnh dựng sau; tờ in 44mm vì 42mm không đủ 35mm phần mã.

- [ ] **Step 9: Commit**

```bash
git add admin-web/lib/print admin-web/app/print/bill docs/testing/dot1/vietqr-ghep.md CLAUDE.md
git commit -m "feat: in VietQR tren to tam tinh cua bill chua thu"
```

- [ ] **Step 10: Dừng, chờ anh Tú**

Báo: "Xong rồi anh, test theo `docs/testing/dot1/vietqr-ghep.md` nhé". Không làm tiếp cho tới khi anh báo PASS.
