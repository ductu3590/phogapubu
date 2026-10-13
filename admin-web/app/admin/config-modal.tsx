import type { ReactNode } from 'react'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import ConfigDialog from './config-dialog'

// Vỏ server của hộp thoại cấu hình: lấy tên quán rồi đặt trang cấu hình (server component) vào trong.
export default async function ConfigModal({ children }: { children: ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  const supabase = await createClient()
  const { data } = await supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle()
  return (
    <ConfigDialog storeName={(data?.name as string | undefined) ?? 'Quán'} role={operator.role === 'store_cashier' ? 'store_cashier' : 'store_owner'}>
      {children}
    </ConfigDialog>
  )
}
