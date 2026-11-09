import { describe, expect, it } from 'vitest'
import { ALREADY_COLLECTED, alreadyCollectedMessage, isAmountMismatch, NETWORK_RETRY, runCollect } from './collect-outcome'

const MISMATCH = 'Số tiền không khớp bill: cần thu 100000, đang ghi 90000. Tải lại bill rồi thu lại'

describe('runCollect', () => {
  it('thu xong: done, không thông báo', async () => {
    expect(await runCollect(async () => ({ ok: true, already: false }))).toEqual({ kind: 'done', message: null })
  })

  it('đã thu từ trước (gửi lại cùng mã / máy khác chốt): done với câu trung tính', async () => {
    expect(await runCollect(async () => ({ ok: true, already: true }))).toEqual({ kind: 'done', message: ALREADY_COLLECTED })
    expect(ALREADY_COLLECTED).toBe('Bàn này đã được chốt xong.')
  })

  it('already kèm khoản đã ghi: báo ĐÚNG cái đã ghi, kể cả khi lần bấm này chọn phương tiện khác', async () => {
    const out = await runCollect(async () => ({ ok: true, already: true, lines: [{ instrument: 'cash', amount: 400_000 }], cashGiven: 500_000, changeAmount: 100_000 }))
    expect(out).toEqual({ kind: 'done', message: 'Bàn đã được thu trước đó: Tiền mặt 400.000đ · Khách đưa 500.000đ · Tiền thối 100.000đ' })
  })

  it('server action ném (mất mạng): retry, KHÔNG ném ra ngoài', async () => {
    const out = await runCollect(async () => { throw new Error('fetch failed') })
    expect(out).toEqual({ kind: 'retry', error: NETWORK_RETRY })
  })

  it('bill vừa đổi (số lệch): stale, giữ nguyên câu của server', async () => {
    expect(await runCollect(async () => ({ ok: false, error: MISMATCH }))).toEqual({ kind: 'stale', error: MISMATCH })
  })

  it('lỗi khác: retry, giữ nguyên câu của server', async () => {
    expect(await runCollect(async () => ({ ok: false, error: 'Chỉ chủ quán hoặc thu ngân được thu tiền' })))
      .toEqual({ kind: 'retry', error: 'Chỉ chủ quán hoặc thu ngân được thu tiền' })
  })
})

describe('alreadyCollectedMessage', () => {
  it('có khoản: liệt kê theo nhãn phương tiện; không có khoản (bill cũ): câu trung tính', () => {
    expect(alreadyCollectedMessage({ lines: [{ instrument: 'cash', amount: 400_000 }, { instrument: 'bank', amount: 600_000 }] }))
      .toBe('Bàn đã được thu trước đó: Tiền mặt 400.000đ · Chuyển khoản 600.000đ')
    expect(alreadyCollectedMessage({ lines: [] })).toBe(ALREADY_COLLECTED)
    expect(alreadyCollectedMessage({})).toBe(ALREADY_COLLECTED)
  })
})

describe('isAmountMismatch', () => {
  it('nhận đúng lỗi lệch số của collect_table_bill', () => {
    expect(isAmountMismatch(MISMATCH)).toBe(true)
    expect(isAmountMismatch('Phiên đã đóng, không thu được')).toBe(false)
    expect(isAmountMismatch(null)).toBe(false)
  })
})
