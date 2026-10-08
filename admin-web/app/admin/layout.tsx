import { LogOut } from 'lucide-react'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/login/actions'
import { IconRailShell } from '@/components/ui/icon-rail-shell'
import { getButtonClasses } from '@/components/ui/button-classes'
import { cn } from '@/lib/utils'
import BellStyleSync from '@/components/bell-style-sync'
import { adminBottomItems, adminMoreItems, adminRailItems } from './admin-nav'

// `modal` = slot @modal: trang cấu hình mở thành hộp thoại đè lên trang đang mở (Pha 4 ST-3).
export default async function AdminLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  // Chủ quán + thu ngân (PA-2). Superadmin / nhân viên phục vụ lỡ vào → đưa về đúng khu của họ.
  const operator = await requireAdminPageOrRedirect('pos')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [storeResult, workflowResult] = await Promise.all([
    supabase.from('stores').select('name, bell_style').eq('id', operator.storeId).single(),
    supabase.rpc('get_public_store_workflow', { p_store_id: operator.storeId }),
  ])
  const storeName = storeResult.data?.name ?? 'Quán của tôi'
  const workflow = workflowResult.data as { reservations_enabled?: unknown; kitchen_release_policy?: unknown } | null
  const reservationsEnabled = workflow?.reservations_enabled === true
  // Quán thu ngân xác nhận rồi in phiếu (Bảo Lương) không dùng màn bếp → ẩn mục Bếp.
  const kitchenEnabled = workflow?.kitchen_release_policy !== 'pos_confirmation'

  // Khung Stitch P01: rail icon từ 768px, dưới đó thanh trên + ngăn kéo menu.
  return (
    <IconRailShell
      brand={{ initial: 'M', title: storeName, subtitle: operator.role === 'store_cashier' ? 'MEVO · Thu ngân' : 'MEVO · Chủ quán' }}
      items={adminRailItems(kitchenEnabled, operator.role)}
      bottomItems={adminBottomItems(operator.role)}
      moreItems={adminMoreItems(reservationsEnabled, operator.role)}
      footer={
        <div className="space-y-1">
          {user?.email ? <p className="truncate px-3 text-[13px] text-muted">{user.email}</p> : null}
          <form action={signOut}>
            <button type="submit" className={cn(getButtonClasses('ghost'), 'w-full justify-start px-3')}>
              <LogOut className="size-4" aria-hidden />
              Đăng xuất
            </button>
          </form>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">{children}</div>
      <BellStyleSync style={storeResult.data?.bell_style as string | undefined} />
      {modal}
    </IconRailShell>
  )
}
