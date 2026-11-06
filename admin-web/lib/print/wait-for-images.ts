// Chờ mọi ảnh trên trang (logo, QR) giải mã xong; ảnh lỗi cũng bỏ qua, không kẹt in.
export async function waitForImages(): Promise<void> {
  await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)))
}
