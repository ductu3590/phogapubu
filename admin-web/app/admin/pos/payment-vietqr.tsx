import VietQrCode from '@/components/vietqr-code'
import type { BillQr } from '@/lib/bill-qr'

// Mã VietQR ở màn Thanh toán POS. Không có nút "Đã nhận tiền" riêng: thu ngân vẫn bấm nút xác nhận có sẵn.
export default function PaymentVietQr({ qr }: { qr: BillQr | null }) {
  if (!qr) return null
  return (
    <section className="mt-3 flex flex-col items-center rounded-lg border border-slate-200 bg-white p-3 text-center">
      <p className="mb-2 text-[12px] font-bold tracking-wide text-slate-700 uppercase">Mã VietQR</p>
      <VietQrCode payload={qr.payload} size={176} />
      <p className="mt-2 text-xl font-bold text-orange-600 tabular">{qr.amount.toLocaleString('vi-VN')}đ</p>
      <p className="text-sm font-semibold text-slate-800">{qr.bankName} · {qr.accountNumber}</p>
      <p className="text-[13px] text-slate-600">{qr.accountName}</p>
      <p className="mt-1 text-[13px] text-slate-600">Nội dung: <b className="font-bold text-slate-800">{qr.memo}</b></p>
    </section>
  )
}
