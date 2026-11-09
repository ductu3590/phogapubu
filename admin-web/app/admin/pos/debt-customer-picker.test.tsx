import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DebtCustomerSummary } from '@/lib/debts'
import DebtCustomerPicker from './debt-customer-picker'

const pick = (over = {}) => renderToStaticMarkup(<DebtCustomerPicker customers={[
  { id: 'a', name: 'Công ty Hoà Bình', phone: '0912345678', kind: 'company', isActive: true, outstanding: 650_000 },
  { id: 'b', name: 'Đã ngừng', phone: null, kind: 'person', isActive: false, outstanding: 0 },
] as DebtCustomerSummary[]} loading={false} error={null} value={null} onChange={vi.fn()} {...over} />)

describe('DebtCustomerPicker', () => {
  it('liệt kê khách đang dùng kèm số đang nợ, ẩn khách đã ngừng', () => {
    const html = pick(); expect(html).toContain('Công ty Hoà Bình'); expect(html).toContain('650.000đ'); expect(html).not.toContain('Đã ngừng')
  })
  it('đã chọn: hiện tên và nút Đổi', () => expect(pick({ value: { kind: 'existing', id: 'a', name: 'Công ty Hoà Bình' } })).toContain('Đổi'))
  it('có nút + Khách mới; form khách mới có tên, SĐT, loại', () => {
    expect(pick()).toContain('+ Khách mới')
    const html = pick({ value: { kind: 'new', customer: { name: '', phone: null, kind: 'company' } } })
    for (const t of ['id="debt-new-name"', 'id="debt-new-phone"', 'Cơ quan', 'Cá nhân']) expect(html).toContain(t)
  })
  it('đang tải, lỗi', () => {
    expect(pick({ customers: null, loading: true })).toContain('Đang tải khách nợ')
    expect(pick({ customers: null, error: 'mất mạng' })).toContain('mất mạng')
  })

  // ---- thêm ngoài plan ----
  it('có ô tìm id="debt-search"; lỗi có nút Thử lại khi truyền onRetry', () => {
    expect(pick()).toContain('id="debt-search"')
    expect(pick({ customers: null, error: 'mất mạng', onRetry: vi.fn() })).toContain('Thử lại')
  })
  it('khách mới: tên trùng một khách có sẵn → gợi ý chọn khách đó; lỗi debtChoiceError hiện dưới form', () => {
    const dup = pick({ value: { kind: 'new', customer: { name: 'cong ty hoa binh', phone: null, kind: 'company' } } })
    expect(dup).toContain('Đã có khách này — chọn')
    const bad = pick({ value: { kind: 'new', customer: { name: 'A', phone: '12', kind: 'person' } } })
    expect(bad).toContain('SĐT không hợp lệ')
    expect(bad).toMatch(/aria-pressed="true"[^>]*>Cá nhân/)
  })
  it('tối đa 8 dòng', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`, name: `Khách ${i}`, phone: null, kind: 'person', isActive: true, outstanding: 0,
    })) as DebtCustomerSummary[]
    const html = pick({ customers: many })
    expect(html).toContain('Khách 7')
    expect(html).not.toContain('Khách 8<')
  })
  it('khách không nợ: không ghi "đang nợ"', () => {
    const html = pick({ customers: [{ id: 'z', name: 'Anh Z', phone: null, kind: 'person', isActive: true, outstanding: 0 }] })
    expect(html).toContain('Anh Z'); expect(html).not.toContain('đang nợ')
  })
  it('fix round 1: đang tải thì "+ Khách mới" bị khoá', () => {
    expect(pick({ customers: null, loading: true })).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*\+ Khách mới/)
    expect(pick()).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*\+ Khách mới/)
  })
  it('fix round 1: danh sách tải lỗi → form khách mới cũng báo lỗi + Thử lại', () => {
    const html = pick({ customers: null, error: 'mất mạng', onRetry: vi.fn(), value: { kind: 'new', customer: { name: 'A', phone: null, kind: 'company' } } })
    expect(html).toContain('mất mạng'); expect(html).toContain('Thử lại')
  })
})
