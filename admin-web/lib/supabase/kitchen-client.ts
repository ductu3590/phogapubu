import { createClient } from '@supabase/supabase-js'

// Client cho màn hình bếp: KHÔNG dùng phiên Supabase Auth (cookie), mà gắn thẳng
// token bếp (role 'kitchen', scope store_id). `accessToken` đặt Authorization cho cả
// REST lẫn Realtime → realtime cũng chạy dưới RLS role kitchen.
export function createKitchenClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => token,
    },
  )
}
