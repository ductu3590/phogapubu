# TEST — Bia lẩu Bảo Lương (Sprint 1 + Sprint 2)

> **File này là bản dành riêng cho anh Tú.** Nó gộp mọi thứ cần làm để đưa quán **Bia lẩu Bảo
> Lương** lên chạy thật: việc anh phải tự làm, việc đã làm sẵn, và các bài test theo đúng thứ tự
> bấm. `TESTING.md` là bộ nhớ chung của cả dự án — file này mới là thứ cầm theo lúc ngồi test.
>
> Phạm vi: **trả sau + phiên bàn** (Sprint 1, mig 039) và **lớp Mâm cho khách đoàn**
> (Sprint 2, mig 040–041).
>
> Quy ước: ⭐ = bài quan trọng nhất, hỏng là dừng luôn. ☐ = tick khi xong.

---

## 0. Hiện trạng — cái gì xong, cái gì chưa

| Thứ | Trạng thái |
|---|---|
| Quán trong DB | ✅ `Bia lẩu Bảo Lương`, slug `bia-lau-bao-luong`, **20 bàn**, chế độ **Trả sau** |
| Tài khoản chủ quán | ✅ `baoluong@mevo.vn` (anh vừa tạo) |
| Zalo Mini App | ✅ ID `671794256689452743` — ⚠️ *chưa xác thực giấy tờ sở hữu* |
| Thư mục deploy riêng của quán | ✅ `mini-app-instances/bia-lau-bao-luong/` — đã điền sẵn `.env`, đã merge code mới, đã `npm install` |
| Zalo OA | ⛔ **không làm** (không có nhu cầu) → không có ZNS báo "món xong". Trả sau thì nhân viên bưng ra tận mâm nên không thiếu gì |
| ZaloPay merchant / Checkout | ⛔ **không cần** — thu tại quầy bằng QR loa sẵn có của quán |
| **Menu + giá** | ❌ **CHƯA CÓ MÓN NÀO** — anh phải nhập, xem mục 1 |
| Mật khẩu `baoluong@mevo.vn` | ⚠️ nếu chưa copy kịp thì đặt lại ở Supabase Dashboard → Authentication → Users |

**Cột mốc:** làm xong mục 1 là test được **toàn bộ nhóm A/B/C** mà **không cần** Zalo duyệt gì.
Nhóm D (khách quét QR thật) mới cần deploy Mini App.

---

## 1. Việc anh phải làm trước — khoảng 45 phút

### ☐ 1.1. Đăng nhập và đổi mật khẩu

Vào `/login` bằng `baoluong@mevo.vn`. Không vào được thì đặt lại mật khẩu tại
https://supabase.com/dashboard/project/dlkgdpexjtyynbotkwka/auth/users → tìm email → `⋯` →
**Update password**.

> Đăng nhập bằng tài khoản này thì thấy **đúng dữ liệu Bảo Lương**. Tài khoản superadmin của anh
> KHÔNG vào được `/staff` (bị đẩy về `/mevo`) — đó là thiết kế, không phải lỗi.

### ☐ 1.2. Nhập menu

`/admin` → **Quản lý menu**. Tối thiểu để test được: **2 danh mục** (vd *Lẩu*, *Đồ nhậu*) và
**5–6 món** có giá thật. Chưa cần ảnh.

> Mẹo: nhập vài món giá lẻ khác nhau (89.000 / 45.000 / 25.000) để lát nữa nhìn tổng bill biết
> ngay cộng đúng hay sai.

### ☐ 1.3. Kiểm cấu hình quán

`/admin` → **Cài đặt**. Xác nhận đúng ba thứ:

- Mục **Cách vận hành quán** đang chọn **Trả sau** ☑
- Có dòng cảnh báo *"Người lạ chụp QR bàn vẫn có thể đặt đơn từ xa…"* — đọc kỹ một lần, đó là
  cái giá cố hữu của trả sau, không phần mềm nào triệt được
- Mục **Phương thức thanh toán** **không hiện** (trả sau thì thu tại quầy, chọn tiền mặt hay
  chuyển khoản là lúc chốt bill)

