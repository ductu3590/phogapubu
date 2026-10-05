// Mở link RA NGOÀI Zalo (vd Google Maps để dẫn đường). Trong Zalo dùng openOutApp → điện thoại mở
// thẳng ứng dụng Google Maps (openWebview chỉ mở khung web trong Zalo, không dẫn đường được).
// Ngoài Zalo (npm run dev / trình duyệt) openOutApp TREO IM — không xong, không lỗi — nên phải có
// hạn chờ: quá timeoutMs hoặc lỗi thì mở bằng trình duyệt. Luôn chỉ mở một lần.
export function openExternal(
  url: string,
  deps: { openOutApp: (args: { url: string }) => Promise<void>; fallback: (url: string) => void; timeoutMs?: number },
): void {
  let settled = false;
  const useFallback = () => {
    if (settled) return;
    settled = true;
    deps.fallback(url);
  };
  const timer = setTimeout(useFallback, deps.timeoutMs ?? 1500);
  try {
    deps.openOutApp({ url }).then(
      () => { if (!settled) { settled = true; clearTimeout(timer); } },
      () => { clearTimeout(timer); useFallback(); },
    );
  } catch {
    clearTimeout(timer);
    useFallback();
  }
}
