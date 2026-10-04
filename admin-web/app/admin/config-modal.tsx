import type { ReactNode } from 'react'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import ConfigDialog from './config-dialog'

// Vỏ server của hộp thoại cấu hình: lấy tên quán rồi đặt trang cấu hình (server component) vào trong.
export default async function ConfigModal({ children }: { children: ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  const supabase = await createClient()
  const [{ data }, { data: workflow }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.rpc('get_public_store_workflow', { p_store_id: operator.storeId }),
  ])
  const reservationsEnabled = (workflow as { reservations_enabled?: unknown } | null)?.reservations_enabled === true
  return (
    <ConfigDialog storeName={(data?.name as string | undefined) ?? 'Quán'} reservationsEnabled={reservationsEnabled}>
      {children}
    </ConfigDialog>
  )
}
