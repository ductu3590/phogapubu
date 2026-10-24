// Nội dung landing. Chỉ ghi điều có thật; chỗ chưa có dữ liệu để rõ là "chờ bổ sung".
import type { LucideIcon } from 'lucide-react'
import {
  BedDouble, BellRing, Bot, CalendarClock, Coffee, FlaskConical, Globe, LayoutDashboard,
  Lightbulb, QrCode, Rocket, Search, Settings2, Smartphone, Soup, Beer, Printer, Wallet, Workflow,
} from 'lucide-react'

export type Feature = { icon: LucideIcon; title: string; body: string }

export const FNB_FEATURES: Feature[] = [
  { icon: QrCode, title: 'Gọi món qua QR tại bàn, tại phòng', body: 'Khách quét mã dán ở bàn hoặc phòng, xem menu có ảnh, chọn món, ghi chú và gửi đơn ngay trên điện thoại. Không cần tải app.' },
  { icon: CalendarClock, title: 'Đặt bàn trước', body: 'Khách chọn giờ và số người, quán tiếp nhận trên admin. Bàn được giữ trên sơ đồ, tránh trùng giờ.' },
  { icon: LayoutDashboard, title: 'Admin web realtime', body: 'Sơ đồ bàn, đơn mới có chuông báo, ghép bàn cho khách đoàn, thu ngân xem cả quán trên một màn hình.' },
  { icon: Wallet, title: 'Thanh toán VietQR về thẳng tài khoản quán', body: 'Khách chuyển khoản bằng mã QR, tiền vào tài khoản của quán, không qua tài khoản trung gian.' },
  { icon: Printer, title: 'In bill và phiếu bếp', body: 'In hoá đơn và phiếu cho bếp từ máy in nhiệt 80mm, món nào bếp làm món đó.' },
  { icon: BellRing, title: 'Thông báo chuyển khoản', body: 'Có giao dịch là có thông báo, chủ quán và thu ngân đỡ phải nhìn app ngân hàng liên tục.' },
]

export type Model = { icon: LucideIcon; title: string; body: string; tag: string }

export const FNB_MODELS: Model[] = [
  { icon: Coffee, tag: 'Trả trước', title: 'Cafe, trà sữa: tại bàn hoặc mang đi', body: 'Khách gọi và thanh toán trước, quầy nhận đơn ngay. Phù hợp quán đông khách, nhiều đơn mang đi.' },
  { icon: Soup, tag: 'Trả trước', title: 'Phở, bún, quán ăn nhanh', body: 'Thanh toán xong đơn mới vào bếp, giảm đơn ảo do ai đó quét QR từ xa.' },
  { icon: Beer, tag: 'Trả sau', title: 'Quán nhậu, bia lẩu', body: 'Mở bàn, khách gọi nhiều lượt, thu tiền cuối bill. Có ghép mâm cho đoàn đông và gộp bill khi tính tiền.' },
  { icon: BedDouble, tag: 'Theo phòng/giường', title: 'Nhà ăn bệnh viện', body: 'Gọi món theo phòng hoặc giường bệnh, bếp biết giao món đến đâu. Cấu hình theo từng cơ sở khi triển khai.' },
]

export type Service = { icon: LucideIcon; title: string; body: string; points: string[] }

export const SERVICES: Service[] = [
  { icon: Smartphone, title: 'Zalo Mini App theo yêu cầu', body: 'Thiết kế và lập trình ứng dụng chạy ngay trong Zalo, khách không cần cài thêm gì.', points: ['Đặt hàng, đặt lịch, tra cứu, ghi sổ', 'Kết nối dữ liệu và thông báo qua Zalo'] },
  { icon: Workflow, title: 'Tự động hoá quy trình', body: 'Giảm việc tay lặp đi lặp lại bằng chatbot và các luồng tự chạy.', points: ['Chatbot Zalo, Messenger', 'n8n: nối các phần mềm với nhau', 'Thông báo giao dịch ngân hàng vào nhóm Zalo'] },
  { icon: Globe, title: 'Website và hạ tầng', body: 'Có web chạy ổn định, được chăm sóc đều, không để chủ doanh nghiệp tự xoay xở.', points: ['Thiết kế website, WordPress', 'Chuyển máy chủ, chuyển tên miền', 'Bảo trì, sao lưu, xử lý sự cố'] },
  { icon: Bot, title: 'Tư vấn chuyển đổi số và ứng dụng AI', body: 'Rà lại cách làm việc hiện tại, chọn phần mềm và AI vừa túi tiền, đưa vào quy trình thật.', points: ['Chọn giải pháp SaaS phù hợp', 'Đưa AI vào công việc hằng ngày', 'Hướng dẫn nhân sự dùng được'] },
]

export type Product = { name: string; tag: string; tagTone: 'ok' | 'soon'; body: string; shot: string }

