import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient from './account-client'

type UserMetadata = {
  full_name?: unknown
  phone?: unknown
}

function readMetadataString(metadata: UserMetadata, key: keyof UserMetadata): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

export default async function AccountPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const metadata = (user.user_metadata ?? {}) as UserMetadata

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Tài khoản</h1>
        <p className="text-sm text-gray-500">Cập nhật thông tin đăng nhập của chủ quán</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <AccountClient
          email={user.email ?? ''}
          fullName={readMetadataString(metadata, 'full_name')}
          phone={readMetadataString(metadata, 'phone')}
        />
      </div>
    </div>
  )
}
