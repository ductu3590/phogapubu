'use client'

import { Banner } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { clock } from '@/lib/pos-timeline'
import type { Outage, OutageOrders } from '@/lib/pos-offline-watch'

// Băng ở POS khi mất mạng (đủ 60 giây) và khi vừa có mạng lại.
// Mỗi câu có số / giờ dựng thành MỘT chuỗi (một text node) để so khớp nguyên câu trong test.
// Đang mất mạng: băng đỏ, không đóng được. Có mạng lại: băng vàng nhắc lượt món khách gọi lúc mất mạng.
export default function OfflineBanner({
  downSince,
  outage,
  onDismiss,
  onShowOrders,
}: {
  downSince: number | null
  outage: (Outage & OutageOrders) | null
  onDismiss: () => void
  onShowOrders: () => void
}) {
  if (downSince !== null) {
    return (
      <div className="mx-4 mt-2 space-y-2 md:mx-5">
        <Banner tone="error" title={`Mất mạng từ ${clock(downSince)}`}>
          Các nút sẽ báo lỗi. Mất lâu thì làm theo tờ quy trình mất mạng.
        </Banner>
      </div>
    )
  }
  if (!outage || (outage.review <= 0 && outage.autoKitchen <= 0)) return null

  const reviewLine =
    outage.review > 0 && outage.firstAt !== null
      ? `Có ${outage.review} lượt món gọi lúc mất mạng (từ ${clock(outage.firstAt)}). Hỏi lại khách trước khi duyệt; đã nhập tay rồi thì Từ chối.`
      : null
  const kitchenLine =
    outage.autoKitchen > 0 ? `Có ${outage.autoKitchen} đơn tự vào bếp lúc mất mạng: kiểm tra bếp đã có phiếu chưa.` : null

  return (
    <div className="mx-4 mt-2 space-y-2 md:mx-5">
      <Banner
        tone="warning"
        title="Vừa có mạng lại"
        onClose={onDismiss}
        action={
          outage.review > 0 ? (
            <Button onClick={onShowOrders} className="min-h-9 md:min-h-9">Xem lượt chờ duyệt</Button>
          ) : undefined
        }
      >
        {reviewLine && <div>{reviewLine}</div>}
        {kitchenLine && <div>{kitchenLine}</div>}
      </Banner>
    </div>
  )
}
