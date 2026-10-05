// Ô "Link Google Maps" ở Cài đặt quán (mig 090). Chỉ nhận https:// — Mini App mở thẳng link này
// trong Zalo nên tuyệt đối không lưu http:/javascript:… Rỗng = xoá link (app tự tìm theo địa chỉ).
export function normalizeMapsUrl(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = (raw ?? '').trim()
  if (!value) return { ok: true, value: null }
  if (!value.startsWith('https://')) return { ok: false, error: 'Link Google Maps phải bắt đầu bằng https://' }
  return { ok: true, value }
}