### ☐ 1.4. In QR bàn

`/admin` → **Bàn & QR** → thấy đủ 20 bàn kèm ảnh QR → tải về, in dán bàn.

> ⚠️ **Chưa deploy Mini App thì QR quét vào sẽ báo lỗi** — bình thường. Cứ in sau khi làm xong
> mục 5, hoặc in trước để dán sẵn rồi test sau.

---

## 2. Nhóm A — Trả sau và khoá bàn (bàn lẻ)

Làm ở `/staff` (đăng nhập `baoluong@mevo.vn`), tab **Đặt món** và tab **🪑 Bàn**.

**☐ A1.** Tab **Đặt món** → chọn **Bàn 1** → thêm 2 món → gửi. Màn báo *"Đã thêm vào Bàn 1 — thu
tiền khi khách ra về"*, **không** hỏi phương thức thanh toán.

**☐ A2.** ⭐ Mở `/kitchen/bia-lau-bao-luong` → **đơn hiện ngay ở cột "Chờ xử lý"** dù chưa ai trả
đồng nào. Đây là điểm khác căn bản với Pubu. Loa đọc đơn cũng phải kêu.

**☐ A3.** Tab **🪑 Bàn** → thấy `🪑 Bàn 1` · mở lúc … · 1 đơn · đúng số tiền.

**☐ A4.** Đặt hộ thêm lần nữa cũng vào **Bàn 1** → vẫn **một dòng** ở tab Bàn, số đơn thành 2,
tiền cộng dồn. (Một bàn = một bill, gọi nhiều lần vẫn một bill.)

**☐ A5.** Bấm **Thu tiền & đóng bàn** → chọn **Tiền mặt** → Bàn 1 biến mất khỏi danh sách.

**☐ A6.** `/admin` → **Đơn hàng** → cả 2 đơn đều có dấu **✓ Đã nhận tiền**; `/admin` →
**Dashboard** → doanh thu hôm nay tăng đúng bằng tổng 2 đơn.

**☐ A7.** ⭐ **Đóng bàn khi món chưa xong.** Đặt hộ Bàn 2 → ở màn bếp bấm **Bắt đầu làm** → quay
lại tab Bàn bấm **Thu tiền & đóng bàn** → hiện cảnh báo *"Còn N món chưa xong…"* → vẫn thu được,
và **món đó vẫn nằm ở màn bếp** để bếp làm nốt.

**☐ A8.** **Bỏ bàn.** Đặt hộ Bàn 3 → tab Bàn → `⋯` → **Bỏ bàn (không thu tiền)** → hỏi lại một
lần → đồng ý → đơn chưa nấu bị huỷ, **doanh thu KHÔNG tăng**.

---

## 3. Nhóm B — Lớp Mâm cho khách đoàn ⭐ phần chính của sprint

**☐ B1.** Tab **🪑 Bàn** → nút **＋ Ghép mâm** → chọn **Bàn 5, 6, 7** → **Ghép 3 bàn thành mâm**.
→ Danh sách hiện **một dòng** `🍲 Bàn 5, Bàn 6, Bàn 7` kèm nhãn *mâm 3 bàn*.

**☐ B2.** Bấm **＋ Ghép mâm** lần nữa → **Bàn 5, 6, 7 không còn** trong danh sách bàn trống.

**☐ B3.** Đặt hộ **Bàn 6** → đơn rơi vào **mâm** (không đẻ ra dòng "Bàn 6" riêng), tiền cộng vào
mâm.

**☐ B4.** ⭐ **Thêm bàn.** `⋯` trên mâm → **Thêm bàn vào mâm** → chọn **Bàn 8** → mâm thành 4 bàn.

**☐ B5.** ⭐ **Nhập phiên lẻ vào mâm.** Đặt hộ **Bàn 9** (bàn ngoài mâm) → hiện thêm dòng
`🪑 Bàn 9` riêng → `⋯` trên Bàn 9 → **Nhập vào mâm khác** → chọn mâm → **Bàn 9 biến mất, món và
tiền của nó cộng vào mâm**, mâm thành 5 bàn.

