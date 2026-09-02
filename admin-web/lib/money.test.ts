import { describe, it, expect } from 'vitest'
import { formatVndTyping, parseVnd } from './money'

// Chủ quán chép giá từ tờ menu giấy in "80.000đ" — dấu chấm ngăn nghìn là cách gõ
// MẶC ĐỊNH của người Việt, không phải ca hiếm. Hai hàm này là cặp đi liền nhau:
// formatVndTyping vẽ ra cái người dùng thấy, parseVnd đọc ngược lại thành số.
describe('formatVndTyping', () => {
  it('chuỗi rỗng giữ nguyên rỗng — không tự nhét số 0 vào ô trống', () => {
    expect(formatVndTyping('')).toBe('')
  })

  it('chỉ toàn khoảng trắng cũng ra rỗng', () => {
    expect(formatVndTyping('   ')).toBe('')
  })

  it('số nguyên trần trụi được chèn dấu chấm', () => {
    expect(formatVndTyping('80000')).toBe('80.000')
  })

  it('dưới 1000 thì không có dấu nào', () => {
    expect(formatVndTyping('123')).toBe('123')
  })

  it('đúng 4 chữ số có 1 dấu', () => {
    expect(formatVndTyping('1234')).toBe('1.234')
  })

  it('gõ lại chuỗi đã có dấu chấm thì không nhân đôi dấu', () => {
    expect(formatVndTyping('80.000')).toBe('80.000')
    expect(formatVndTyping('1.200.000')).toBe('1.200.000')
  })

  it('dấu phẩy và khoảng trắng bên trong cũng được coi là dấu ngăn nghìn', () => {
    expect(formatVndTyping('80,000')).toBe('80.000')
    expect(formatVndTyping('80 000')).toBe('80.000')
  })

  it('hàng triệu có hai dấu ngăn nghìn', () => {
    expect(formatVndTyping('1200000')).toBe('1.200.000')
  })

  it('chữ lẫn trong số bị loại, chỉ giữ chữ số', () => {
    expect(formatVndTyping('80k')).toBe('80')
    expect(formatVndTyping('8o000')).toBe('8.000')
  })

  it('dấu trừ bị loại — không ai gõ được giá âm vào ô tiền', () => {
    expect(formatVndTyping('-5')).toBe('5')
  })

  it('số 0 giữ nguyên (món tặng kèm giá 0đ)', () => {
    expect(formatVndTyping('0')).toBe('0')
  })

  it('KHÔNG cắt số 0 đứng đầu — giữ đúng thứ tự người dùng vừa gõ', () => {
    // Đánh đổi có chủ đích: cắt số 0 đầu thì lúc người dùng gõ "0" rồi định gõ
    // tiếp sẽ thấy ô nhảy về rỗng. parseVnd('08') vẫn ra 8 nên vô hại.
    expect(formatVndTyping('08')).toBe('08')
  })

  it('số rất lớn vẫn chèn dấu đều 3 chữ số', () => {
    expect(formatVndTyping('999999999999')).toBe('999.999.999.999')
  })

  it('dấu chấm thập phân bị coi là dấu ngăn nghìn (VNĐ không có phần lẻ)', () => {
    // '80.5' → 805, KHÔNG phải 80,5đ. Cố ý: VNĐ không có đơn vị nhỏ hơn đồng nên
    // dấu chấm trong một chuỗi tiền Việt chỉ có một nghĩa duy nhất: ngăn nghìn.
    expect(formatVndTyping('80.5')).toBe('805')
  })
})

describe('parseVnd', () => {
  it('chuỗi rỗng ra null — Number("") là 0, không được coi là hợp lệ', () => {
    expect(parseVnd('')).toBeNull()
  })

  it('chỉ toàn khoảng trắng ra null', () => {
    expect(parseVnd('   ')).toBeNull()
  })

  it('số nguyên trần trụi', () => {
    expect(parseVnd('80000')).toBe(80000)
  })

  it('chuỗi có dấu chấm ngăn nghìn — Number("80.000") ra 80, chia giá cho 1000', () => {
    expect(parseVnd('80.000')).toBe(80000)
  })

  it('dấu phẩy làm dấu ngăn nghìn', () => {
    expect(parseVnd('80,000')).toBe(80000)
  })

  it('khoảng trắng bên trong làm dấu ngăn nghìn', () => {
    expect(parseVnd('80 000')).toBe(80000)
  })

  it('hàng triệu hai dấu ngăn nghìn', () => {
    expect(parseVnd('1.200.000')).toBe(1200000)
  })

  it('chữ lẫn trong số ra null', () => {
    expect(parseVnd('80k')).toBeNull()
    expect(parseVnd('8o.000')).toBeNull()
    expect(parseVnd('tám mươi nghìn')).toBeNull()
  })

  it('dấu trừ đứng đầu ra null', () => {
    expect(parseVnd('-5')).toBeNull()
    expect(parseVnd('- 5')).toBeNull()
    expect(parseVnd('-80.000')).toBeNull()
  })

  it('số 0 hợp lệ, không lẫn với null', () => {
    expect(parseVnd('0')).toBe(0)
  })

  it('số rất lớn vẫn ra số — trần giá do bên gọi tự đặt', () => {
    expect(parseVnd('999999999999')).toBe(999999999999)
    expect(parseVnd('999.999.999.999')).toBe(999999999999)
  })

  it('ký hiệu khoa học, NaN, Infinity đều ra null', () => {
    expect(parseVnd('1e5')).toBeNull()
    expect(parseVnd('NaN')).toBeNull()
    expect(parseVnd('Infinity')).toBeNull()
  })

  it('dấu chấm thập phân bị coi là ngăn nghìn (đánh đổi có chủ đích)', () => {
    expect(parseVnd('80.5')).toBe(805)
  })

  it('bỏ được xuống dòng / tab hai đầu', () => {
    expect(parseVnd('\t12.000\n')).toBe(12000)
  })
})

// Vòng đời thật của một ô tiền: DB → hiện ra ô → người dùng bấm Lưu → về DB.
// Nếu vòng này lệch thì mỗi lần lưu món là giá bị nhân/chia 1000.
describe('vòng tròn hiển thị ↔ đọc lại', () => {
  it('mọi giá đi từ DB ra ô rồi quay về DB đều không đổi', () => {
    for (const n of [0, 5, 999, 1000, 15000, 80000, 1200000, 99000000]) {
      expect(parseVnd(formatVndTyping(String(n)))).toBe(n)
    }
  })
})
