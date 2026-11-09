'use server'

import { revalidatePath } from 'next/cache'
import { requireOperator } from '@/lib/auth/operator'
import { createAdminClient, createClient } from '@/lib/supabase/server'

// Cài đặt In ấn — CHỈ chủ quán. Action dùng createAdminClient (bỏ qua RLS) nên PHẢI tự kiểm quyền và lọc
// store_id ở mọi truy vấn. Lỗi người dùng trả {ok:false,error}, không ném (Next production giấu nội dung lỗi ném).
type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

async function ownerStoreId(): Promise<{ storeId: string; userId: string } | Fail> {
  try {
    const op = await requireOperator()
    if (op.role !== 'store_owner' || !op.storeId) return fail('Chỉ chủ quán mới thao tác được ở đây')
    return { storeId: op.storeId, userId: op.userId }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Không xác định được tài khoản')
  }
}
const isFail = (v: unknown): v is Fail => !!v && typeof v === 'object' && (v as Fail).ok === false

const refresh = () => revalidatePath('/admin/settings')

export async function savePrintMode(mode: 'browser' | 'agent'): Promise<{ ok: true } | Fail> {
  if (mode !== 'browser' && mode !== 'agent') return fail('Chế độ in không hợp lệ')
  const who = await ownerStoreId()
  if (isFail(who)) return who
  const supabase = await createClient()
  // RPC kiểm lại is_store_owner_of — giữ nguyên câu lỗi RPC
  const { error } = await supabase.rpc('set_print_mode', { p_store_id: who.storeId, p_mode: mode })
  if (error) return fail(error.message)
  refresh()
  return { ok: true }
}

export async function savePrintStation(input: {
  id: string | null
  name: string
  printerName: string | null
}): Promise<{ ok: true; id: string } | Fail> {
  const who = await ownerStoreId()
  if (isFail(who)) return who
  const name = (input.name ?? '').trim()
  if (!name) return fail('Cần đặt tên cho trạm in')
  if (name.length > 60) return fail('Tên trạm tối đa 60 ký tự')
  const printerName = (input.printerName ?? '').trim() || null

  const admin = createAdminClient()
  if (input.id) {
    // Lọc store_id: không sửa được trạm của quán khác
    const { data, error } = await admin
      .from('print_stations')
      .update({ name, printer_name: printerName })
      .eq('id', input.id)
      .eq('store_id', who.storeId)
      .select('id')
    if (error) return fail(error.message)
    if (!data || data.length === 0) return fail('Không tìm thấy trạm của quán này')
    refresh()
    return { ok: true, id: input.id }
  }
  const { data, error } = await admin
    .from('print_stations')
    .insert({ store_id: who.storeId, name, printer_name: printerName })
    .select('id')
    .single()
  if (error || !data) return fail(error?.message ?? 'Không thêm được trạm')
  refresh()
  return { ok: true, id: (data as { id: string }).id }
}

export async function deletePrintStation(id: string): Promise<{ ok: true } | Fail> {
  const who = await ownerStoreId()
  if (isFail(who)) return who
  const admin = createAdminClient()
  const { data: st, error: readErr } = await admin
    .from('print_stations')
    .select('id, name, is_pos, is_default_kitchen')
    .eq('id', id)
    .eq('store_id', who.storeId)
    .maybeSingle()
  if (readErr) return fail(readErr.message)
  if (!st) return fail('Không tìm thấy trạm của quán này')
  if (st.is_pos || st.is_default_kitchen) return fail('Không xoá được trạm Quầy hoặc trạm Bếp mặc định')
  const { error } = await admin.from('print_stations').delete().eq('id', id).eq('store_id', who.storeId)
  if (error) return fail(error.message)
  refresh()
  return { ok: true }
}

export async function createPairCode(name: string): Promise<{ ok: true; code: string; expiresAt: string } | Fail> {
  const who = await ownerStoreId()
  if (isFail(who)) return who
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_print_pair_code', { p_store_id: who.storeId, p_name: name })
  if (error) return fail(error.message)
  const r = data as { code?: string; expires_at?: string } | null
  if (!r?.code || !r.expires_at) return fail('Không tạo được mã ghép')
  return { ok: true, code: r.code, expiresAt: r.expires_at }
}

export async function revokePrintAgent(agentId: string): Promise<{ ok: true } | Fail> {
  const who = await ownerStoreId()
  if (isFail(who)) return who
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_print_agent', { p_agent_id: agentId })
  if (error) return fail(error.message)
  refresh()
  return { ok: true }
}

// In thử một trạm: xếp một job kind 'test' (trang /print/agent vẽ phiếu mẫu). Mỗi lần một khoá ngẫu nhiên.
export async function enqueueTestPrint(stationId: string): Promise<{ ok: true } | Fail> {
  const who = await ownerStoreId()
  if (isFail(who)) return who
  const admin = createAdminClient()
  const { data: st, error: readErr } = await admin
    .from('print_stations')
    .select('id, name')
    .eq('id', stationId)
    .eq('store_id', who.storeId)
    .maybeSingle()
  if (readErr) return fail(readErr.message)
  if (!st) return fail('Không tìm thấy trạm của quán này')
  const { error } = await admin.from('print_jobs').insert({
    store_id: who.storeId,
    station_id: st.id,
    kind: 'test',
    ref: { label: `In thử · ${st.name}`, request: null },
    dedupe_key: `test:${crypto.randomUUID()}`,
    created_by: who.userId,
  })
  if (error) return fail(error.message)
  return { ok: true }
}
