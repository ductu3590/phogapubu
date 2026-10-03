// Màu chủ đạo theo quán (theme runtime, stores.primary_color).
// Đặt HAI biến CSS: --color-primary (hex, cho chỗ dùng thẳng) và --color-primary-rgb ("r g b",
// cho Tailwind `rgb(var(--color-primary-rgb) / <alpha-value>)`). Thiếu biến rgb thì các class
// có độ mờ như `bg-primary/10` không ra màu nào — var(hex) không nhận được alpha.

export const DEFAULT_PRIMARY = "#A0673D";

/** "#C0341A" | "#c34" → "192 52 26". Mã không hợp lệ → null. */
export function hexToRgbChannels(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Áp màu quán; màu rỗng hoặc sai định dạng thì rơi về màu mặc định, không để nút mất màu. */
export function applyPrimaryColor(hex: string | null | undefined, root: HTMLElement = document.documentElement) {
  const channels = hex ? hexToRgbChannels(hex) : null;
  const safeHex = channels ? (hex as string).trim() : DEFAULT_PRIMARY;
  root.style.setProperty("--color-primary", safeHex.startsWith("#") ? safeHex : `#${safeHex}`);
  root.style.setProperty("--color-primary-rgb", channels ?? (hexToRgbChannels(DEFAULT_PRIMARY) as string));
}
