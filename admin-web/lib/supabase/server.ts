import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any

// Client thường — dùng anon key + cookie auth (cho Server Components đọc dữ liệu)
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<AnyDB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookie sẽ được set bởi proxy
          }
        },
      },
    }
  )
}

// Admin client — dùng service_role key, bypass RLS hoàn toàn
// Chỉ dùng trong Server Actions (không bao giờ expose ra client)
export function createAdminClient() {
  return createSupabaseClient<AnyDB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
