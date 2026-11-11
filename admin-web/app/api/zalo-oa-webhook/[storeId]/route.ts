import { forwardToSoTay, isSoTayEvent } from '@/lib/zalo/so-tay-forward'

// Webhook URL của Zalo OA. MEVO hiện KHÔNG xử lý event OA nào: thông báo đặt bàn cho chủ quán đi qua
// nhóm Zalo (ZCA relay) từ mig 063, luồng "nhắn mã MEVO vào OA để nhận thông báo" đã gỡ. Route được giữ
// vì URL này đã khai trên Zalo Developer Console (Zalo cần 200 để coi webhook còn sống) và vì nó là
// Webhook URL chung của cả tổ chức Zalo → event Mini App của Sổ Tay cũng đổ về đây.

export async function GET() {
  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (isSoTayEvent(rawBody)) {
    return forwardToSoTay(rawBody, request.headers.get('x-zevent-signature') ?? '')
  }
  return Response.json({ ok: true })
}
