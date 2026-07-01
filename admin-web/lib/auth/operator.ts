import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type Operator =
  | { userId: string; role: 'mevo_superadmin'; storeId: null }
  | { userId: string; role: 'store_owner'; storeId: string }

async function loadOperator(): Promise<
  { user: { id: string }; op: { role: string; store_id: string | null } } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!op) return null

  return { user: { id: user.id }, op }
}

function toOperator(userId: string, op: { role: string; store_id: string | null }): Operator | null {
  if (op.role === 'mevo_superadmin' && op.store_id === null) {
    return { userId, role: 'mevo_superadmin', storeId: null }
  }
  if (op.role === 'store_owner' && op.store_id) {
    return { userId, role: 'store_owner', storeId: op.store_id }
  }
  return null
}

// Dùng trong Server Component (page.tsx/layout.tsx) — redirect thay vì throw.
export async function requireOperatorOrRedirect(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) redirect('/login?error=not_operator')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) redirect('/login?error=not_operator')
  return operator
}

// Dùng trong Server Action — throw (action không redirect được khi gọi từ Client Component).
export async function requireOperator(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  return operator
}

// Dùng trong action/page CHỈ dành cho /admin — fail closed nếu không phải store_owner.
export async function requireStoreOwnerStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner') throw new Error('Chỉ chủ quán mới thao tác được ở đây')
  return operator.storeId
}
