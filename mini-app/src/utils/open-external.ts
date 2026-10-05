// Mở link RA NGOÀI (vd Google Maps để dẫn đường).
// - Trong Zalo: openOutApp → điện thoại mở thẳng ứng dụng Google Maps (openWebview chỉ mở khung web
//   trong Zalo, không dẫn đường được).
// - Ngoài Zalo (npm run dev, trình duyệt): zmp-sdk openOutApp/openWebview BÁO XONG NGAY mà không mở
//   gì (đo 2026-10-05) nên không dựa được vào kết quả → mở tab trình duyệt NGAY trong lúc bấm
//   (đồng bộ, để trình duyệt không chặn cửa sổ bật lên).
export function isZaloWebview(userAgent: string): boolean {
  return /\bZalo\b/i.test(userAgent);
}

export function openExternal(
  url: string,
  deps: { inZalo: boolean; openOutApp: (args: { url: string }) => Promise<void>; fallback: (url: string) => void },
): void {
  if (!deps.inZalo) {
    deps.fallback(url);
    return;
  }
  try {
    deps.openOutApp({ url }).catch(() => deps.fallback(url));
  } catch {
    deps.fallback(url);
  }
}
