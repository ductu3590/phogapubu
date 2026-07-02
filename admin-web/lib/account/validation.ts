export type AccountProfileInput = {
  fullName: string
  phone: string
}

export type AccountPasswordInput = {
  password: string
}

function getTrimmedField(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName)

  return typeof value === 'string' ? value.trim() : ''
}

export function parseAccountProfile(formData: FormData): AccountProfileInput {
  const fullName = getTrimmedField(formData, 'full_name')
  const phone = getTrimmedField(formData, 'phone')

  if (fullName.length > 100) {
    throw new Error('Họ tên tối đa 100 ký tự')
  }

  if (phone.length > 30) {
    throw new Error('Số điện thoại tối đa 30 ký tự')
  }

  return { fullName, phone }
}

export function parseAccountPassword(formData: FormData): AccountPasswordInput {
  const password = getTrimmedField(formData, 'password')
  const confirmPassword = getTrimmedField(formData, 'confirm_password')

  if (password.length < 8) {
    throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự')
  }

  if (password !== confirmPassword) {
    throw new Error('Mật khẩu nhập lại không khớp')
  }

  return { password }
}
