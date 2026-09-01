import { listOperatorAccounts } from '@/lib/actions/mevo-accounts'
import AccountsClient from './accounts-client'

export default async function MevoAccountsPage() {
  const groups = await listOperatorAccounts()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">👤 Tài khoản</h1>
        <p className="text-sm text-gray-500">
          Toàn bộ tài khoản đăng nhập của các quán. Chủ quán hoặc nhân viên quên mật khẩu thì đặt
          lại ngay tại đây — không cần biết mật khẩu cũ.
        </p>
      </div>
      <AccountsClient groups={groups} />
    </div>
  )
}
