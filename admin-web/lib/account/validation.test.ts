import { describe, expect, it } from 'vitest'
import { parseAccountPassword, parseAccountProfile } from './validation'

describe('account validation', () => {
  it('trims profile fields and keeps empty phone as empty string', () => {
    const formData = new FormData()
    formData.set('full_name', '  Nguyen Van A  ')
    formData.set('phone', '  0901 234 567  ')

    expect(parseAccountProfile(formData)).toEqual({
      fullName: 'Nguyen Van A',
      phone: '0901 234 567',
    })
  })

  it('rejects a display name longer than 100 characters', () => {
    const formData = new FormData()
    formData.set('full_name', 'a'.repeat(101))
    formData.set('phone', '0901234567')

    expect(() => parseAccountProfile(formData)).toThrow('Họ tên tối đa 100 ký tự')
  })

  it('rejects a phone longer than 30 characters', () => {
    const formData = new FormData()
    formData.set('full_name', 'Nguyen Van A')
    formData.set('phone', '1'.repeat(31))

    expect(() => parseAccountProfile(formData)).toThrow('Số điện thoại tối đa 30 ký tự')
  })

  it('preserves current password leading and trailing spaces', () => {
    const formData = new FormData()
    formData.set('current_password', '  matkhaucu  ')
    formData.set('password', 'matkhau123')
    formData.set('confirm_password', 'matkhau123')

    expect(parseAccountPassword(formData)).toEqual({
      currentPassword: '  matkhaucu  ',
      password: 'matkhau123',
    })
  })

  it('preserves new password leading and trailing spaces when confirmation matches exactly', () => {
    const formData = new FormData()
    formData.set('current_password', 'matkhaucu')
    formData.set('password', '  matkhau123  ')
    formData.set('confirm_password', '  matkhau123  ')

    expect(parseAccountPassword(formData)).toEqual({
      currentPassword: 'matkhaucu',
      password: '  matkhau123  ',
    })
  })

  it('rejects missing current password', () => {
    const formData = new FormData()
    formData.set('password', 'matkhau123')
    formData.set('confirm_password', 'matkhau123')

    expect(() => parseAccountPassword(formData)).toThrow('Vui lòng nhập mật khẩu hiện tại')
  })

  it('rejects blank current password', () => {
    const formData = new FormData()
    formData.set('current_password', '   ')
    formData.set('password', 'matkhau123')
    formData.set('confirm_password', 'matkhau123')

    expect(() => parseAccountPassword(formData)).toThrow('Vui lòng nhập mật khẩu hiện tại')
  })

  it('rejects password shorter than 8 characters', () => {
    const formData = new FormData()
    formData.set('current_password', 'matkhaucu')
    formData.set('password', '1234567')
    formData.set('confirm_password', '1234567')

    expect(() => parseAccountPassword(formData)).toThrow('Mật khẩu mới phải có ít nhất 8 ký tự')
  })

  it('rejects password confirmation mismatch', () => {
    const formData = new FormData()
    formData.set('current_password', 'matkhaucu')
    formData.set('password', 'matkhau123')
    formData.set('confirm_password', 'matkhau456')

    expect(() => parseAccountPassword(formData)).toThrow('Mật khẩu nhập lại không khớp')
  })
})
