import { describe, expect, it } from 'vitest'
import { bankPartOf, buildCollectPayload, buildPaymentLines, cashGivenError, cashPartOf, debtPartOf, fillOtherSide, INSTRUMENT_LABELS, parsePaymentLines, paymentDraft, paymentRows } from './collect-payment'

describe('fillOtherSide', () => {
  it('gõ một ô, ô kia là phần còn lại, không âm', () => {
    expect(fillOtherSide(1_000_000, 400_000)).toBe(600_000)
    expect(fillOtherSide(1_000_000, 1_200_000)).toBe(0)
    expect(fillOtherSide(1_000_000, null)).toBeNull()
  })
})

describe('buildPaymentLines', () => {
  it('tiền mặt, chuyển khoản: một dòng đúng tổng', () => {
    expect(buildPaymentLines(100_000, 'cash', null, null)).toEqual({ lines: [{ instrument: 'cash', amount: 100_000 }], error: null })
    expect(buildPaymentLines(100_000, 'bank', null, null)).toEqual({ lines: [{ instrument: 'bank', amount: 100_000 }], error: null })
  })

  it('kết hợp đúng tổng: hai dòng; một ô bằng 0 thì còn một dòng', () => {
    expect(buildPaymentLines(1_000_000, 'mixed', 400_000, 600_000).lines).toHaveLength(2)
    expect(buildPaymentLines(1_000_000, 'mixed', 1_000_000, 0)).toEqual({ lines: [{ instrument: 'cash', amount: 1_000_000 }], error: null })
  })

  it('kết hợp: tiền mặt đứng trước chuyển khoản (khớp thứ tự server trả về)', () => {
    expect(buildPaymentLines(1_000_000, 'mixed', 400_000, 600_000).lines)
      .toEqual([{ instrument: 'cash', amount: 400_000 }, { instrument: 'bank', amount: 600_000 }])
  })

  it('tổng đổi hoặc gõ sai: không có dòng, có lỗi', () => {
    const r = buildPaymentLines(1_100_000, 'mixed', 400_000, 600_000)
    expect(r.lines).toEqual([])
    expect(r.error).toBe('Tổng hai khoản phải đúng 1.100.000đ')
    expect(buildPaymentLines(1_000_000, 'mixed', null, null).error).toBe('Tổng hai khoản phải đúng 1.000.000đ')
  })

  it('số âm hoặc lẻ đồng không lọt qua', () => {
    expect(buildPaymentLines(1_000, 'mixed', 1_500, -500).error).toBe('Tổng hai khoản phải đúng 1.000đ')
    expect(buildPaymentLines(1_000, 'mixed', 500.5, 499.5).error).toBe('Tổng hai khoản phải đúng 1.000đ')
  })

  it('bill 0đ: không dòng nào, không lỗi, ở mọi lựa chọn', () => {
    for (const m of ['cash', 'bank', 'mixed'] as const) expect(buildPaymentLines(0, m, null, null)).toEqual({ lines: [], error: null })
  })
})

describe('cashPartOf', () => {
  it('chỉ cộng phần tiền mặt', () => {
    expect(cashPartOf([{ instrument: 'cash', amount: 400_000 }, { instrument: 'bank', amount: 600_000 }])).toBe(400_000)
    expect(cashPartOf([{ instrument: 'bank', amount: 600_000 }])).toBe(0)
    expect(cashPartOf([])).toBe(0)
  })
})

describe('bankPartOf', () => {
  it('chỉ cộng phần chuyển khoản', () => {
    expect(bankPartOf([{ instrument: 'cash', amount: 400_000 }, { instrument: 'bank', amount: 600_000 }])).toBe(600_000)
    expect(bankPartOf([{ instrument: 'cash', amount: 1 }])).toBe(0)
  })
})

