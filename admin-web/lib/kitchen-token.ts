// Ký token bếp (server-only). Token là JWT HS256 ký bằng SUPABASE_JWT_SECRET,
// để Supabase (PostgREST + Realtime) chấp nhận role `kitchen` với scope store_id.
// TUYỆT ĐỐI không import file này vào client — sẽ lộ secret.
import { SignJWT } from 'jose'

const ONE_YEAR = 60 * 60 * 24 * 365

function secretKey(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) {
    throw new Error(
      'Thiếu SUPABASE_JWT_SECRET (Supabase → Settings → API → JWT Secret). ' +
        'Đặt vào env admin-web, KHÔNG dùng tiền tố NEXT_PUBLIC_.',
    )
  }
  return new TextEncoder().encode(s)
}

/**
 * Ký token bếp cho 1 quán. Claim:
 *  - role: 'kitchen'  → PostgREST/Realtime SET ROLE kitchen
 *  - store_id         → RLS kitchen_store_id() scope đúng quán
 *  - kv               → khớp stores.kitchen_token_version (thu hồi = bump version)
 */
export async function signKitchenToken(storeId: string, kv: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ role: 'kitchen', store_id: storeId, kv })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ONE_YEAR)
    .sign(secretKey())
}
