import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { ROLE_LABEL } from '@/lib/auth/roles'
import { parseDebtCustomerDetail } from '@/lib/debts'
import { createClient } from '@/lib/supabase/server'
import DebtStatementSlip from './debt-statement-slip'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Bảng kê công nợ 80mm (mig 123), mở bằng printDocument({ kind: 'debt_statement' }) → printInPlace (iframe ẩn).
// Nằm NGOÀI khung /admin (như /print/day-report: trong khung sẽ in ra cả thanh bên / dựng cả realtime).
// Chủ quán + quản lý + thu ngân; debt_customer_detail tự kiểm quyền theo quán. CHỈ ĐỌC. Lỗi → hiện chữ, KHÔNG tự in.
export default async function PrintDebtStatementPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const operator = await requireAdminPageOrRedirect('pos')
  const { customer } = await searchParams
  if (!customer || !UUID.test(customer)) return <div className="p-6 text-sm text-red-600">Mã khách nợ không hợp lệ.</div>

  const now = new Date()
  const supabase = await createClient()
  const [{ data, error }, { data: store }, { data: auth }] = await Promise.all([
    supabase.rpc('debt_customer_detail', { p_customer_id: customer }),
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (error) return <div className="p-6 text-sm text-red-600">Không lấy được công nợ: {error.message}</div>
  const detail = parseDebtCustomerDetail(data)
  if (!detail) return <div className="p-6 text-sm text-red-600">Không đọc được khách nợ.</div>

  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  return (
    <DebtStatementSlip
      storeName={(store?.name as string | null) ?? ''}
      detail={detail}
      printedAt={now.toISOString()}
      printedBy={`${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`}
    />
  )
}
