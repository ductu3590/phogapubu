import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Khung /admin cho vai Quản lý (QL, mig 116): ba chỗ từng ép mọi vai "không phải thu ngân" thành chủ quán —
// hộp thoại cấu hình (lộ tab Cài đặt chung / Nhân viên / Ưu đãi), trang Món (lộ màn sửa món + giá) và
// dòng phụ đề "MEVO · Chủ quán" trên rail.
const mocks = vi.hoisted(() => ({
  operator: { userId: 'u1', role: 'store_manager', storeId: 's1' } as { userId: string; role: string; storeId: string },
}))

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'maybeSingle', 'single']) b[m] = () => b
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: table === 'stores' ? { name: 'Yên Garden', bell_style: null } : [], error: null })
  return b
}

vi.mock('@/lib/auth/operator', () => ({
  requireOperatorOrRedirect: vi.fn(async () => mocks.operator),
  requireAdminPageOrRedirect: vi.fn(async () => mocks.operator),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => builder(table),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'ql@yengarden.vn' } } })) },
  })),
}))
// Thay component client bằng thẻ đánh dấu để kiểm props.
vi.mock('./config-dialog', () => ({
  default: ({ role, children }: { role: string; children: ReactNode }) => <div data-dialog-role={role}>{children}</div>,
}))
vi.mock('./menu/menu-client', () => ({ default: () => <i data-screen="edit-menu" /> }))
vi.mock('./menu/menu-availability-client', () => ({ default: () => <i data-screen="availability" /> }))
vi.mock('@/components/sign-out-button', () => ({ default: () => null }))
vi.mock('@/components/bell-style-sync', () => ({ default: () => null }))
vi.mock('@/components/pos-lock', () => ({ PosLockProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/icon-rail-shell', () => ({
  IconRailShell: ({ brand, items, bottomItems, children }: {
    brand: { subtitle: string }; items: { href: string }[]; bottomItems: { href: string }[]; children: ReactNode
  }) => (
    <section data-subtitle={brand.subtitle} data-rail={items.map((i) => i.href).join(',')}
      data-bottom={bottomItems.map((i) => i.href).join(',')}>{children}</section>
  ),
}))

// Trang POS: chỉ cần biết nhãn vai đưa xuống PosClient (thay PosClient bằng thẻ đánh dấu).
vi.mock('./pos/pos-client', () => ({
  default: ({ operatorRoleLabel, canArrange }: { operatorRoleLabel: string; canArrange: boolean }) => (
    <i data-role-label={operatorRoleLabel} data-can-arrange={String(canArrange)} />
  ),
}))
vi.mock('@/components/ui/toast', () => ({ ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/lib/actions/table-session', () => ({ listOpenTableSessions: async () => ({ ok: true, sessions: [] }) }))
vi.mock('@/lib/actions/floor-layout', () => ({ loadFloorLayout: async () => ({ ok: true, snapshot: null }) }))
vi.mock('@/lib/actions/service-requests', () => ({ listOpenServiceRequests: async () => ({ ok: true, requests: [] }) }))
vi.mock('@/lib/actions/reservations', () => ({ listReservationQueue: async () => null }))
vi.mock('@/lib/actions/reservation-preorders', () => ({ listReservationPreorderQueue: async () => null }))
vi.mock('@/lib/actions/reservation-customer-calls', () => ({ listReservationCustomerCalls: async () => null }))

const ConfigModal = (await import('./config-modal')).default
const PosPage = (await import('./pos/page')).default
const MenuPage = (await import('./menu/page')).default
const AdminLayout = (await import('./layout')).default

const as = (role: string) => { mocks.operator = { userId: 'u1', role, storeId: 's1' } }

describe('khung /admin theo vai', () => {
  beforeEach(() => as('store_manager'))

  it('hộp thoại cấu hình nhận đúng vai (quản lý không bị coi là chủ quán)', async () => {
    for (const role of ['store_manager', 'store_cashier', 'store_owner']) {
      as(role)
      const html = renderToStaticMarkup(await ConfigModal({ children: <b /> }))
      expect(html, role).toContain(`data-dialog-role="${role}"`)
    }
  })

  it('trang Món: quản lý và thu ngân chỉ có màn bật/tắt Tạm hết; chủ quán có màn sửa món', async () => {
    for (const [role, screen] of [['store_manager', 'availability'], ['store_cashier', 'availability'], ['store_owner', 'edit-menu']]) {
      as(role)
      const html = renderToStaticMarkup(await MenuPage())
      expect(html, role).toContain(`data-screen="${screen}"`)
    }
  })

  it('rail: phụ đề theo nhãn vai, mục của quản lý không có Bếp / Bàn QR / Cài đặt quán', async () => {
    const render = async () => renderToStaticMarkup(await AdminLayout({ children: <b />, modal: null }))
    let html = await render()
    expect(html).toContain('data-subtitle="MEVO · Quản lý"')
    expect(html).toContain('data-rail="/admin/pos,/admin/menu,/admin/bills,/admin/reports,/admin/cashbook,/admin/inventory"')
    expect(html).toContain('data-bottom="/admin/account"')
    as('store_cashier')
    expect(await render()).toContain('data-subtitle="MEVO · Thu ngân"')
    as('store_owner')
    html = await render()
    expect(html).toContain('data-subtitle="MEVO · Chủ quán"')
    expect(html).toContain('data-bottom="/admin/settings"')
  })
})

describe('POS: nhãn vai trên thanh trên', () => {
  it('quản lý thấy "Quản lý" (không phải "Thu ngân"), không sắp xếp sơ đồ; chủ quán / thu ngân giữ nhãn cũ', async () => {
    for (const [role, label, arrange] of [
      ['store_manager', 'Quản lý', 'false'], ['store_cashier', 'Thu ngân', 'false'], ['store_owner', 'Chủ quán', 'true'],
    ]) {
      as(role)
      const html = renderToStaticMarkup(await PosPage())
      expect(html, role).toContain(`data-role-label="${label}"`)
      expect(html, role).toContain(`data-can-arrange="${arrange}"`)
    }
  })
})
