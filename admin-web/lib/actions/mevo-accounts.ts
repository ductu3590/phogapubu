'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperadmin } from '@/lib/auth/operator'
import { listAllAuthUsers } from '@/lib/supabase/auth-users'
import { revalidatePath } from 'next/cache'

export type OperatorAccount = {
  userId: string
  email: string
  role: 'mevo_superadmin' | 'store_owner' | 'store_staff'
  isActive: boolean
  lastSignInText: string
  isSelf: boolean
}

export type AccountGroup = {
  key: string
  storeName: string
  storeId: string | null
  accounts: OperatorAccount[]
}

const MIN_PASSWORD_LENGTH = 8

// Format ngay ở server theo giờ Việt Nam: nếu để client tự toLocaleString thì chuỗi render
// lúc SSR và lúc hydrate lệch nhau (khác timezone máy) → React cảnh báo hydration mismatch.
function formatSignIn(iso: string | null): string {
  if (!iso) return 'Chưa đăng nhập lần nào'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}

// Danh sách MỌI tài khoản vận hành, nhóm theo quán (nhóm MEVO nội bộ xếp cuối).
// Quán chưa có tài khoản nào vẫn hiện nhóm rỗng — đó là tín hiệu onboarding còn dở.
export async function listOperatorAccounts(): Promise<AccountGroup[]> {
  const self = await requireSuperadmin()
  const admin = createAdminClient()

  const { data: ops, error: opError } = await admin
    .from('mevo_operators')
    .select('user_id, store_id, role, is_active')
  if (opError) throw new Error(`listOperatorAccounts(operators): ${opError.message}`)

  const { data: stores, error: storeError } = await admin
    .from('stores')
    .select('id, name')
    .order('name')
  if (storeError) throw new Error(`listOperatorAccounts(stores): ${storeError.message}`)

  const authUsers = await listAllAuthUsers(admin)
  const authById = new Map(authUsers.map((u) => [u.id, u]))

  const toAccount = (o: { user_id: string; role: string; is_active: boolean | null }): OperatorAccount => {
    const auth = authById.get(o.user_id)
    return {
      userId: o.user_id,
      email: auth?.email ?? '(không rõ email)',
      role: o.role as OperatorAccount['role'],
      isActive: o.is_active !== false,
      lastSignInText: formatSignIn(auth?.lastSignInAt ?? null),
      isSelf: o.user_id === self.userId,
    }
  }

  // Chủ quán xếp trước nhân viên, sau đó theo email — để mắt tìm đúng dòng cần.
  const sortAccounts = (list: OperatorAccount[]) =>
    list.sort((a, b) =>
      a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'store_owner' ? -1 : 1
    )

  const storeGroups: AccountGroup[] = (stores ?? []).map((s) => ({
    key: s.id as string,
    storeId: s.id as string,
    storeName: s.name as string,
    accounts: sortAccounts(
      (ops ?? []).filter((o) => o.store_id === s.id).map(toAccount)
    ),
  }))

  const mevoAccounts = sortAccounts((ops ?? []).filter((o) => o.store_id === null).map(toAccount))

  return mevoAccounts.length > 0
    ? [...storeGroups, { key: 'mevo', storeId: null, storeName: 'MEVO (nội bộ)', accounts: mevoAccounts }]
    : storeGroups
}

// Đặt lại mật khẩu cho một tài khoản vận hành. KHÔNG hỏi mật khẩu cũ — superadmin đặt hộ.
//
// Ba lớp chặn, vì đây là action mạnh nhất hệ thống:
//   1) Người gọi phải là mevo_superadmin (requireSuperadmin, không tin client);
//   2) userId đích BẮT BUỘC nằm trong mevo_operators — chặn kiểu gửi thẳng userId lạ vào action
//      để chiếm một tài khoản Auth bất kỳ;
//   3) Hai ô mật khẩu phải khớp và đủ dài.
// Mật khẩu không bao giờ được log hay trả ngược về client.
export async function resetOperatorPassword(
  userId: string,
  formData: FormData
): Promise<{ email: string }> {
  await requireSuperadmin()
  const admin = createAdminClient()

  const password = (formData.get('password') as string | null) ?? ''
  const confirm = (formData.get('password_confirm') as string | null) ?? ''

  if (!password || !confirm) throw new Error('Nhập mật khẩu mới ở cả hai ô')
  if (password !== confirm) throw new Error('Hai ô mật khẩu không khớp nhau')
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên`)
  }
  // Dấu cách đầu/cuối gần như luôn là lỗi copy-paste — chủ quán gõ lại sẽ không vào được.
  if (password !== password.trim()) throw new Error('Mật khẩu không được có dấu cách ở đầu hoặc cuối')

  const { data: target, error: targetError } = await admin
    .from('mevo_operators')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (targetError) throw new Error(`resetOperatorPassword(target): ${targetError.message}`)
  if (!target) throw new Error('Tài khoản này không phải tài khoản vận hành của MEVO')

  const { data: updated, error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) throw new Error(`resetOperatorPassword: ${error.message}`)

  revalidatePath('/mevo/accounts')
  return { email: updated.user?.email ?? '' }
}
