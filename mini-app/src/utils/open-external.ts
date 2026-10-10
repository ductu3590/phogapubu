// Mở link RA NGOÀI (vd Google Maps để dẫn đường).
// - Trong Zalo: openWebview (API CHÍNH THỨC). ⚠️ 2026-10-09: openOutApp KHÔNG có trong danh sách API công khai
//   của Zalo Mini App — trên Zalo thật bấm "Chỉ đường" không mở gì mà cũng không báo lỗi. openWebview mở trang
//   Google Maps trong Zalo; từ đó khách bấm "Chỉ đường"/"Mở ứng dụng" của Google Maps.
// - Ngoài Zalo (npm run dev, trình duyệt): zmp-sdk openOutApp/openWebview BÁO XONG NGAY mà không mở
//   gì (đo 2026-10-05) nên không dựa được vào kết quả → mở tab trình duyệt NGAY trong lúc bấm
//   (đồng bộ, để trình duyệt không chặn cửa sổ bật lên).
export function isZaloWebview(userAgent: string): boolean {
  // Không dùng ranh giới từ: UA thật có thể là "ZaloTheme/light", "Zalo android/…", "Zalo iOS/…".
  return /zalo/i.test(userAgent);
}

export function openExternal(
  url: string,
  deps: { inZalo: boolean; openInZalo: (args: { url: string }) => Promise<unknown>; fallback: (url: string) => void },
): void {
  if (!deps.inZalo) {
    deps.fallback(url);
    return;
  }
  try {
    deps.openInZalo({ url }).catch(() => deps.fallback(url));
  } catch {
    deps.fallback(url);
  }
}