**☐ B6.** **In bill một mâm.** Bấm nút 🖨️ trên thẻ mâm → mở tab in khổ 80mm: tên quán, địa chỉ,
số điện thoại, danh sách món **gộp theo tên** (2 lần gọi cùng một món thì cộng lại), TỔNG CỘNG.
→ In thử ra máy in bill của quán: **chữ không tràn lề**, nút "In lại" **không in ra giấy**.

**☐ B7.** ⭐ **Gộp bill.** Ghép **mâm thứ hai** (Bàn 15, 16) → đặt hộ vài món → **tick ô vuông
trên cả hai mâm** → thanh dưới hiện *Gộp 2 mâm* + tổng → **🖨️ In 1 hoá đơn** → tờ bill có
**dòng cộng riêng từng mâm** rồi **TỔNG CỘNG** cuối cùng.

**☐ B8.** Bấm **Thu tiền** → **Chuyển khoản** → **cả hai mâm cùng đóng một lượt**, tất cả bàn nhả
ra hết.

**☐ B9.** `/admin` → **Đơn hàng**: mọi đơn của cả hai mâm đều **✓ Đã nhận tiền**. Doanh thu tăng
đúng bằng tổng của cả hai.

**☐ B10.** **Tách bill vẫn là mặc định.** Ghép 2 mâm mới, **không tick gì**, bấm **Thu tiền &
đóng bàn** trên riêng một mâm → chỉ mâm đó đóng, mâm kia nguyên vẹn. (Mâm về sớm chốt riêng.)

**☐ B11.** Sau khi đóng mâm → bấm **＋ Ghép mâm** → **các bàn của mâm vừa đóng đã quay lại** danh
sách bàn trống.

---

## 4. Nhóm C — Không phá cái đang chạy

**☐ C1.** `/kitchen/bia-lau-bao-luong` → mọi đơn trả sau đều hiện, loa đọc đúng.

**☐ C2.** ⭐ Đăng nhập `baoluong@mevo.vn` → **không thấy dữ liệu Phở Gà Pubu** ở bất kỳ màn nào
(Đơn hàng, Menu, Bàn, Dashboard). Cách ly quán là thứ không được phép hỏng.

**☐ C3.** Tab Bàn khi chưa có bàn nào mở → hiện *"Chưa có bàn nào đang mở"*, không lỗi đỏ.

**☐ C4.** Tắt wifi máy tính vài giây rồi bật lại → chấm xanh *"Đang cập nhật trực tiếp"* tự nối
lại, danh sách tự tải lại đúng.

---

## 5. Nhóm D — Khách quét QR thật (cần deploy Mini App)

### ☐ 5.1. Deploy — anh chạy, tôi không chạy được (Zalo bắt đăng nhập tương tác)

```bash
cd D:/Code/mevo/mini-app-instances/bia-lau-bao-luong/mini-app && npx zmp login
```

```bash
cd D:/Code/mevo/mini-app-instances/bia-lau-bao-luong/mini-app && npx zmp deploy
```

> **Chọn `Development`** cho lần này (tự test). `Testing` là bản release — Zalo giới hạn số lần
> deploy mỗi tháng nên đừng đốt.
>
> Thư mục này đã có sẵn `.env` đúng App ID `671794256689452743`, **đã merge code mới nhất**
> (trả sau + lớp Mâm) và đã cài xong thư viện. Đừng chạy deploy từ `D:/Code/mevo/mini-app/` —
> thư mục đó là code lõi dùng chung, không thuộc quán nào.

### ⚠️ 5.2. Mini App chưa xác thực giấy tờ — hệ quả cần biết trước

- Chỉ **tài khoản Zalo được thêm làm developer/tester** của app mới mở được. Điện thoại người
  ngoài quét QR **sẽ không vào được** cho tới khi app xác thực xong và publish.
  → Muốn test bằng 2 máy (bài D4, D5) thì **thêm số Zalo của máy thứ hai vào danh sách tester**
  trên `developers.zalo.me` trước.
