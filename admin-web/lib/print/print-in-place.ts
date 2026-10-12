// In ngầm: nạp trang in (phiếu bếp/bàn, hoá đơn 80mm) vào iframe ẩn ngay trong POS thay vì mở tab mới.
// Trang in tự gọi window.print() sau khi dựng xong (xem print-order.tsx / print-bill.tsx), nên ở đây chỉ
// cần giữ iframe sống cho tới khi in xong rồi dọn. POS giữ nguyên tab, không bị trình duyệt chặn popup.
// Khi Chrome chạy với --kiosk-printing thì in thẳng ra máy in mặc định, không hiện hộp thoại.
const GIU_TOI_DA_MS = 120_000

export function printInPlace(url: string): void {
  if (typeof document === 'undefined') return
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Không dùng display:none — vài bản Chrome in ra trang trắng với iframe bị ẩn hẳn.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    frame.remove()
  }

  frame.addEventListener('load', () => {
    // afterprint bắn cả khi người dùng huỷ hộp thoại in, nên không bao giờ kẹt iframe.
    frame.contentWindow?.addEventListener('afterprint', () => setTimeout(cleanup, 500))
  })
  setTimeout(cleanup, GIU_TOI_DA_MS)

  frame.src = url
  document.body.appendChild(frame)
}
