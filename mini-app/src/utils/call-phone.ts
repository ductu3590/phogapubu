// Gọi điện cho quán. Trong Zalo link `tel:` không mở được màn gọi → dùng openPhone (API chính thức zmp-sdk);
// ngoài Zalo (npm run dev, trình duyệt) openPhone không làm gì → dùng `tel:`. Lỗi trong Zalo cũng rơi về `tel:`.
export function callPhone(
  phone: string,
  deps: { inZalo: boolean; openInZalo: (args: { phoneNumber: string }) => Promise<unknown>; fallback: (telUrl: string) => void },
): void {
  // Bỏ dấu cách/chấm/gạch, giữ chữ số và dấu + (mã quốc tế).
  const phoneNumber = phone.replace(/[^\d+]/g, "");
  const tel = `tel:${phoneNumber}`;
  if (!deps.inZalo) {
    deps.fallback(tel);
    return;
  }
  try {
    deps.openInZalo({ phoneNumber }).catch(() => deps.fallback(tel));
  } catch {
    deps.fallback(tel);
  }
}
