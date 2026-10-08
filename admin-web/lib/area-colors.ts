// Màu nhận diện KHU (PA-3, 2026-10-08) — giống quy tắc màu mâm (lib/tray-colors.ts): chỉ NHẬN DIỆN, không
// phải trạng thái. Chấm/viền + chữ; nền ô bàn vẫn trắng. Cố tình KHÔNG có xanh lá / xanh dương / vàng / đỏ /
// cam / xám và các sắc sát chúng (teal, emerald, lime, sky, cyan, rose, amber, slate…) — quyết định 2026-10-02.
// Tông PASTEL (anh Tú 2026-10-08): chấm / vạch -300, nền -50, chữ đậm -700/-800 để vẫn đọc rõ.
// ⚠️ Tailwind v4 không safelist: mọi class phải là chuỗi NGUYÊN VẸN, không ghép động.

export type AreaColor = 'violet' | 'indigo' | 'purple' | 'fuchsia' | 'pink'

export const AREA_COLORS = [
  { key: 'violet', label: 'Tím', dot: 'bg-violet-300', chip: 'bg-violet-50 text-violet-700 ring-violet-200', header: 'bg-violet-50 text-violet-800 border-violet-100', bar: 'border-l-4 border-l-violet-300', text: 'text-violet-700' },
  { key: 'indigo', label: 'Chàm', dot: 'bg-indigo-300', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', header: 'bg-indigo-50 text-indigo-800 border-indigo-100', bar: 'border-l-4 border-l-indigo-300', text: 'text-indigo-700' },
  { key: 'purple', label: 'Tím đậm', dot: 'bg-purple-300', chip: 'bg-purple-50 text-purple-700 ring-purple-200', header: 'bg-purple-50 text-purple-800 border-purple-100', bar: 'border-l-4 border-l-purple-300', text: 'text-purple-700' },
  { key: 'fuchsia', label: 'Hồng tím', dot: 'bg-fuchsia-300', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', header: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-100', bar: 'border-l-4 border-l-fuchsia-300', text: 'text-fuchsia-700' },
  { key: 'pink', label: 'Hồng', dot: 'bg-pink-300', chip: 'bg-pink-50 text-pink-700 ring-pink-200', header: 'bg-pink-50 text-pink-800 border-pink-100', bar: 'border-l-4 border-l-pink-300', text: 'text-pink-700' },
] as const satisfies ReadonlyArray<{ key: AreaColor; label: string; dot: string; chip: string; header: string; bar: string; text: string }>

export function parseAreaColor(v: unknown): AreaColor {
  return AREA_COLORS.some((c) => c.key === v) ? (v as AreaColor) : 'violet'
}

export function areaColorClasses(c: unknown): (typeof AREA_COLORS)[number] {
  const key = parseAreaColor(c)
  return AREA_COLORS.find((x) => x.key === key)!
}

/** Màu cho khu mới: màu đầu tiên chưa dùng; dùng hết thì quay vòng theo số khu đang có. */
export function nextAreaColor(used: string[]): AreaColor {
  const free = AREA_COLORS.find((c) => !used.includes(c.key))
  return free ? free.key : AREA_COLORS[used.length % AREA_COLORS.length].key
}
