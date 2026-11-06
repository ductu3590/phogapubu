import QRCode from 'qrcode'

// Vùng yên tĩnh (module) quanh mã: chuẩn QR yêu cầu tối thiểu 4.
export const VIETQR_QUIET_ZONE = 4

// Vẽ SVG ĐỒNG BỘ ngay lần render đầu (không useEffect/toDataURL): trang in gọi window.print()
// ngay sau khi mount, ảnh dựng bất đồng bộ không nằm trong danh sách chờ nên tờ in có thể mất mã.
export default function VietQrCode({ payload, size }: { payload: string; size: number | string }) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const total = n + 2 * VIETQR_QUIET_ZONE
  const data = qr.modules.data

  // Gộp các module đen liền nhau trên một hàng thành một đoạn "M{x} {y}h{n}v1h-{n}z".
  let d = ''
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      if (!data[y * n + x]) {
        x++
        continue
      }
      const start = x
      while (x < n && data[y * n + x]) x++
      const run = x - start
      d += `M${start + VIETQR_QUIET_ZONE} ${y + VIETQR_QUIET_ZONE}h${run}v1h-${run}z`
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Mã VietQR"
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