describe('paymentDraft — một nguồn cho phần tiền mặt / chuyển khoản của màn Thanh toán', () => {
  it('hợp lệ: phần lấy từ dòng đã dựng', () => {
    expect(paymentDraft(1_000_000, 'mixed', 400_000, 600_000)).toMatchObject({ error: null, cash: 400_000, bank: 600_000 })
    expect(paymentDraft(100_000, 'cash', null, null)).toMatchObject({ cash: 100_000, bank: 0 })
    expect(paymentDraft(100_000, 'bank', null, null)).toMatchObject({ cash: 0, bank: 100_000 })
  })

  it('bill 0đ ở chế độ Kết hợp: không có phần tiền mặt dù ô còn chữ cũ (ẩn khách đưa, không gửi cashGiven)', () => {
    expect(paymentDraft(0, 'mixed', 50_000, 0)).toEqual({ lines: [], error: null, cash: 0, bank: 0 })
  })

  it('đang lệch: phần lấy theo chữ đang gõ để ô khách đưa / nhắc chuyển khoản bám theo', () => {
    expect(paymentDraft(1_000_000, 'mixed', 300_000, 600_000)).toMatchObject({ lines: [], cash: 300_000, bank: 600_000 })
    expect(paymentDraft(1_000_000, 'mixed', null, null)).toMatchObject({ cash: 0, bank: 0 })
  })
})

describe('parsePaymentLines', () => {
  it('chỉ giữ phương tiện có nhãn (kể cả khoá kế thừa như toString bị loại), số ép kiểu', () => {
    expect(parsePaymentLines([{ instrument: 'cash', amount: '1000' }, { instrument: 'wallet', amount: 5 }, null, { amount: 3 },
      { instrument: 'toString', amount: 1 }, { instrument: 'bank', amount: 2 }]))
      .toEqual([{ instrument: 'cash', amount: 1000 }, { instrument: 'bank', amount: 2 }])
    expect(parsePaymentLines(undefined)).toEqual([])
    expect(parsePaymentLines({})).toEqual([])
  })
})

describe('cashGivenError', () => {
  it('trống hoặc trong giới hạn: không lỗi; quá 2 tỉ: lỗi tiếng Việt (không để server báo tràn số)', () => {
    expect(cashGivenError(null)).toBeNull()
    expect(cashGivenError(2_000_000_000)).toBeNull()
    expect(cashGivenError(2_000_000_001)).toBe('Tiền khách đưa quá lớn — kiểm tra lại số')
  })
})

describe('paymentRows', () => {
  it('đủ khoản, khách đưa, tiền thối', () => {
    expect(paymentRows({ payments: [{ instrument: 'cash', amount: 400_000 }, { instrument: 'bank', amount: 600_000 }], cashGiven: 500_000, changeAmount: 100_000 }))
      .toEqual([{ label: 'Tiền mặt', amount: 400_000 }, { label: 'Chuyển khoản', amount: 600_000 }, { label: 'Khách đưa', amount: 500_000 }, { label: 'Tiền thối', amount: 100_000 }])
  })

  it('không có khoản hoặc thối 0: bỏ dòng', () => {
    expect(paymentRows({ payments: [] })).toEqual([])
    expect(paymentRows({})).toEqual([])
    expect(paymentRows({ payments: [{ instrument: 'bank', amount: 5 }], cashGiven: null, changeAmount: 0 })).toEqual([{ label: 'Chuyển khoản', amount: 5 }])
  })

  it('nhãn phương tiện lấy từ một bảng duy nhất (thêm phương tiện mới = thêm một dòng ở đây)', () => {
    expect(INSTRUMENT_LABELS).toEqual({ cash: 'Tiền mặt', bank: 'Chuyển khoản', debt: 'Ghi nợ' })
  })
})

