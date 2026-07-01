import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách bảo mật — Phở Gà PUBU",
  description: "Chính sách thu thập và xử lý dữ liệu cá nhân của ứng dụng đặt món Phở Gà PUBU trên Zalo.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 font-sans text-gray-800">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Chính sách Bảo mật</h1>
      <p className="mb-8 text-sm text-gray-500">Cập nhật lần cuối: 26/06/2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. Giới thiệu</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Ứng dụng đặt món <strong>Phở Gà PUBU</strong> ("ứng dụng") thuộc sở hữu và kinh
          doanh bởi <strong>Hộ kinh doanh Phở Gà PUBU</strong>, được xây dựng và vận hành kỹ
          thuật bởi <strong>MEVO</strong>. Chúng tôi cam kết bảo vệ quyền riêng tư và dữ liệu
          cá nhân của người dùng. Chính sách này mô tả rõ loại dữ liệu chúng tôi thu thập,
          mục đích sử dụng và quyền của bạn.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Dữ liệu chúng tôi thu thập</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            <strong>Zalo User ID</strong> — được Zalo cung cấp khi bạn sử dụng ứng dụng qua
            nền tảng Zalo. Chúng tôi không yêu cầu tên thật, số điện thoại hay thông tin
            nhận dạng khác.
          </li>
          <li>
            <strong>Thông tin bàn</strong> — số bàn bạn đang ngồi, được đọc từ mã QR bạn
            quét. Không lưu vị trí GPS.
          </li>
          <li>
            <strong>Thông tin đơn hàng</strong> — tên món, số lượng, ghi chú, tổng tiền,
            phương thức thanh toán và thời gian đặt.
          </li>
          <li>
            <strong>Trạng thái theo dõi OA</strong> — chúng tôi ghi nhận nếu bạn đã được
            nhắc quan tâm Zalo Official Account để gửi thông báo. Thông tin này chỉ lưu trên
            thiết bị của bạn (localStorage).
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Mục đích sử dụng dữ liệu</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>Xử lý và theo dõi đơn hàng của bạn trong thời gian thực.</li>
          <li>
            Gửi thông báo Zalo (ZNS) khi món ăn đã sẵn sàng — chỉ khi bạn đã quan tâm
            Official Account của quán.
          </li>
          <li>
            Xác định đơn hàng của bạn tại bàn trong phiên hiện tại (trong vòng 6 giờ).
          </li>
          <li>Thống kê doanh thu nội bộ cho nhà hàng.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Chia sẻ dữ liệu với bên thứ ba</h2>
        <p className="mb-2 text-sm leading-relaxed text-gray-700">
          Chúng tôi <strong>không bán</strong> dữ liệu của bạn. Dữ liệu chỉ được chia sẻ với
          các bên sau để thực hiện dịch vụ:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            <strong>Zalo / ZaloPay</strong> — để xử lý thanh toán và gửi thông báo ZNS, theo
            chính sách của Zalo tại zalo.me.
          </li>
          <li>
            <strong>Supabase (Singapore)</strong> — dịch vụ cơ sở dữ liệu lưu trữ đơn hàng,
            có chứng nhận SOC 2.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Lưu trữ và xóa dữ liệu</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>Dữ liệu đơn hàng được lưu trữ trong tối đa <strong>12 tháng</strong> kể từ ngày tạo.</li>
          <li>
            Dữ liệu trên thiết bị (localStorage) chỉ tồn tại đến khi bạn xóa cache hoặc
            gỡ cài đặt Zalo.
          </li>
          <li>
            Nếu bạn muốn yêu cầu xóa dữ liệu, vui lòng liên hệ chúng tôi theo thông tin
            bên dưới.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Quyền của bạn</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>Quyền truy cập và xem dữ liệu của bạn.</li>
          <li>Quyền yêu cầu xóa dữ liệu.</li>
          <li>Quyền từ chối quan tâm OA mà không ảnh hưởng đến việc đặt món.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">7. Bảo mật</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Dữ liệu được truyền qua kết nối HTTPS mã hóa. Truy cập cơ sở dữ liệu được kiểm
          soát bằng Row Level Security (RLS). Chúng tôi không lưu mật khẩu hay thông tin
          thanh toán — toàn bộ giao dịch được xử lý bởi ZaloPay.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">8. Thay đổi chính sách</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Chúng tôi có thể cập nhật chính sách này. Ngày "Cập nhật lần cuối" ở đầu trang sẽ
          phản ánh thay đổi mới nhất. Tiếp tục sử dụng ứng dụng sau khi chính sách được cập
          nhật đồng nghĩa với việc bạn chấp nhận phiên bản mới.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">9. Liên hệ</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          Mọi thắc mắc về quyền riêng tư, vui lòng liên hệ:
        </p>
        <address className="mt-2 not-italic text-sm text-gray-700">
          <strong>Hộ kinh doanh Phở Gà PUBU</strong><br />
          Chủ hộ kinh doanh: Đoàn Ngọc Hiến<br />
          Mã số hộ kinh doanh: 034088018267<br />
          Địa chỉ: Số nhà 155, đường Đinh Tiên Hoàng, Tổ dân phố Đồng Tâm 9, Phường Yên Bái, Tỉnh Lào Cai<br />
          Điện thoại: 0866491988<br />
          Email: <a href="mailto:mrtu.yb@gmail.com" className="text-blue-600 underline">mrtu.yb@gmail.com</a>
        </address>
      </section>

      <footer className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-400">
        © 2026 Hộ kinh doanh Phở Gà PUBU. Vận hành kỹ thuật bởi MEVO.
      </footer>
    </main>
  );
}
