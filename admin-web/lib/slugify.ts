// Goi y slug URL-friendly tu ten quan tieng Viet (bo dau -> kebab-case).
// Chi la GOI Y phia client — server khong dung, stores.slug UNIQUE moi la chot chan.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // bo dau thanh/dau mu (combining marks sau NFD)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