describe('ghi nợ', () => {
  it('Ghi nợ: một dòng debt đúng tổng', () => {
    expect(buildPaymentLines(350_000, 'debt', null, null)).toEqual({ lines: [{ instrument: 'debt', amount: 350_000 }], error: null })
  })
  it('Kết hợp + nợ phần còn lại', () => {
    expect(buildPaymentLines(1_200_000, 'mixed', 500_000, null, true).lines).toEqual([{ instrument: 'cash', amount: 500_000 }, { instrument: 'debt', amount: 700_000 }])
    expect(buildPaymentLines(1_000_000, 'mixed', 200_000, 300_000, true).lines).toHaveLength(3)
    expect(buildPaymentLines(1_000_000, 'mixed', 1_000_000, null, true).lines).toEqual([{ instrument: 'cash', amount: 1_000_000 }])
    expect(buildPaymentLines(1_000_000, 'mixed', 800_000, 300_000, true).error).toBe('Tiền mặt và chuyển khoản vượt số cần thu 1.000.000đ')
  })
  it('paymentRows: dòng nợ kèm tên khách', () => {
    expect(paymentRows({ payments: [{ instrument: 'cash', amount: 500_000 }, { instrument: 'debt', amount: 700_000 }], debtCustomerName: 'Cty Hoà Bình' }))
      .toEqual([{ label: 'Tiền mặt', amount: 500_000 }, { label: 'Ghi nợ — Cty Hoà Bình', amount: 700_000 }])
  })
  it('buildCollectPayload bỏ khách khi không có dòng nợ', () => {
    const choice = { kind: 'existing', id: 'c1', name: 'A' } as const
    expect(buildCollectPayload([{ instrument: 'cash', amount: 1 }], choice)).toEqual({ debtCustomerId: null, newDebtCustomer: null })
    expect(buildCollectPayload([{ instrument: 'debt', amount: 1 }], choice)).toEqual({ debtCustomerId: 'c1', newDebtCustomer: null })
    expect(buildCollectPayload([{ instrument: 'debt', amount: 1 }], { kind: 'new', customer: { name: 'B', phone: null, kind: 'company' } }))
      .toEqual({ debtCustomerId: null, newDebtCustomer: { name: 'B', phone: null, kind: 'company' } })
  })

  // ---- thêm ngoài plan ----
  it('Ghi nợ bill 0đ: không dòng nào; debtRest=false giữ nguyên Kết hợp của plan A', () => {
    expect(buildPaymentLines(0, 'debt', null, null)).toEqual({ lines: [], error: null })
    expect(buildPaymentLines(1_000_000, 'mixed', 800_000, 300_000).error).toBe('Tổng hai khoản phải đúng 1.000.000đ')
    expect(buildPaymentLines(1_000_000, 'mixed', 400_000, 100_000).lines).toEqual([])
  })
  it('Kết hợp + nợ: số âm / lẻ bị chặn; chỉ CK + nợ', () => {
    expect(buildPaymentLines(1_000_000, 'mixed', -1, null, true).lines).toEqual([])
    expect(buildPaymentLines(1_000_000, 'mixed', 1.5, null, true).lines).toEqual([])
    expect(buildPaymentLines(1_000_000, 'mixed', null, 400_000, true).lines).toEqual([{ instrument: 'bank', amount: 400_000 }, { instrument: 'debt', amount: 600_000 }])
  })
  it('debtPartOf; parsePaymentLines giữ dòng nợ; paymentRows thứ tự TM, CK, nợ, khách đưa, thối', () => {
    const lines = [{ instrument: 'debt' as const, amount: 3 }, { instrument: 'cash' as const, amount: 1 }, { instrument: 'bank' as const, amount: 2 }]
    expect(debtPartOf(lines)).toBe(3)
    expect(debtPartOf([])).toBe(0)
    expect(parsePaymentLines([{ instrument: 'debt', amount: '700000' }])).toEqual([{ instrument: 'debt', amount: 700_000 }])
    expect(paymentRows({ payments: lines, cashGiven: 5, changeAmount: 4 }).map((r) => r.label))
      .toEqual(['Tiền mặt', 'Chuyển khoản', 'Ghi nợ', 'Khách đưa', 'Tiền thối'])
  })
  it('paymentDraft với Ghi nợ: phần tiền mặt / chuyển khoản là 0', () => {
    expect(paymentDraft(500_000, 'debt', null, null)).toEqual({ lines: [{ instrument: 'debt', amount: 500_000 }], error: null, cash: 0, bank: 0 })
  })
})
