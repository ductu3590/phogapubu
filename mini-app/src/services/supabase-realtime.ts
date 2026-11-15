import { RealtimeClient } from '@supabase/realtime-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase'

// Realtime tách khỏi client chính để không nằm trong lần tải đầu: chỉ trang Trạng thái đơn và
// Đơn gọi dùng. Khởi tạo đúng như supabase-js làm khi không có phiên đăng nhập:
// wss://<project>/realtime/v1, params.apikey, accessToken = khoá công khai.
let client: RealtimeClient | null = null

export function realtime(): RealtimeClient {
  if (!client) {
    const url = new URL('realtime/v1', SUPABASE_URL.endsWith('/') ? SUPABASE_URL : `${SUPABASE_URL}/`)
    url.protocol = url.protocol.replace('http', 'ws')
    client = new RealtimeClient(url.href, {
      params: { apikey: SUPABASE_ANON_KEY },
      accessToken: async () => SUPABASE_ANON_KEY,
    })
  }
  return client
}
