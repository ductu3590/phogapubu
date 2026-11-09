import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AccountGroup, OperatorAccount } from '@/lib/actions/mevo-accounts'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/mevo-accounts', () => ({ resetOperatorPassword: vi.fn() }))

const AccountsClient = (await import('./accounts-client')).default

const account = (role: OperatorAccount['role'], email: string): OperatorAccount =>
  ({ userId: email, email, role, isActive: true, lastSignInText: 'Chưa đăng nhập lần nào', isSelf: false })

// Nhãn vai ở /mevo/accounts lấy từ MỘT chỗ (lib/auth/roles.ts ROLE_LABEL), gồm cả Quản lý (mig 116).
describe('/mevo/accounts — nhãn vai', () => {
  it('hiện nhãn từ ROLE_LABEL cho mọi vai của quán', () => {
    const groups: AccountGroup[] = [{
      key: 's1', storeName: 'Yên Garden', storeId: 's1', accounts: [
        account('store_owner', 'chu@yg.vn'), account('store_manager', 'ql@yg.vn'),
        account('store_cashier', 'tn@yg.vn'), account('store_staff', 'pv@yg.vn'),
      ],
    }]
    const html = renderToStaticMarkup(<AccountsClient groups={groups} />)
    for (const label of ['Chủ quán', 'Quản lý', 'Thu ngân', 'Nhân viên phục vụ']) expect(html).toContain(label)
  })
})
