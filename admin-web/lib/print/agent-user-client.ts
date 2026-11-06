// CHỈ DÙNG TRONG SERVER (trang /print/agent). Ký JWT bằng SUPABASE_JWT_SECRET nên TUYỆT ĐỐI không import
// vào client — sẽ lộ secret. (Dự án không có gói `server-only`, nên chỉ cảnh báo bằng comment như kitchen-token.ts.)
//
// Mọi RPC in (get_sessions_bill, get_bills_report, get_reservation_preorder_print_job) kiểm quyền bằng
// auth.uid(), nên service role gọi sẽ bị từ chối. Thay vì vá các RPC, trang in ký JWT sống 120 giây mang danh
// người tạo phiếu (print_jobs.created_by) — cùng cách lib/kitchen-token.ts.
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { supabaseJwtSecret } from '@/lib/kitchen-token'

const TTL_SECONDS = 120

export async function createPrintUserClient(userId: string) {
  if (!userId) throw new Error('Thiếu người tạo phiếu')
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(supabaseJwtSecret())

  // accessToken đặt Authorization cho REST (như lib/supabase/kitchen-client.ts)
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken: async () => token,
  })
}
