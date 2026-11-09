import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DebtCustomerSummary } from '@/lib/debts'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/actions/debts', () => ({
  collectDebt: vi.fn(), voidDebtPayment: vi.fn(), saveDebtCustomer: vi.fn(), setDebtCustomerActive: vi.fn(),
  loadDebtCustomerDetail: vi.fn(async () => ({ ok: false, error: 'x' })),
}))

const { default: DebtsView, initialDebtsState } = await import('./debts-view')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const Z = '33333333-3333-4333-8333-333333333333'
const c = (over: Partial<DebtCustomerSummary>): DebtCustomerSummary => ({
  id: A, name: 'Cty Hoà Bình', phone: '0912345678', kind: 'company', note: null, isActive: true,
  outstanding: 650_000, openBills: 2, oldestOpenAt: '2026-11-01T12:00:00Z', lastPaymentAt: null, ...over,
})
const list = [
  c({ id: B, name: 'Anh Long', phone: null, kind: 'person', outstanding: 90_000, openBills: 1, oldestOpenAt: '2026-11-05T16:30:00Z' }),
  c({}),
  c({ id: Z, name: 'Chị Hết Nợ', phone: '0933333333', kind: 'person', outstanding: 0, openBills: 0, oldestOpenAt: null }),
]
const view = (over: Partial<Parameters<typeof DebtsView>[0]> = {}) => renderToStaticMarkup(
  <DebtsView customers={list} canManage={false} initialCustomerId={null} inModal={false} {...over} />)

describe('DebtsView', () => {
  it('thẻ tổng: tổng đang nợ, số khách nợ', () => {
    const html = view()
    expect(html).toContain('Tổng đang nợ'); expect(html).toContain('740.000đ')
    expect(html).toContain('Khách đang nợ'); expect(html).toContain('2 khách')
  })
  it('bảng: tên, SĐT, loại, tổng nợ, bill nợ cũ nhất dd/mm, số bill; sắp nợ giảm dần', () => {
    const html = view()
    for (const t of ['Cty Hoà Bình', '0912345678', 'Cơ quan', '650.000đ', '01/11', 'Anh Long', 'Cá nhân', '90.000đ', '05/11']) {
      expect(html).toContain(t)
    }
    expect(html.indexOf('Cty Hoà Bình')).toBeLessThan(html.indexOf('Anh Long'))
    // "Chỉ khách còn nợ" mặc định bật → khách hết nợ không hiện
    expect(html).not.toContain('Chị Hết Nợ')
  })
  it('trống: Chưa có khách nợ', () => {
    expect(view({ customers: [] })).toContain('Chưa có khách nợ')
  })
  it('nút Xuất Excel trỏ /admin/debts/export?open=1 khi đang lọc còn nợ', () => {
    expect(view()).toContain('href="/admin/debts/export?open=1"')
  })
  it('initialCustomerId của khách có trong danh sách: ngăn kéo mở sẵn; id lạ hoặc sai định dạng: không mở, không lỗi', () => {
    expect(view({ initialCustomerId: A })).toContain('In bảng kê')
    expect(view({ initialCustomerId: '44444444-4444-4444-8444-444444444444' })).not.toContain('In bảng kê')
    expect(view({ initialCustomerId: 'abc' })).not.toContain('In bảng kê')
  })
  it('chủ quán / quản lý có "+ Thêm khách"; thu ngân không', () => {
    expect(view({ canManage: true })).toContain('+ Thêm khách')
    expect(view()).not.toContain('+ Thêm khách')
  })
})

describe('initialDebtsState', () => {
  it('mở khách hết nợ từ URL: tự tắt "Chỉ khách còn nợ" để khách đó hiện trong danh sách', () => {
    expect(initialDebtsState(list, Z)).toEqual({ openId: Z, onlyOpen: false })
    expect(initialDebtsState(list, A)).toEqual({ openId: A, onlyOpen: true })
    expect(initialDebtsState(list, null)).toEqual({ openId: null, onlyOpen: true })
    expect(initialDebtsState(list, 'abc')).toEqual({ openId: null, onlyOpen: true })
  })
})
