// Gợi ý slug URL-friendly từ tên quán tiếng Việt (bỏ dấu -> kebab-case).
// Chỉ là GỢI Ý phía client — server không dùng, stores.slug UNIQUE mới là chốt chặn.
// Tên không có ký tự Latin/số nào (vd tiếng Trung, Nhật, Hàn...) sẽ trả về '' —
// caller PHẢI kiểm tra SLUG_RE.test(...) trước khi auto-fill vào ô slug.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // bỏ dấu thanh/dấu mũ (combining marks sau NFD)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
