import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/staff', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { roleChangeWarning } = await import('./staff-client')

// Cảnh báo khi chủ quán đổi vai một người ở form Sửa nhân viên.
describe('roleChangeWarning', () => {
  it('lên quản lý: làm mọi việc thu ngân, cộng hậu cần', () => {
    expect(roleChangeWarning('store_cashier', 'store_manager'))
      .toEqual(['Người này sẽ làm mọi việc của thu ngân, cộng kho, thu chi, công nợ và xem lãi lỗ.'])
  })

  it('quản lý xuống thu ngân: thêm câu riêng báo mất Kho, Thu chi, Công nợ, báo cáo tài chính', () => {
    expect(roleChangeWarning('store_manager', 'store_cashier')).toEqual([
      'Người này sẽ thu tiền, bỏ/tặng món và xem doanh thu.',
      'Người này sẽ không còn vào được Kho, Thu chi, Công nợ và báo cáo tài chính.',
    ])
  })

  it('phục vụ lên thu ngân: giữ câu cũ, không nhắc hậu cần', () => {
    expect(roleChangeWarning('store_staff', 'store_cashier')).toEqual(['Người này sẽ thu tiền, bỏ/tặng món và xem doanh thu.'])
  })

  it('xuống phục vụ: không thu tiền được nữa', () => {
    expect(roleChangeWarning('store_manager', 'store_staff')).toEqual(['Người này sẽ không thu tiền được nữa.'])
    expect(roleChangeWarning('store_cashier', 'store_staff')).toEqual(['Người này sẽ không thu tiền được nữa.'])
  })
})