- Bản `Development` **không mở được bằng link `zalo.me/s/<appId>` trơn** — phải kèm `env` và
  `version`. QR ở `/admin` chỉ chèn hai tham số đó khi Vercel có biến `NEXT_PUBLIC_ZALO_ENV` /
  `NEXT_PUBLIC_ZALO_VERSION`, mà hai biến đó **dùng chung cho mọi quán** nên đừng vội đổi.
  → **Cách nhanh nhất:** lấy **link/QR mà `zmp deploy` in ra**, nối thêm
  `&store=bia-lau-bao-luong&table=<id bàn>`. Id bàn copy ở `/admin` → Bàn & QR, hoặc lấy cả loạt
  bằng câu SQL ở mục 6.

### Các bài test

**☐ D1.** Máy A quét QR **Bàn 12** (bàn lẻ, không thuộc mâm) → chọn món → nút bấm là **"Gọi món"**,
**không** có bước chọn phương thức thanh toán, **không** mở màn thanh toán Zalo.

**☐ D2.** ⭐ Đơn vào bếp **ngay**, chưa trả đồng nào.

**☐ D3.** Máy A gọi thêm lần 2 → vào **cùng phiên**, không bị chặn. Đầu trang menu hiện thanh
`🪑 Bàn 12 · 2 lần gọi · <tổng>`.

**☐ D4.** ⭐ **Máy B** (điện thoại khác) quét QR **Bàn 12** → hiện **banner đỏ** *"Bàn này đang có
khách gọi món…"*, **không thêm được món**, vẫn xem được menu.

**☐ D5.** ⭐⭐ **Mâm thì ngược lại.** Ghép Bàn 5-6-7 thành mâm → **máy A quét Bàn 5**, **máy B quét
Bàn 7** → **cả hai đều gọi được**, không máy nào bị khoá, cả hai thấy thanh `🍲 Bàn 5, Bàn 6,
Bàn 7` và **tổng giống hệt nhau**.

**☐ D6.** Nhân viên chốt bill mâm → hai máy quét lại → đặt được như bàn mới.

**☐ D7.** `⋯` → **Chuyển quyền gọi món** trên **bàn lẻ** đang bị khoá → máy B quét lại → **thành
chủ bàn, gọi thêm được**. (Nút này không hiện trên mâm — mâm vốn không khoá ai.)

**☐ D8.** Khách bấm nút chuông **"Gọi thanh toán"** trong app → **màn bếp kêu và hiện thông báo**.
(Nút này im lặng suốt từ 2026-06-26 tới khi vá ở mig 039 — bài này để chắc nó đã sống lại.)

---

## 6. Gặp lỗi thì gửi tôi cái gì

Chụp màn hình + nói rõ **đang ở màn nào, bấm gì, chờ gì mà không thấy**. Nếu là lỗi số tiền hoặc
đơn không vào bếp thì kèm kết quả câu này, chạy ở Supabase → SQL Editor:

```sql
select o.created_at, o.status, o.payment_method, o.payment_received_at,
       o.total_amount, o.order_source, s.close_reason,
       (select string_agg(t.table_number, ', ') from session_tables st
         join tables t on t.id = st.table_id where st.session_id = s.id) as ban
  from orders o
  left join table_sessions s on s.id = o.session_id
 where o.store_id = '2139c162-9677-4cbd-87e3-d2e1ac22e6e8'
 order by o.created_at desc limit 20;
```

Lấy id 20 bàn để ghép link test (mục 5.2):

```sql
select table_number, id from tables
 where store_id = '2139c162-9677-4cbd-87e3-d2e1ac22e6e8' and is_active
 order by table_number;
```

---

## 7. Xong hết thì báo tôi

Nhắn **"PASS Bảo Lương"** kèm bài nào trượt (nếu có). Sau đó tôi mới:

1. merge nhánh `feat/postpay-table-session` vào `main`,
2. đồng bộ vào worktree Bảo Lương để anh deploy bản `Testing`,
3. chuyển sang Sprint 4 (sơ đồ bàn 2D kéo thả) hoặc pilot 2 tuần — tuỳ anh chọn.

**Chưa PASS thì tôi chưa merge.** Đúng quy tắc trong `CLAUDE.md`.
