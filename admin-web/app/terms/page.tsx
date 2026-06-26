import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng — Phở Gà PUBU",
  description: "Điều khoản sử dụng dịch vụ đặt món trực tuyến Phở Gà PUBU trên Zalo.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 font-sans text-gray-800">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Điều khoản Sử dụng</h1>
      <p className="mb-8 text-sm text-gray-500">Cập nhật lần cuối: 26/06/2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. Chấp nhận điều khoản</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Khi sử dụng ứng dụng đặt món <strong>Phở Gà PUBU</strong> trên Zalo, bạn đồng ý
          tuân thủ các điều khoản sau. Nếu không đồng ý, vui lòng không sử dụng ứng dụng.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Dịch vụ cung cấp</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Ứng dụng cho phép khách hàng đang có mặt tại nhà hàng <strong>Phở Gà PUBU</strong>
          quét mã QR trên bàn, xem thực đơn, đặt món và thanh toán qua ZaloPay hoặc tiền mặt.
          Ứng dụng chỉ dành cho khách đang có mặt trực tiếp tại quán.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Quy định đặt món</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            Đơn hàng chỉ được xử lý sau khi thanh toán thành công (ZaloPay) hoặc được nhân
            viên xác nhận (tiền mặt).
          </li>
          <li>Bạn chịu trách nhiệm về tính chính xác của đơn hàng trước khi xác nhận.</li>
          <li>
            Sau khi đơn vào bếp (trạng thái "Đang làm"), chúng tôi không thể hủy hoặc thay
            đổi đơn hàng.
          </li>
          <li>Mỗi mã QR chỉ hợp lệ cho bàn được chỉ định trên QR đó.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Thanh toán</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            Thanh toán qua ZaloPay được xử lý bởi Công ty ZaloPay. Chúng tôi không lưu trữ
            thông tin thẻ hay tài khoản ngân hàng của bạn.
          </li>
          <li>
            Giá niêm yết đã bao gồm thuế VAT (nếu có). Giá có thể thay đổi mà không báo
            trước — giá tại thời điểm đặt hàng là giá áp dụng.
          </li>
          <li>
            Hoàn tiền (nếu có) sẽ được xử lý qua ZaloPay trong vòng 7 ngày làm việc, tùy
            theo chính sách của ZaloPay.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Hành vi bị cấm</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>Quét QR bàn từ xa khi không có mặt tại nhà hàng.</li>
          <li>Sử dụng ứng dụng cho mục đích gian lận hoặc phi pháp.</li>
          <li>Can thiệp vào hoạt động kỹ thuật của ứng dụng.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Giới hạn trách nhiệm</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Chúng tôi không chịu trách nhiệm về các sự cố kỹ thuật ngoài tầm kiểm soát (mất
          điện, mất kết nối internet, sự cố từ phía Zalo/ZaloPay). Trong các trường hợp này,
          vui lòng liên hệ trực tiếp nhân viên tại quán.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">7. Liên hệ</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Mọi thắc mắc về điều khoản sử dụng, vui lòng liên hệ:
        </p>
        <address className="mt-2 not-italic text-sm text-gray-700">
          <strong>Phở Gà PUBU</strong><br />
          Địa chỉ: Lào Cai, Việt Nam<br />
          Email: <a href="mailto:mrtu.yb@gmail.com" className="text-blue-600 underline">mrtu.yb@gmail.com</a>
        </address>
      </section>

      <footer className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-400">
        © 2026 MEVO. Vận hành bởi Đỗ Đức Tú, Lào Cai, Việt Nam.
      </footer>
    </main>
  );
}
