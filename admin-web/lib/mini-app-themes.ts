// Bộ giao diện Mini App mà quán chọn được (stores.mini_app_theme, mig 134).
// Danh sách này PHẢI khớp CHECK stores_mini_app_theme_check và ThemeKey ở mini-app/src/utils/theme.ts.
export const MINI_APP_THEMES = [
  { key: 'classic', label: 'Mặc định', hint: 'Nền xám nhạt, thẻ trắng, thanh giỏ tối. Bảo Lương và Pubu đang dùng.' },
  { key: 'garden', label: 'Sân vườn (tối giản)', hint: 'Nền kem, phẳng, ít viền. Dựng cho Yên Garden.' },
] as const

export type MiniAppTheme = (typeof MINI_APP_THEMES)[number]['key']

export function isMiniAppTheme(value: unknown): value is MiniAppTheme {
  return MINI_APP_THEMES.some((t) => t.key === value)
}
