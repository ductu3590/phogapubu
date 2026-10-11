import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { ROLE_LABEL } from '@/lib/auth/roles'
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
  const operator = await requireAdminPageOrRedirect('pos')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const metadata = (user.user_metadata ?? {}) as UserMetadata

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Tài khoản</h1>
        <p className="text-sm text-muted">Cập nhật thông tin và mật khẩu đăng nhập của anh/chị</p>
      </div>
      <div className="@container flex-1 overflow-y-auto bg-background p-4 md:p-6">
        <AccountClient
          email={user.email ?? ''}
          fullName={readMetadataString(metadata, 'full_name')}
          phone={readMetadataString(metadata, 'phone')}
          roleLabel={ROLE_LABEL[operator.role]}
        />
      </div>
    </div>
  )
}