export const PRODUCTS: Product[] = [
  { name: 'MEVO tại Bảo Lương và Pubu', tag: 'Đã triển khai', tagTone: 'ok', body: 'Gọi món QR và quản lý quán, triển khai tại Bia lẩu Bảo Lương (trả sau) và Phở Gà Pubu (trả trước), Lào Cai.', shot: 'Màn hình admin / gọi món' },
  { name: 'Sổ Chung Đá', tag: 'Zalo Mini App', tagTone: 'ok', body: 'Zalo Mini App dành cho giới buôn đá ở Lục Yên, Yên Bái.', shot: 'Màn hình Mini App' },
  { name: 'ThầuGPT', tag: 'Sắp ra mắt', tagTone: 'soon', body: 'Trợ lý AI hỗ trợ công việc đấu thầu.', shot: 'Bản xem trước' },
  { name: 'App quản lý giải pickleball', tag: 'Đã làm', tagTone: 'ok', body: 'Ứng dụng quản lý giải đấu pickleball, lịch thi đấu và kết quả.', shot: 'Màn hình ứng dụng' },
]

export type Step = { icon: LucideIcon; title: string; body: string }

export const STEPS: Step[] = [
  { icon: Search, title: 'Khảo sát', body: 'Tôi đến hoặc gọi trao đổi, xem quán đang vận hành thế nào: mấy bàn, ai gọi món, thu tiền ra sao, bếp nhận đơn bằng gì.' },
  { icon: Settings2, title: 'Cấu hình', body: 'Dựng menu, sơ đồ bàn, mã QR và cách thanh toán đúng mô hình của quán. Không bắt quán đổi cách làm cho vừa phần mềm.' },
  { icon: FlaskConical, title: 'Chạy thử', body: 'Chạy thử với đơn thật trong thời gian ngắn, cùng nhân viên sửa những chỗ chưa tiện trước khi mở cho khách.' },
  { icon: Rocket, title: 'Vận hành', body: 'Hướng dẫn nhân viên, theo sát những ngày đầu, sau đó hỗ trợ và cập nhật khi quán cần.' },
]

// Dải chạy ngang dưới hero: những việc MEVO làm được (KHÔNG phải logo khách hàng — chưa có thì không bịa).
export const CAPABILITIES: { icon: LucideIcon; label: string }[] = [
  { icon: QrCode, label: 'Gọi món QR' },
  { icon: CalendarClock, label: 'Đặt bàn' },
  { icon: LayoutDashboard, label: 'Sơ đồ bàn realtime' },
  { icon: Wallet, label: 'VietQR' },
  { icon: Printer, label: 'In bill 80mm' },
  { icon: BellRing, label: 'Loa đọc đơn' },
  { icon: Smartphone, label: 'Zalo Mini App' },
  { icon: Workflow, label: 'Tự động hoá n8n' },
  { icon: Globe, label: 'Website' },
  { icon: Lightbulb, label: 'Trợ lý AI' },
]

export const FAQS: { q: string; a: string }[] = [
  { q: 'Khách có phải tải app hay đăng ký tài khoản không?', a: 'Không. Khách quét mã QR ở bàn bằng Zalo hoặc camera điện thoại, menu mở ngay trong Zalo. Không cần cài thêm ứng dụng, không cần tạo tài khoản.' },
  { q: 'Tiền khách thanh toán về tài khoản của ai?', a: 'Về thẳng tài khoản ngân hàng của quán. MEVO chỉ làm và vận hành phần mềm, không giữ tiền của quán.' },
  { q: 'Quán nhậu tính tiền cuối bữa có dùng được không?', a: 'Được. MEVO có mô hình trả sau: mở bàn, khách gọi nhiều lượt, thu ngân thu tiền một lần khi khách về, có ghép mâm cho đoàn đông và gộp bill.' },
  { q: 'Quán cần chuẩn bị thiết bị gì?', a: 'Một máy tính hoặc máy tính bảng có trình duyệt để làm quầy, điện thoại cho nhân viên nếu cần, và máy in nhiệt 80mm nếu muốn in bill, phiếu bếp. Tôi sẽ tư vấn cụ thể khi khảo sát, tận dụng đồ quán đang có.' },
  { q: 'Dữ liệu của quán có an toàn không?', a: 'Dữ liệu lưu trên Supabase, máy chủ đặt tại Singapore. Mỗi tài khoản chỉ xem được dữ liệu của đúng quán mình, nhân viên và thu ngân được phân quyền riêng.' },
  { q: 'Chi phí triển khai bao nhiêu?', a: 'Tuỳ mô hình quán, số bàn và phần việc cần làm. Tôi khảo sát trước rồi mới báo giá cụ thể. Nhắn Zalo để trao đổi, chưa cần quyết định gì.' },
]
