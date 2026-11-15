import { describe, expect, it } from 'vitest'
import {
  CHANGE_PASSWORD_PATH, landingAfterLogin, mustChangePassword, parseNewPassword, passwordGateRedirect, passwordUpdateError,
} from './password-gate'

function form(password: string | null, confirm: string | null) {
  const fd = new FormData()
  if (password !== null) fd.set('password', password)
  if (confirm !== null) fd.set('password_confirm', confirm)
  return fd
}

describe('đọc cờ bắt đổi mật khẩu', () => {
  it('chỉ đúng true mới tính', () => {
    expect(mustChangePassword({ must_change_password: true })).toBe(true)
    expect(mustChangePassword({ must_change_password: false })).toBe(false)
    expect(mustChangePassword({ must_change_password: 'true' })).toBe(false)
    expect(mustChangePassword({ provider: 'email' })).toBe(false)
    expect(mustChangePassword(null)).toBe(false)
    expect(mustChangePassword(undefined)).toBe(false)
  })
})

describe('cổng trang', () => {
  it('còn cờ: mọi khu vận hành + /login → trang đổi mật khẩu', () => {
    for (const p of ['/admin', '/admin/pos', '/admin/staff', '/staff', '/staff/order', '/mevo', '/mevo/accounts', '/print/bill', '/login']) {
      expect(passwordGateRedirect(p, true)).toBe(CHANGE_PASSWORD_PATH)
    }
  })
  it('còn cờ: chính trang đổi mật khẩu, trang công khai, máy in token → không can thiệp', () => {
    for (const p of [CHANGE_PASSWORD_PATH, '/', '/privacy', '/terms', '/print/agent/job-1', '/kitchen/yen-garden', '/administrator']) {
      expect(passwordGateRedirect(p, true)).toBeNull()
    }
  })
  it('hết cờ → không bao giờ can thiệp', () => {
    expect(passwordGateRedirect('/admin/pos', false)).toBeNull()
    expect(passwordGateRedirect('/login', false)).toBeNull()
  })
})

describe('đích sau đăng nhập', () => {
  it('còn cờ → đổi mật khẩu trước, mọi vai', () => {
    for (const r of ['store_owner', 'store_manager', 'store_cashier', 'store_staff', 'mevo_superadmin'] as const) {
      expect(landingAfterLogin(r, true)).toBe(CHANGE_PASSWORD_PATH)
    }
  })
  it('hết cờ → trang thường theo vai', () => {
    expect(landingAfterLogin('store_owner', false)).toBe('/admin')
    expect(landingAfterLogin('store_manager', false)).toBe('/admin/pos')
    expect(landingAfterLogin('store_cashier', false)).toBe('/admin/pos')
    expect(landingAfterLogin('store_staff', false)).toBe('/staff/order')
    expect(landingAfterLogin('mevo_superadmin', false)).toBe('/mevo')
  })
})

describe('ô mật khẩu mới', () => {
  it('hợp lệ', () => {
    expect(parseNewPassword(form('MatKhauMoi1', 'MatKhauMoi1'))).toEqual({ ok: true, password: 'MatKhauMoi1' })
  })
  it('thiếu ô / không khớp / ngắn / dấu cách đầu cuối', () => {
    expect(parseNewPassword(form(null, null))).toEqual({ ok: false, error: 'Nhập mật khẩu mới ở cả hai ô' })
    expect(parseNewPassword(form('abcdefgh', ''))).toEqual({ ok: false, error: 'Nhập mật khẩu mới ở cả hai ô' })
    expect(parseNewPassword(form('abcdefgh', 'abcdefgx'))).toEqual({ ok: false, error: 'Hai ô mật khẩu không khớp nhau' })
    expect(parseNewPassword(form('abc1234', 'abc1234'))).toEqual({ ok: false, error: 'Mật khẩu phải từ 8 ký tự trở lên' })
    expect(parseNewPassword(form(' abcdefgh', ' abcdefgh'))).toEqual({
      ok: false, error: 'Mật khẩu không được có dấu cách ở đầu hoặc cuối',
    })
  })
})

describe('lỗi đổi mật khẩu từ máy chủ Auth', () => {
  it('trùng mật khẩu cũ có câu riêng', () => {
    expect(passwordUpdateError({ code: 'same_password' })).toBe('Mật khẩu mới phải khác mật khẩu đang dùng')
    expect(passwordUpdateError({ code: 'weak_password' })).toContain('quá yếu')
    expect(passwordUpdateError({ code: 'x', message: 'raw' })).toBe('Không đổi được mật khẩu, thử lại sau')
  })
})
