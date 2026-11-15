// Bộ giao diện Mini App theo quán (stores.mini_app_theme, mig 134). Hàm thuần — không đụng DOM.
//   classic = giao diện gốc (Bảo Lương, Pubu) · garden = tối giản, nền kem (Yên Garden).
// Giá trị lạ / thiếu LUÔN rơi về classic: quán không đặt gì thì ra đúng giao diện cũ.

export type ThemeKey = "classic" | "garden";

export const THEME_KEYS: readonly ThemeKey[] = ["classic", "garden"];

export function resolveTheme(raw: unknown): ThemeKey {
  return raw === "garden" ? "garden" : "classic";
}

// Nhớ theme + màu của lần mở trước để lần sau vẽ đúng ngay khung đầu tiên (không nháy từ
// giao diện gốc sang giao diện quán). Mỗi quán là một Mini App riêng nên localStorage đã tách sẵn.
export const THEME_CACHE_KEY = "mevo_theme_v1";

export type ThemeSeed = { theme: ThemeKey; primary: string | null };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function encodeThemeSeed(seed: ThemeSeed): string {
  return JSON.stringify({ t: seed.theme, p: seed.primary });
}

export function decodeThemeSeed(raw: string | null | undefined): ThemeSeed | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { t?: unknown; p?: unknown };
    if (v === null || typeof v !== "object") return null;
    return { theme: resolveTheme(v.t), primary: typeof v.p === "string" && HEX.test(v.p) ? v.p : null };
  } catch {
    return null;
  }
}

/** Theme cho khung hình đầu tiên, trước khi đọc được quán từ DB.
 *  Ưu tiên: lần mở trước (cache) → gợi ý lúc build của instance (.env) → classic.
 *  DB vẫn là nguồn sự thật: đọc xong quán thì ghi đè. */
export function initialThemeSeed(cacheRaw: string | null | undefined, envTheme?: string, envPrimary?: string): ThemeSeed {
  const cached = decodeThemeSeed(cacheRaw);
  if (cached) return cached;
  return { theme: resolveTheme(envTheme), primary: envPrimary && HEX.test(envPrimary) ? envPrimary : null };
}
