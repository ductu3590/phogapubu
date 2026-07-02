import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStoreOwnerStoreId = vi.fn()
  const revalidatePath = vi.fn()
  const parseAccountPassword = vi.fn((formData: FormData) => ({
    currentPassword: String(formData.get('current_password') ?? ''),
    password: String(formData.get('password') ?? ''),
  }))
  const parseAccountProfile = vi.fn(() => ({ fullName: 'Nguyen Van A', phone: '0901234567' }))
  const supabase = {
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
    },
  }

  return { parseAccountPassword, parseAccountProfile, requireStoreOwnerStoreId, revalidatePath, supabase }
})

vi.mock('@/lib/account/validation', () => ({
  parseAccountPassword: mocks.parseAccountPassword,
  parseAccountProfile: mocks.parseAccountProfile,
}))
vi.mock('@/lib/auth/operator', () => ({
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.supabase),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { updateAccountPassword, updateAccountProfile } = await import('./account')

function passwordFormData(currentPassword: string, password: string) {
  const formData = new FormData()
  formData.set('current_password', currentPassword)
  formData.set('password', password)
  formData.set('confirm_password', password)

  return formData
}

function profileFormData() {
  const formData = new FormData()
  formData.set('full_name', 'Nguyen Van A')
  formData.set('phone', '0901234567')

  return formData
}

describe('account actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.parseAccountPassword.mockImplementation((formData: FormData) => ({
      currentPassword: String(formData.get('current_password') ?? ''),
      password: String(formData.get('password') ?? ''),
    }))
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
    mocks.supabase.auth.getUser.mockResolvedValue({
      data: { user: { email: 'owner@example.com' } },
    })
    mocks.supabase.auth.signInWithPassword.mockResolvedValue({ error: null })
    mocks.supabase.auth.updateUser.mockResolvedValue({ error: null })
  })

  it('rejects password update before auth calls when store-owner guard fails', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Tài khoản chưa được cấp quyền vận hành'))

    await expect(updateAccountPassword(passwordFormData('matkhau-cu', 'matkhau-moi'))).rejects.toThrow(
      'Tài khoản chưa được cấp quyền vận hành',
    )

    expect(mocks.parseAccountPassword).not.toHaveBeenCalled()
    expect(mocks.supabase.auth.getUser).not.toHaveBeenCalled()
    expect(mocks.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects profile update before metadata update when store-owner guard fails', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Tài khoản chưa được cấp quyền vận hành'))

    await expect(updateAccountProfile(profileFormData())).rejects.toThrow(
      'Tài khoản chưa được cấp quyền vận hành',
    )

    expect(mocks.parseAccountProfile).not.toHaveBeenCalled()
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('prevents password update when current password is wrong', async () => {
    mocks.supabase.auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })

    await expect(updateAccountPassword(passwordFormData('sai-mat-khau', 'matkhau-moi'))).rejects.toThrow(
      'Mật khẩu hiện tại không đúng',
    )

    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('verifies the current password before updating to the new password', async () => {
    await updateAccountPassword(passwordFormData('matkhau-cu', 'matkhau-moi'))

    expect(mocks.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'matkhau-cu',
    })
    expect(mocks.supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'matkhau-moi' })
    expect(mocks.supabase.auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.supabase.auth.updateUser.mock.invocationCallOrder[0],
    )
  })

  it('fails closed when the signed-in user email is missing', async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: {} } })

    await expect(updateAccountPassword(passwordFormData('matkhau-cu', 'matkhau-moi'))).rejects.toThrow(
      'Không tìm thấy email đăng nhập',
    )

    expect(mocks.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })
})
