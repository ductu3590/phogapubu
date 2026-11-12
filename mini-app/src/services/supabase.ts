import { PostgrestClient } from '@supabase/postgrest-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env')
}

export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseKey

// Mini-app chỉ đọc/ghi qua PostgREST (.from / .rpc) bằng khoá công khai — KHÔNG đăng nhập,
// không Storage. Dùng thẳng PostgrestClient thay cho createClient() của supabase-js: bản đầy đủ
// kéo theo auth-js + storage-js + realtime-js (hơn nửa file JS đầu tiên) mà lúc mở app không
// dùng tới. Header gửi đi y như supabase-js khi không có phiên: apikey + Bearer <anon key>.
// Realtime (2 trang theo dõi đơn) nằm ở supabase-realtime.ts, chỉ tải khi mở các trang đó.
export const supabase = new PostgrestClient<Database, { PostgrestVersion: '12' }>(`${supabaseUrl}/rest/v1`, {
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
})
