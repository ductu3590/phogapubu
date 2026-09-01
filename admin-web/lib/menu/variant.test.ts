import { describe, it, expect } from 'vitest'
import { parseVariantInput, displayPriceLabel } from './variant'

// Giá biến thể do người gõ tay từ tờ menu giấy. Hai lỗi hay gặp:
// gõ nhầm chữ vào ô giá, và để trống tên.
describe('parseVariantInput', () => {
  it('nhận tên và giá hợp lệ', () => {
    expect(parseVariantInput(' Đĩa to ', '80000')).toEqual({ ok: true, name: 'Đĩa to', price: 80000 })
  })

  it('từ chối tên rỗng', () => {
    expect(parseVariantInput('   ', '80000')).toEqual({ ok: false, error: 'Nhập tên lựa chọn' })
  })

  it('từ chối giá không phải số', () => {
    expect(parseVariantInput('Đĩa to', 'tám mươi nghìn')).toEqual({
      ok: false,
      error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000',
    })
  })

  it('từ chối giá âm', () => {
    expect(parseVariantInput('Đĩa to', '-1')).toEqual({ ok: false, error: 'Giá phải là số ≥ 0' })
  })

  it('chấp nhận giá 0 (món tặng kèm)', () => {
    expect(parseVariantInput('Cỡ thường', '0')).toEqual({ ok: true, name: 'Cỡ thường', price: 0 })
  })

  // --- Các ca bổ sung: người thao tác gõ giá bằng ngón tay trên điện thoại ---

  it('từ chối giá rỗng — Number("") là 0, không được coi là hợp lệ', () => {
    expect(parseVariantInput('Đĩa to', '')).toEqual({
      ok: false,
      error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000',
    })
  })

  it('từ chối giá chỉ có khoảng trắng', () => {
    expect(parseVariantInput('Đĩa to', '   ')).toEqual({
      ok: false,
      error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000',
    })
  })

  it('nhận giá gõ kiểu Việt Nam có dấu chấm ngăn nghìn', () => {
    // Chủ quán chép từ tờ menu giấy in "80.000đ" — đây là cách gõ MẶC ĐỊNH,
    // không phải ca hiếm. Number('80.000') ra 80, mất 1000 lần.
    expect(parseVariantInput('Đĩa to', '80.000')).toEqual({ ok: true, name: 'Đĩa to', price: 80000 })
  })

  it('nhận dấu phẩy và khoảng trắng làm dấu ngăn nghìn', () => {
    expect(parseVariantInput('A', '80,000')).toEqual({ ok: true, name: 'A', price: 80000 })
    expect(parseVariantInput('A', '80 000')).toEqual({ ok: true, name: 'A', price: 80000 })
  })

  it('nhận giá triệu có hai dấu ngăn nghìn', () => {
    expect(parseVariantInput('A', '1.200.000')).toEqual({ ok: true, name: 'A', price: 1200000 })
  })

  it('vẫn từ chối chữ lẫn trong số', () => {
    expect(parseVariantInput('A', '80k').ok).toBe(false)
    expect(parseVariantInput('A', '8o.000').ok).toBe(false)
  })

  it('giá thập phân bị hiểu thành số nguyên sau khi bỏ dấu ngăn nghìn (đánh đổi có chủ đích)', () => {
    // '80000.5' → dấu chấm bị coi là dấu ngăn nghìn nên ra 800005, không phải làm
    // tròn 80000.5 → 80001. Chấp nhận được vì VNĐ không có phần lẻ, không ai gõ giá
    // món ăn kiểu thập phân vào ô này.
    expect(parseVariantInput('Đĩa to', '80000.5')).toEqual({ ok: true, name: 'Đĩa to', price: 800005 })
  })

  it('từ chối ký hiệu khoa học ("1e5") — không phải cách người dùng gõ giá tiền', () => {
    expect(parseVariantInput('Đĩa to', '1e5')).toEqual({
      ok: false,
      error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000',
    })
  })

  it('từ chối Infinity', () => {
    expect(parseVariantInput('Đĩa to', 'Infinity')).toEqual({
      ok: false,
      error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000',
    })
  })

  it('từ chối NaN', () => {
    expect(parseVariantInput('Đĩa to', 'NaN')).toEqual({
      ok: false,
      error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000',
    })
  })

  it('từ chối số quá lớn — vượt ngưỡng hợp lý cho một món ăn', () => {
    expect(parseVariantInput('Đĩa to', '999999999999')).toEqual({ ok: false, error: 'Giá phải là số ≥ 0' })
  })

  it('cắt khoảng trắng 2 đầu tên trước khi kiểm tra rỗng', () => {
    expect(parseVariantInput('\tĐĩa to\n', '10000')).toEqual({ ok: true, name: 'Đĩa to', price: 10000 })
  })
})

describe('displayPriceLabel', () => {
  it('món thường: hiện giá trần trụi', () => {
    expect(displayPriceLabel(50000, false)).toBe('50.000đ')
  })

  it('món có biến thể: hiện "Từ"', () => {
    expect(displayPriceLabel(50000, true)).toBe('Từ 50.000đ')
  })
})
