// Webhook URL của Zalo OA. MEVO hiện KHÔNG xử lý event OA nào: thông báo đặt bàn cho chủ quán đi qua nhóm Zalo
// (ZCA relay) từ mig 063, luồng "nhắn mã MEVO vào OA" đã gỡ. Route chỉ còn trả 200 vì URL này đã khai trên Zalo
// Developer Console (Zalo cần 200 để coi webhook còn sống). App Sổ Tay Buôn Đá đã có Webhook URL riêng (2026-11-12)
// nên không còn chuyển tiếp gì từ đây.

export async function GET() {
  return Response.json({ ok: true })
}

export async function POST() {
  return Response.json({ ok: true })
}
