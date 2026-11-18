# Xử lý mất mạng tạm thời — "Quầy dự phòng" trong MEVO In

> Trạng thái: **CHỜ ANH TÚ DUYỆT** (2026-11-18). Chưa có dòng code sản phẩm nào.
> Đã sửa theo lượt review của Codex ngày 2026-11-18 (5 điểm; cách xử lý từng điểm ở mục B11).
> Phạm vi: quán trả sau dùng MEVO bản Online, in ở chế độ "Nhiều nơi" (`print_mode = 'agent'`) — trước mắt là Yên Garden.
> Phương án lớn "MEVO Tại quán" (máy chủ đặt tại quán) KHÔNG thuộc tài liệu này; anh Tú đã quyết tạm chưa làm.

Tài liệu chia hai nửa. **Phần A** viết cho anh Tú và quán: mất mạng thì ai làm gì. **Phần B** viết cho người lập kế hoạch
và người viết code.

---

# PHẦN A — Kịch bản cho quán

## A1. Ý chính

MEVO chạy trên mạng. Khi mạng của quán đứt, màn MEVO POS đứng yên và MEVO In không in được. Việc này hiếm, nhưng
khi xảy ra thì quán vẫn phải bán được hàng. Cách xử lý gồm ba lớp, dùng theo thứ tự:

1. **Chờ.** Rớt vài chục giây thì máy tự nối lại, không ai phải làm gì.
2. **Mạng 4G dự phòng.** Máy quầy có đường mạng thứ hai (router có SIM 4G, hoặc cắm điện thoại phát 4G qua dây USB)
   thì MEVO POS chạy lại như thường. Đây là cách nhẹ nhất và nên thử trước.
3. **Quầy dự phòng.** Một cửa sổ riêng nằm trong MEVO In trên máy quầy, chạy không cần mạng: thu ngân nhập món,
   phiếu in ra đúng 4 máy (Quầy, Bếp, Nướng, Bar), in tạm tính, nhận tiền mặt. Có mạng lại thì mọi thứ tự gửi lên MEVO.

Hình dung như máy phát điện: bình thường dùng điện lưới (MEVO POS); mất điện thì bật máy phát (Quầy dự phòng); có điện
lại thì tắt máy phát, quay về điện lưới. Hai cái không dùng cùng lúc.

Tách mạng khách khỏi mạng hệ thống (anh đang làm với quán) giúp chống quá tải, nhưng không chống được lúc nhà mạng
đứt đường truyền. Lớp 2 và lớp 3 là để cho lúc đó.

## A2. Bốn kịch bản

| | Kịch bản 1 | Kịch bản 2 | Kịch bản 3 | Kịch bản 4 |
|---|---|---|---|---|
| **Mất bao lâu** | Vài chục giây (dưới 1 phút) | Vài phút | Khoảng 1 tiếng | Cả buổi tối, không khắc phục được |
| **Dấu hiệu** | POS hiện "Mất kết nối — đang thử lại" rồi tự xanh lại | POS hiện băng đỏ "Mất mạng từ 19:40". MEVO In báo "Mất mạng. Bấm để mở Quầy dự phòng" | Như kịch bản 2 | Như kịch bản 2, tới giờ đóng cửa vẫn chưa có mạng |
| **Dùng màn nào** | MEVO POS | Chờ được thì chờ. Có món cần nhập hoặc bàn muốn về thì mở Quầy dự phòng | Quầy dự phòng | Quầy dự phòng |

### Kịch bản 1 — Rớt vài chục giây

- **Thu ngân:** không làm gì. Nếu vừa bấm một nút mà báo "Lỗi kết nối" thì chờ nhãn xanh lại rồi bấm lại **ngay trên
  MEVO POS**. Bấm lại ở đó **không** tạo món trùng và **không** thu tiền hai lần (máy chủ đã có mã chống trùng). Mã
  chống trùng này chỉ có tác dụng khi bấm lại trên POS; nhập lại ở Quầy dự phòng là chuyện khác (xem kịch bản 3).
- **Nhân viên:** điện thoại báo lỗi khi gửi đơn thì giỏ món vẫn còn, bấm gửi lại.
- **Phiếu in:** phiếu đang chờ tự in ra khi có mạng lại.
- **MEVO In không hiện thông báo gì.** Dưới 1 phút coi như chưa có chuyện gì.

### Kịch bản 2 — Mất vài phút

1. Sau 1 phút, POS hiện băng đỏ và MEVO In hiện thông báo ở góc màn hình.
2. Thu ngân bộ đàm cho nhân viên: **"Quầy mất mạng, ghi món vào giấy hoặc ghi chú điện thoại, đừng gửi qua máy."**
3. Người phụ trách thử bật mạng 4G dự phòng cho máy quầy (nếu quán có). Có mạng lại thì dùng POS như thường, xong.
4. Nếu chưa có mạng mà có việc gấp (nhân viên mang món về quầy đọc, hoặc bàn muốn về): thu ngân bấm mở **Quầy dự phòng**
   và làm như kịch bản 3. Không có việc gấp thì chờ.
5. Có mạng lại: xem mục A4.

### Kịch bản 3 — Mất khoảng 1 tiếng

Thu ngân làm việc hẳn trên Quầy dự phòng. MEVO POS để nguyên, không tắt, không dùng. Lúc mở, Quầy dự phòng hỏi
"Ai đang trực quầy?" — thu ngân chọn tên mình trong danh sách (không cần mật khẩu) để các phiếu và tờ tổng kết có tên.

- **Việc vừa bấm trên POS đúng lúc mạng rớt (POS báo "Lỗi kết nối"):** có thể MEVO đã nhận, có thể chưa. Quầy dự
  phòng **không biết** việc đó, nên "không thấy ở Quầy dự phòng" **chưa chắc là "chưa được lưu"**. Thu ngân ghi ra giấy
  "bàn nào, vừa bấm gì". Bếp chưa có phiếu thì cứ nhập lại ở Quầy dự phòng để bếp làm. Có mạng lại, mở bill bàn đó trên
  POS: thấy hai lượt giống nhau thì bỏ một lượt trước khi thu tiền. POS gắn nhãn **"Kiểm tra trùng"** cho những bàn như vậy.
- **Món vừa duyệt ngay trước lúc mất mạng mà bếp chưa nhận được phiếu:** chọn bàn, chọn lượt món đó, bấm **In lại phiếu
  bếp** (phiếu có chữ IN LẠI). Không nhập lại món, kẻo bill có hai dòng.
- **Lượt món đang chờ duyệt lúc mạng rớt:** Quầy dự phòng hiện chúng ở dạng "chờ duyệt — chưa vào bếp, chưa tính tiền",
  không duyệt được. Khách vẫn cần món thì thu ngân nhập lại bằng tay; có mạng lại thì Từ chối lượt cũ (lý do "Trùng").
  Nếu lúc đó thấy lượt cũ hoá ra đã được duyệt rồi (bấm Duyệt đúng lúc mạng rớt) thì bỏ lượt nhập tay.
- **Bàn gọi thêm món:** nhân viên về quầy đọc món. Thu ngân chọn bàn, chọn món, bấm **Gửi & in phiếu**. Phiếu bếp ra
  đúng máy Bếp / Nướng / Bar, phiếu bàn ra máy Quầy.
- **Khách mới vào bàn trống:** thu ngân chọn bàn trống, nhập món, in phiếu như trên.
- **Nhập nhầm món:** bấm **Bỏ món** ở dòng vừa nhập. Máy in phiếu "BÁO HUỶ" ra đúng trạm để bếp biết.
- **Bàn muốn về:** thu ngân bấm **In tạm tính**, đưa khách. Khách trả **tiền mặt**. Thu ngân bấm **Đã nhận tiền mặt**
  (sửa được số tiền thực nhận, ghi chú được). Bàn chuyển sang "đã về", khách khác ngồi vào được.
- **Khách muốn chuyển khoản:** Quầy dự phòng không nhận chuyển khoản (không có mạng thì không kiểm được tiền đã về).
  Thu ngân xin khách trả tiền mặt.
- **Khách gọi món qua Zalo bằng 4G của họ:** đơn vẫn lên MEVO nhưng quầy không thấy. Nhân viên chạy bàn để ý và nhận
  món bằng miệng. Khi có mạng lại, POS sẽ báo các đơn này (mục A4).

### Kịch bản 4 — Cả buổi tối không có mạng

Trong buổi làm như kịch bản 3. Thêm phần cuối ngày:

1. **Không kết ca trên MEVO** trong lúc quầy mất mạng. Máy quầy không kết được (cần mạng); người có 4G riêng (quản lý,
   chủ quán) cũng **không kết ca hộ** từ điện thoại, vì tiền mặt nhận lúc mất mạng chưa lên MEVO. Thu ngân bấm **In
   tổng kết** trên Quầy dự phòng: tờ này liệt kê từng bàn đã nhận tiền mặt (giờ, số tiền), các bàn còn mở, và tổng tiền
   mặt đã nhận lúc mất mạng.
2. Thu ngân đếm két, đối chiếu với tờ tổng kết, ghi tay số đếm lên tờ đó và ký. Kẹp tờ này lại cho hôm sau.
3. Tắt máy như thường. Mọi thứ đã nằm trong ổ cứng máy quầy, **không mất khi tắt máy**.
4. **Hôm sau, khi có mạng:** bật máy, MEVO In tự gửi hết lên MEVO. Thu ngân mở MEVO POS, làm mục A4, rồi **kết ca
   của tối hôm trước** (nhập số đếm trên tờ tổng kết), sau đó mới mở ca mới. Tiền các bàn được ghi vào **đúng ngày
   hôm trước, đúng giờ nhận thật**, nên báo cáo ngày không bị lệch.

Các bước 1, 2 và phần "đúng ngày, đúng giờ" ở bước 4 chỉ có từ **Đợt 3** (xem A6). Trước Đợt 3, nếu mất mạng cả tối
thì tiền tối đó được thu trên POS vào hôm sau và **nằm trong báo cáo của ngày hôm sau**; quán đối chiếu bằng các liên
tạm tính đã giữ lại.

## A3. Màn Quầy dự phòng trông thế nào

```
┌───────────────────────────────────────────────────────────────────────┐
│ QUẦY DỰ PHÒNG · Yên Garden          Mất mạng từ 19:40 · bill đến 19:40 │
│ Chờ gửi lên MEVO: 6 lượt món · 1 bàn đã nhận tiền mặt                  │
├──────────────────────────────┬────────────────────────────────────────┤
│ Khu A                        │ BÀN A2                                 │
│ [A1 trống] [A2 ●] [A3]       │ 2 Bia Hà Nội            40.000         │
│ [A4] [A5 đã về] [A6 trống]   │ 1 Lẩu gà đen           350.000         │
│ Khu B                        │ ─ nhập lúc mất mạng ─                  │
│ [B1] [B2 ●] [B3 trống] ...   │ 1 Ba chỉ nướng (20:05)  90.000  [Bỏ]   │
│                              │ Tạm tính:              480.000         │
│ ● có món nhập lúc mất mạng   │ [Thêm món] [In tạm tính]               │
│                              │ [Đã nhận tiền mặt]                     │
└──────────────────────────────┴────────────────────────────────────────┘
```

Thực đơn, giá và bill các bàn được MEVO In **tự chép sẵn về máy quầy trong lúc còn mạng**, nên mở lên là có đủ. Dòng
"bill đến 19:40" cho biết số liệu chép lần cuối lúc nào.

## A4. Khi có mạng trở lại

Quầy dự phòng tự làm, thu ngân không phải bấm gửi. Có hai bước nối nhau và **chỉ bước sau mới là xong**:
Quầy dự phòng **gửi lên MEVO** (món mới nằm chờ trên máy chủ), rồi MEVO POS **nhận vào bill** (món mới có trong bill).

**Quy tắc quan trọng nhất: băng nhắc màu vàng trên MEVO POS còn hiện thì chưa thu tiền, chưa bỏ bàn.** Băng chỉ tắt khi
mọi lượt món nhập lúc mất mạng đã vào bill hoặc đã được thu ngân xử lý tay. Thu tiền một bàn trước lúc đó là thu
thiếu. Riêng trong màn Thanh toán, POS ghi rõ tình trạng của **đúng bàn đang thu** ("Bàn này còn 2 lượt món nhập lúc
mất mạng chưa vào bill"). Đây là nhắc, không khoá nút.

1. Quầy dự phòng gửi hết lên MEVO, hiện "Đã gửi lên MEVO. Quay lại MEVO POS", rồi **tự khoá** (không nhập thêm được).
   Trong lúc đang gửi, MEVO In **chưa nhận phiếu in mới**; gửi xong mới in tiếp như thường. Phiếu in đang xếp hàng từ
   trước lúc mất mạng **không tự in ra muộn**; chúng nằm ở băng "phiếu lỗi" sẵn có của POS để thu ngân chọn In lại hoặc Bỏ.
2. Thu ngân quay lại MEVO POS. POS tự nhận các lượt món vào bill và báo: "Đã nhận 6 lượt món nhập lúc mất mạng vào
   bill". Phiếu bếp **không in lại** (đã in lúc mất mạng). Bàn nào có nhãn **"Kiểm tra trùng"** thì mở bill xem có hai
   lượt giống nhau không (kịch bản 3, gạch đầu dòng thứ nhất).
3. POS có mục **"Đã nhận tiền mặt lúc mất mạng — chờ chốt"**. Mỗi bàn một dòng: số tiền đã nhận, giờ nhận, số tiền MEVO
   tính. Thu ngân bấm **Chốt** từng bàn. Hai số khớp thì chốt luôn. Hai số lệch thì POS chỉ rõ lệch bao nhiêu, thu
   ngân sửa bill cho đúng (bỏ món, giảm giá, có ghi lý do) rồi chốt. **MEVO không tự sửa tiền.** Bàn nào hoá ra đã
   được thu trên POS rồi (ví dụ bấm Thu đúng lúc mạng rớt) thì POS không ghi thêm lần nữa và không sửa khoản cũ; nó
   hiện cả hai bên để thu ngân đối chiếu.
4. POS báo **các lượt món khách / nhân viên gửi qua điện thoại trong lúc mất mạng**: "Có N lượt món gọi lúc mất mạng
   (từ 19:52)". Thu ngân bộ đàm cho nhân viên hỏi lại khách. Khách còn dùng thì **Duyệt**; khách không dùng nữa, hoặc
   món đó đã được nhập tay ở Quầy dự phòng rồi, thì **Từ chối** (lý do "Trùng" hoặc "Khách đổi ý").
5. Lượt nào MEVO không nhận được (ví dụ bàn đã bị bỏ ở máy khác) nằm ở mục **"Cần xử lý tay"**, kèm lý do. Không có
   lượt món nào bị bỏ đi im lặng. Băng nhắc **vẫn hiện** cho tới khi thu ngân xử lý hết mục này.

## A5. Những việc Quầy dự phòng KHÔNG làm

Lúc mất mạng, các việc sau phải chờ có mạng: chuyển khoản / quét QR, ghi nợ, giảm giá bill, chuyển bàn, ghép bàn,
bỏ hoặc sửa món đã có trên MEVO từ trước lúc mất mạng, duyệt đơn Zalo, đặt bàn, thu chi két, kết ca, báo cáo.
Nếu khách đòi bớt một món đã có từ trước: thu ngân nhận đúng số tiền thực, sửa số "thực nhận" và ghi chú lý do khi
bấm Đã nhận tiền mặt; hôm có mạng thì sửa bill trên POS rồi chốt.

**Mất điện** không thuộc phạm vi: mất điện thì máy in cũng tắt. Em khuyên quán có bộ lưu điện (UPS) cho máy quầy,
modem và router. Dữ liệu Quầy dự phòng không mất khi máy tắt đột ngột.

## A6. Chia đợt và lịch thật

Hôm nay 18/11. Lắp máy 24–25/11, chạy thử 27–30/11, khai trương 01/12. Việc này lớn và có phần đụng tới tiền, nên em
chia ba đợt và nói thật phần nào kịp.

| Đợt | Có gì | Đụng tới tiền? | Kịp trước 01/12? |
|---|---|---|---|
| **1** | POS: băng đỏ mất mạng; cảnh báo lượt món gọi lúc mất mạng. Tờ quy trình 1 trang dán ở quầy (4 kịch bản, làm bằng giấy + 4G) | Không | **Chắc chắn kịp** |
| **2** | Quầy dự phòng: nhập món, in phiếu bếp + phiếu bàn ra 4 máy, bỏ món nhập nhầm, xem bill, in tạm tính, tự gửi lên MEVO, chế độ tập dượt | Không (tiền vẫn thu trên POS khi có mạng) | **Có thể kịp**, chỉ coi là xong khi thử đạt với 4 máy in thật ngày 24–25/11. Chưa đạt thì khai trương bằng tờ quy trình giấy |
| **3** | Nút "Đã nhận tiền mặt", mục "chờ chốt" trên POS, ghi đúng giờ thu thật, bàn đã về cho khách mới ngồi, in tổng kết, chặn kết ca khi còn khoản chờ chốt | **Có** | **Không kịp** để thử kỹ. Làm sau khai trương, trong tháng 12 |

Trong lúc chưa có Đợt 3: bàn về lúc mất mạng thì thu ngân in tạm tính (Đợt 2) hoặc viết tay, nhận tiền mặt, **giữ lại
một liên tạm tính có ghi "đã thu"**; có mạng lại thì thu trên POS như thường (giờ thu là giờ bấm). Bàn đó chưa nhận
khách mới trên máy được cho tới khi có mạng.

---

# PHẦN B — Thiết kế cho người làm

## B1. Vì sao làm, mục tiêu, không làm

**Vì sao:** Yên Garden (60 bàn, 4 máy in, khai trương 01/12/2026) vận hành hoàn toàn trên MEVO Online. Mất mạng là sự
cố hiếm, nhưng anh Tú muốn có phương án dự phòng chuẩn bị kỹ trước khi quán chạy thật: quầy vẫn bán được, bếp vẫn có
phiếu, tiền không sai.

**Mục tiêu**
- G1. Mất mạng dưới 1 phút: không có gì thay đổi so với hôm nay.
- G2. Mất mạng lâu hơn: thu ngân nhập món cho bàn đang mở / bàn trống, phiếu bếp và phiếu bàn in ra đúng máy của từng
  trạm, không cần mạng.
- G3. Dữ liệu nhập lúc mất mạng nằm trên ổ cứng máy quầy, sống qua tắt cửa sổ, tắt máy, mất điện.
- G4. Có mạng lại: mọi lượt món vào đúng bill trên MEVO, đúng một lần, không in lại phiếu bếp, không cần thu ngân gõ lại.
- G5. (Đợt 3) Tiền mặt nhận lúc mất mạng được chốt trên POS bởi thu ngân đang đăng nhập, ghi đúng giờ nhận thật.
- G6. Lượt món khách / nhân viên gửi lên máy chủ trong lúc quầy mất mạng được POS báo rõ để hỏi lại khách.

**Không làm (non-goals)**
- Không làm offline cho màn nhân viên `/staff`, màn bếp, Mini App.
- Không làm offline cho MEVO POS web (không service worker, không sửa luồng thao tác của `pos-client.tsx`).
- Quầy dự phòng không hỗ trợ: chuyển khoản / VietQR, ghi nợ, giảm giá bill, chuyển / ghép bàn, bỏ hoặc sửa món đã có
  trên máy chủ, duyệt / từ chối đơn, đặt bàn, ca và sổ thu chi, báo cáo, kho.
- Không hỗ trợ quán trả trước (prepay) và quán in bằng trình duyệt (`print_mode = 'browser'`): cửa sổ báo "chưa hỗ trợ".
- Không xử lý trường hợp mạng còn nhưng mevo.vn / Vercel chết.
- Không xử lý mất điện (chỉ bảo đảm dữ liệu không hỏng).

**Chống mục tiêu (làm ra mà mắc những điều này là thất bại)**
- AG1. Ngày thường (có mạng) POS, in, thu tiền chạy khác đi hoặc chậm đi vì việc này.
- AG2. Một lượt món nhập lúc mất mạng vào bill hai lần, hoặc phiếu bếp in hai lần cho cùng một lượt.
- AG3. Một lượt món nhập lúc mất mạng biến mất không dấu vết.
- AG4. Tiền được ghi "đã thu" trên MEVO mà không có thu ngân đang đăng nhập bấm chốt.
- AG5. Thu ngân nhập được món ở cả POS lẫn Quầy dự phòng cùng lúc.

## B2. Ràng buộc

- Luật `CLAUDE.md §6`: tiền do máy chủ tính; không chắc đã trả thì "chờ xác nhận"; bàn trả sau thu cả bàn một lần qua
  `collect_table_bill`, chỉ ở POS; RPC `CREATE OR REPLACE` hàm đang sống nằm riêng một migration; hàm nội bộ mới
  `REVOKE … FROM PUBLIC, anon, authenticated`; sửa RPC tiền chạy `npm run test:race`; server action trả `{ok, error}`.
- `docs/PROJECT.md`: sửa luồng thanh toán và đổi phân quyền là quyết định của người. Tài liệu này xin anh Tú duyệt đúng
  các điểm đó (mục B10). `PROJECT.md` đang ghi "POS offline" là ý tưởng hoãn trước 01/12; duyệt tài liệu này thì sửa dòng đó.
- Giữ đúng cả hai nhánh trả trước / trả sau: mọi thay đổi SQL không đổi hành vi của quán trả trước.
- `print-agent/` hiện là Electron 44 + TypeScript thuần, không framework UI, không dependency runtime; cấu hình chỉ có
  `supabaseUrl`, `anonKey`, `webOrigin`; xác thực bằng token ghép máy (máy chủ suy ra quán từ `token_hash`).
- Không đọc / in `.env*`.

## B3. Các cách đã cân nhắc

| Cách | Mô tả | Được | Mất |
|---|---|---|---|
| **1. Chế độ mất mạng trong POS web** | Hàng đợi trong trình duyệt, gửi lại khi có mạng | Không đổi màn | Trình duyệt chỉ in ra máy mặc định, không chia 4 trạm; tải lại trang là mất; phải sửa sâu `pos-client.tsx` ngay trước khai trương |
| **2. Quầy dự phòng trong MEVO In** ← **anh Tú chọn** | Cửa sổ riêng trong Electron, ghi ổ cứng, in thẳng, phát lại khi có mạng | In đúng 4 máy; bền qua tắt máy; không đụng POS ngày thường | Thu ngân học thêm một màn; việc lớn hơn |
| 3. Kết hợp (POS web + MEVO In in hộ) | | | Đã loại ở lần bàn trước |

Anh Tú chọn Cách 2 ngày 2026-11-18, lý do chính: in được ra 4 máy; chấp nhận đổi màn.

## B4. Hiện trạng (đã kiểm trong code, 2026-11-18)

- POS: nhãn `live = online && connected && error?.source !== 'reload'` (`admin-web/app/admin/pos/pos-client.tsx:1192`);
  mọi thao tác ghi đi server action, lỗi mạng rơi vào `catch` báo "Lỗi kết nối…"; gửi món và thu tiền có
  `clientRequestId`. Không có service worker, không IndexedDB.
- MEVO In (`print-agent/src`): `job-loop.ts` hỏi việc 2 giây/lần qua `print_agent_poll`; lỗi mạng → `onOffline()` (khay
  hiện "Mất kết nối"). `print-page.ts` in bằng cách mở `${webOrigin}/print/agent/<jobId>?t=…` trong cửa sổ ẩn →
  mất mạng là không in được. `spooler.ts` canh hàng đợi Windows sau khi in.
- Món thu ngân nhập ở POS: `pos_walk_in_order` (mig 099) và `pos_add_manual_items` (mig 046, vá 093) tạo đơn
  `order_source = 'pos'`, `status = 'pending'`, `created_by = auth.uid()`, `created_at = now()`. Đơn `pos` **không bao giờ**
  in phiếu bếp (`orderInKitchen`, `auto_kitchen_print_enqueue` mig 131) và không chặn lúc thu tiền.
- Giá: `add_order_line` (mig 046, vá 115) lấy giá + giảm giá theo món tại `now()`; món `is_available = false` thì
  **cả lô bị từ chối**.
- Thu tiền: `collect_table_bill(p_session_ids, p_lines, p_cash_given, p_client_request_id, …)` (mig 112a → 122 → 123).
  Không có tham số giờ: `bill_payments.collected_at`, `orders.payment_received_at`, `completed_at`, `closed_at` đều là
  `now()`. Quán bật "Bắt buộc mở ca" thì phải có ca đang mở (`require_open_cash_shift`); ca mở từ hôm trước (stale) vẫn
  thu được. Số tiền gửi lên lệch một đồng so với máy chủ tính là bị từ chối.
- Báo cáo ngày lọc theo `COALESCE(payment_received_at, completed_at, updated_at)` qua `business_day_bounds` (mig 111, 117).
- Trạm in: `print_stations (name, is_pos, is_default_kitchen, printer_name)`; món lấy trạm qua
  `menu_categories.print_station_id` (mig 114).
- `list_open_table_sessions` trả đủ để hiện bill (món, số lượng, giá sau giảm, topping, món huỷ / tặng, giảm giá bill,
  `unpaid_total`) nhưng không có `menu_item_id`. Hàm này gọi `expire_stale_table_sessions` trước khi đọc.

## B5. Thiết kế

### B5.1 Ba mảnh

```
 Máy quầy (Windows)                                   Máy chủ (Supabase)
┌───────────────────────────────┐   còn mạng: chép sẵn   ┌──────────────────────────┐
│ MEVO In (Electron)            │ ◄───────────────────── │ RPC chép sẵn (theo token) │
│  ├ vòng in hiện có            │                        │                          │
│  ├ bản chép sẵn  (ổ cứng)     │   có mạng lại: gửi     │ bảng nhật ký mất mạng    │
│  ├ nhật ký mất mạng (ổ cứng)  │ ─────────────────────► │  (chỉ là dữ liệu chờ)    │
│  └ cửa sổ Quầy dự phòng       │                        │            │             │
│       └ in thẳng ra 4 máy     │                        │            ▼             │
└───────────────────────────────┘                        │ RPC "nhận vào bill"      │
┌───────────────────────────────┐   thu ngân đăng nhập   │  (chạy bằng quyền thu    │
│ MEVO POS (trình duyệt)        │ ─────────────────────► │   ngân, tạo đơn 'pos')   │
│  nhận nhật ký · chờ chốt      │                        └──────────────────────────┘
└───────────────────────────────┘
```

Nguyên tắc: **MEVO In chỉ được chép dữ liệu về và gửi nhật ký lên. Việc biến nhật ký thành món trong bill, và việc ghi
tiền, luôn do một thu ngân đang đăng nhập ở POS thực hiện** (POS tự gọi, thu ngân không phải bấm cho phần món).
Nhờ vậy token của máy in không có thêm quyền ghi vào đơn hàng (đáp AG4, và giữ nguyên ranh giới phân quyền).

### B5.2 MEVO In — bản chép sẵn

- Trong lúc có mạng, MEVO In định kỳ chép về ổ cứng (thư mục `userData`, ghi kiểu thay-file-nguyên-tử):
  - thông tin quán (tên, địa chỉ, SĐT, `payment_timing`, `print_mode`, có bắt buộc mở ca không);
  - khu + bàn; trạm in + tên máy in của từng trạm;
  - thực đơn: danh mục (kèm trạm in), món, lựa chọn, topping, giá gốc, `is_available`, và **luật giảm giá theo món ở
    dạng thô** (để tính giá tại thời điểm nhập, không phải thời điểm chép);
  - các phiên đang mở, hình dạng như `list_open_table_sessions`, **thêm cho mỗi dòng món trạm in của nó** (để in lại
    phiếu bếp lúc mất mạng) và cờ lượt món đang chờ duyệt;
  - tên hiển thị của những người vận hành POS của quán (để chọn "ai đang trực quầy"; không chép mật khẩu, PIN, email);
  - giờ máy chủ lúc chép (để hiệu chỉnh đồng hồ máy quầy).
- Yêu cầu độ tươi: lúc mạng rớt, phần **phiên đang mở** không cũ quá 30 giây; phần thực đơn không cũ quá 10 phút.
  Cửa sổ luôn hiện "bill đến HH:MM:SS".
- Chép bằng một RPC mới xác thực bằng token máy in (như `print_agent_poll`). RPC này **không** được gọi
  `expire_stale_table_sessions` hay ghi gì ngoài `last_seen_at`.

### B5.3 MEVO In — phát hiện mất mạng, mở và khoá cửa sổ

- "Mất mạng" = vòng hỏi việc lỗi mạng / quá hạn **liên tục ≥ 60 giây** (token bị thu hồi không tính).
- Khi vượt 60 giây: hiện thông báo hệ thống "Mất mạng. Bấm để mở Quầy dự phòng"; khay có mục "Mở Quầy dự phòng".
  Không tự bật cửa sổ đè lên màn hình.
- **Trạng thái phục hồi (thứ tự nối lại).** `print_agent_poll` nhận giữ một phiếu và chuyển nó sang `printing` ngay
  trong lời gọi (mig 114), nên **không được dùng lần hỏi việc để dò xem mạng đã về chưa**. Sau khi mất mạng ≥ 60 giây,
  MEVO In vào trạng thái phục hồi: **ngừng gọi `print_agent_poll`**, và dò mạng bằng chính lời gọi **gửi nhật ký** (gọi
  cả khi nhật ký rỗng), cùng nhịp 2 giây. Chỉ khi lời gọi gửi nhật ký trả về thành công **và** mọi sự kiện trên đĩa đã
  được máy chủ xác nhận, MEVO In mới thoát trạng thái phục hồi và hỏi việc in lại như thường. Trạng thái phục hồi được
  ghi xuống đĩa: tắt máy rồi bật lại vẫn bắt đầu từ đó, không hỏi việc in trước.
- Mất mạng dưới 60 giây không vào trạng thái phục hồi: vòng hỏi việc chạy tiếp như hôm nay (kịch bản 1).
- Cửa sổ chỉ cho nhập khi đang mất mạng. Lời gọi gửi nhật ký đầu tiên thành công → cửa sổ **khoá nhập**, chuyển sang
  màn "Đang gửi lên MEVO…" rồi "Đã gửi lên MEVO. Quay lại MEVO POS" (không viết "xong": món vào bill là việc của POS,
  B5.7). Giỏ món đang chọn dở lúc khoá được giữ lại và hiện rõ "chưa gửi — nhập món này trên MEVO POS" (không tự gửi
  một giỏ chưa bấm Gửi).
- Mạng chập chờn: khoá khi có mạng; mở lại khi mất tiếp ≥ 60 giây. Trạng thái trên màn luôn dựng từ *bản chép sẵn +
  mọi dòng nhật ký chưa được máy chủ xác nhận đã vào bill*; chỉ thay bản chép sẵn bằng bản mới khi bản mới đã phản ánh
  các dòng đó. Bất biến: một lượt món nhập lúc mất mạng không bao giờ hiện thiếu, không bao giờ hiện hai lần.
- Mở lúc đang có mạng: chỉ có **chế độ tập dượt** (B5.8).
- Mỗi lần mở để nhập thật, cửa sổ bắt chọn "Ai đang trực quầy?" từ danh sách đã chép. Đây là tên **tự khai**, không
  phải đăng nhập; nó đi kèm mọi sự kiện trong nhật ký và in trên tờ tổng kết. Trên máy chủ, `created_by` của đơn vẫn là
  thu ngân đang đăng nhập ở POS lúc nhận; tên tự khai được lưu riêng cạnh đó.
- **Báo cho máy chủ biết còn nhật ký chưa gửi:** mỗi lời gọi gửi nhật ký mang theo số sự kiện còn chưa gửi và cờ "vừa
  qua một lần mất mạng ≥ 60 giây". Máy chủ lưu con số và thời điểm đó theo máy in để POS đọc (B5.7).
- **Phiếu xếp hàng từ trước lúc mất mạng:** trong lời gọi gửi nhật ký đầu tiên sau lần mất mạng, máy chủ chuyển mọi
  phiếu in còn `queued` của quán (tạo trước thời điểm đó) sang `expired`. Chúng hiện ở băng phiếu lỗi sẵn có của POS
  (In lại / Bỏ) thay vì tự in ra muộn cho bếp. Vì MEVO In chưa hỏi việc in trước khi lời gọi này xong, không phiếu
  `queued` nào kịp thoát ra thành `printing`. Phiếu đã ở `printing` đúng lúc mạng rớt (đã nhận giữ nhưng chưa báo kết
  quả): người làm kiểm hành vi hiện có của `expire_print_jobs` và bảo đảm chúng cũng **không tự in lại**, mà về băng
  phiếu lỗi.

### B5.4 MEVO In — nhật ký trên ổ cứng

- Tệp chỉ-ghi-thêm, mỗi dòng một sự kiện, ghi xong ép xuống đĩa trước khi báo "đã lưu" cho giao diện. Mỗi sự kiện có
  `event_id` (UUID sinh tại máy, cũng là mã chống trùng), `occurred_at` (giờ máy quầy đã hiệu chỉnh theo độ lệch với
  máy chủ lúc chép gần nhất), `snapshot_at` (giờ máy chủ của bản chép sẵn mà cửa sổ đang dùng lúc ghi sự kiện), và
  trạng thái gửi.
- Loại sự kiện:
  - `items_added` — một lượt món: bàn, phiên (mã phiên máy chủ, hoặc mã phiên tạm nếu bàn mở lúc mất mạng), danh sách
    `{menu_item_id, variant_id, topping_ids, quantity, note}` kèm tên + đơn giá lúc nhập (để hiện và để so lệch).
  - `items_cancelled` — bỏ / giảm một dòng của một `items_added` **chưa gửi**; có lý do.
  - (Đợt 3) `cash_received` — phiên, số tiền thực nhận, tổng tạm tính lúc đó, ghi chú.
- Tệp hỏng dòng cuối (mất điện giữa chừng) thì bỏ đúng dòng dở đó và báo trong cửa sổ.

### B5.5 MEVO In — in tại chỗ

- Phiếu dựng thành HTML ngay trong MEVO In (mẫu riêng, không tải gì từ mạng), in qua đúng đường in + canh hàng đợi
  hiện có (`print()` + `waitForSpool`), `deviceName` = `printer_name` của trạm trong bản chép sẵn.
- Một lượt `items_added` in: mỗi trạm có món một **phiếu bếp** (chỉ món của trạm đó, không in giá, như chế độ phần mềm
  in hôm nay) + một **phiếu bàn** ở trạm Quầy. Món thuộc danh mục chưa gán trạm ra trạm bếp mặc định (cùng luật với
  `planOrderJobs`). Phiếu bếp ghi nguồn "Quầy nhập · mất mạng".
- `items_cancelled` in phiếu **BÁO HUỶ** ra trạm của món.
- **In lại phiếu bếp cho lượt món đã có trên bill** (từ bản chép sẵn): in theo trạm của từng dòng, tiêu đề có "IN LẠI".
  Không tạo sự kiện nhật ký gửi lên máy chủ (chỉ ghi lại tại máy là đã in).
- Lượt món đang chờ duyệt trong bản chép sẵn: hiện chỉ-đọc, không in được, **không tính vào tạm tính**. Tạm tính lấy
  đúng những gì màn bill của POS coi là phải thu, cộng các lượt nhập lúc mất mạng.
- **Tạm tính:** tiêu đề "TẠM TÍNH · IN LÚC MẤT MẠNG", đủ món, giảm giá bill đang đặt trên phiên, tổng; chân phiếu ghi
  "Số tiền có thể được tính lại khi có mạng". Không QR, không số hoá đơn.
- In lỗi (máy hết giấy, không thấy máy): lượt món **vẫn được ghi**; cửa sổ hiện phiếu nào chưa ra, có "In lại" và
  "In sang máy Quầy". Không tự in lại (tránh hai phiếu), đúng tinh thần `job-loop.ts`.
- Công thức tiền (giảm giá theo món, giảm giá bill) **không viết bản thứ ba**: dùng chung mã nguồn với
  `admin-web/lib/menu/menu-discount.ts` và `admin-web/lib/bill-discount.ts` (cách dùng chung do người làm chọn). Nếu
  buộc phải chép thì thêm test canh lệch và thêm vào danh sách "công thức phải khớp tay" ở `CLAUDE.md §6`.

### B5.6 Máy chủ — nhận nhật ký và đưa vào bill

- **Bảng nhật ký mất mạng** (mới): mỗi sự kiện một dòng, khoá chính là `event_id`, có `store_id`, máy in gửi, loại,
  nội dung, `occurred_at`, trạng thái `pending | applied | failed | dismissed`, kết quả / lý do lỗi, đơn tạo ra, người
  nhận. RLS khoá kín; chỉ đi qua RPC.
- **RPC gửi nhật ký** (token máy in, `anon`): chèn các sự kiện, trùng `event_id` thì bỏ qua; trả trạng thái từng sự
  kiện (kể cả các sự kiện gửi từ trước) để MEVO In cập nhật. RPC này chỉ ghi vào bảng nhật ký.
- **RPC nhận vào bill** (`authenticated`, kiểm `is_store_pos_operator`): xử lý các sự kiện `pending` của quán theo thứ
  tự `occurred_at`, mỗi sự kiện một điểm lưu riêng (một sự kiện hỏng không kéo hỏng sự kiện khác), khoá **phiên trước,
  đơn sau**. Với `items_added` (đã trừ các `items_cancelled`):
  - tạo đúng một đơn `order_source = 'pos'`, `status = 'pending'`, `client_request_id = event_id`,
    `created_by = auth.uid()` của người nhận, `created_at = occurred_at`;
  - **giá do máy chủ tính, tại thời điểm `occurred_at`** (giá món / lựa chọn / topping hiện hành + giảm giá theo món có
    hiệu lực lúc `occurred_at`), snapshot tên + giá như mọi đơn;
  - **không** từ chối vì món đang "tạm hết" (`is_available = false`): món đã nấu và đã lên bàn. Vẫn từ chối món không
    thuộc quán / đã xoá hẳn;
  - phiên đích còn `open` → thêm vào. Phiên đã bị `expire_stale_table_sessions` cho hết hạn **sau** `occurred_at` và
    còn tiền chưa thu → vẫn thêm vào (khách thật sự đã gọi lúc phiên còn sống). Phiên đã thu / đã bỏ / đã gộp →
    `failed` với lý do rõ;
  - phiên tạm (bàn mở lúc mất mạng): bàn đang trống trên máy chủ → mở phiên như `pos_walk_in_order` rồi thêm món. Bàn
    đang có phiên mở **và phiên đó có khoản tiền mặt chờ chốt** → để nguyên `pending` (chờ thu ngân chốt bàn cũ). Bàn
    đang có phiên mở **được mở sau thời điểm chép của bản chép sẵn mà Quầy dự phòng đã dùng** (khách tự quét QR bằng
    4G trong lúc quầy mất mạng) → coi là cùng lượt khách, thêm món vào phiên đó. Bàn đang có phiên mở từ trước thời
    điểm chép → `failed` "bàn đã có khách từ trước" (không gộp bill hai nhóm khách);
  - `occurred_at` ở tương lai hoặc cũ hơn 72 giờ → `failed`, không tự đoán giờ.
  - Đơn tạo từ nhật ký phải nhận ra được trên POS và trong lịch sử ("nhập lúc mất mạng, HH:MM").
  - **Gợi ý "Kiểm tra trùng" (không chặn):** lúc nhận một `items_added`, nếu phiên đích có đơn **không do nhật ký tạo**
    mà được tạo hoặc được duyệt **sau `snapshot_at`** của sự kiện (tức là Quầy dự phòng chưa hề thấy đơn đó khi thu
    ngân nhập), máy chủ gắn cờ gợi ý lên sự kiện. Đây là dấu vết của thao tác POS "máy chủ đã nhận nhưng phản hồi bị
    mất". Món vẫn vào bill bình thường; POS chỉ hiện nhãn để thu ngân mở bill xem có hai lượt giống nhau không. Không
    tự gộp, không tự bỏ. **Không làm** cầu nối chuyển "thao tác chưa rõ kết quả" từ POS (trình duyệt) sang Quầy dự
    phòng (Electron): hai phần mềm tách nhau, cầu nối đó nặng hơn nhiều so với một khe hở vài giây (B11, điểm 1).
- Hai hàm đang sống `pos_add_manual_items` / `add_order_line` **không đổi hành vi với lời gọi hiện có**. Cách tái dùng
  (hàm anh em, hay tham số mới có mặc định) do người làm chọn, tuân luật migration ở B2.
- **RPC đọc** cho POS: danh sách sự kiện `pending` / `failed` (+ khoản chờ chốt ở Đợt 3). **RPC bỏ qua** một sự kiện
  `failed` / một khoản chờ chốt, bắt buộc lý do.

### B5.7 MEVO POS (admin-web)

- **Đợt 1 — không cần máy chủ mới:**
  - Băng đỏ khi `live` sai liên tục ≥ 60 giây: "Mất mạng từ HH:MM. Các nút sẽ báo lỗi. Mất lâu thì mở Quầy dự phòng ở
    MEVO In." (Trước Đợt 2 câu cuối là "làm theo tờ quy trình mất mạng".)
  - Khi `live` trở lại sau ≥ 60 giây và có đơn cần duyệt (`isReviewableOrder`) tạo trong khoảng mất mạng: một băng
    "Vừa có mạng lại. Có N lượt món gọi lúc mất mạng (từ HH:MM). Hỏi lại khách trước khi duyệt; đã nhập tay rồi thì Từ
    chối." Băng tắt được.
  - Độc lập với băng trên: mọi lượt món chờ duyệt đã chờ ≥ 10 phút hiện nhãn "Gọi lúc HH:MM · đã chờ N phút" (đúng cả
    khi POS vừa được mở lại nên không biết đã mất mạng).
  - Dùng đúng luồng Duyệt / Từ chối hiện có; lý do `duplicate` và `customer_requested` đã có sẵn.
- **Đợt 2:**
  - Khi lần đọc định kỳ thấy có sự kiện `pending`, POS gọi **một lần** RPC nhận vào bill (qua server action trả
    `{ok, error}`; không biến thành vòng poll bằng server action), rồi tải lại bill và báo "Đã nhận N lượt món nhập
    lúc mất mạng".
  - Mục **"Cần xử lý tay"**: sự kiện `failed`, hiện bàn, giờ, các món, lý do; thu ngân nhập lại bằng tay ở đúng chỗ rồi
    bấm "Đã xử lý" (có lý do).
  - Lượt món từ nhật ký có nhãn "nhập lúc mất mạng" trong bill.
  - **Băng nhắc "món nhập lúc mất mạng chưa vào bill hết":** phân biệt rõ hai mức. "Đã gửi nhật ký" (MEVO In báo) chỉ
    nghĩa là dữ liệu đã tới máy chủ; "đã vào bill" mới là xong. Băng hiện ở thanh trên khi một trong các điều sau đúng:
    (a) quán còn sự kiện `pending`; (b) quán còn sự kiện `failed` **chưa được thu ngân bấm "Đã xử lý"**; (c) MEVO In
    báo còn sự kiện chưa gửi; (d) POS này vừa qua một lần mất mạng ≥ 60 giây mà MEVO In chưa có lời gọi gửi nhật ký nào
    sau thời điểm POS nối lại; (e) MEVO In đang mất kết nối (`agent_online` sai). Câu chữ theo đúng nguyên nhân: "Quầy
    dự phòng chưa gửi xong" cho (c)(d)(e); "Còn N lượt món đang nhận vào bill" cho (a); "Còn N lượt món nhập lúc mất
    mạng cần xử lý tay" cho (b).
  - **Trong màn Thanh toán và hộp Bỏ bàn:** hiện tình trạng của **đúng phiên đang thao tác**, lấy từ danh sách sự kiện
    POS đã đọc sẵn: "Bàn này còn N lượt món nhập lúc mất mạng chưa vào bill" (đếm cả `pending` lẫn `failed` chưa xử lý
    của phiên / bàn đó). Khi nguyên nhân là (c)(d)(e) thì POS chưa biết bàn nào dính, nên hiện câu chung "Có thể còn
    món nhập lúc mất mạng chưa lên bill".
  - Đây là **nhắc, không khoá**: khoá cứng sẽ chặn cả việc bán ngày thường mỗi khi MEVO In trục trặc (AG1). Rủi ro còn
    lại chỉ còn là thu ngân **cố tình bỏ qua** lời nhắc (lượt món rơi vào "Cần xử lý tay" sau khi khách đã về); rủi ro
    này được chấp nhận và ghi trong tờ quy trình. Thu ngân làm đúng theo băng nhắc thì không bị thu thiếu.
  - Nhãn **"Kiểm tra trùng"** trên bàn có sự kiện mang cờ gợi ý ở B5.6; tắt khi thu ngân đã mở bill bàn đó.
- **Đợt 3:** mục **"Đã nhận tiền mặt lúc mất mạng — chờ chốt"** (đặt cạnh khối "Bàn hết hạn còn tiền chưa thu"), xem B5.9.

### B5.8 Chế độ tập dượt

Phương án dự phòng hiếm khi dùng nên thu ngân phải tập được. Mở Quầy dự phòng lúc đang có mạng thì vào **tập dượt**:
khung màu khác, chữ "TẬP DƯỢT" trên mọi màn và mọi phiếu in, không ghi nhật ký thật, không gửi gì lên máy chủ. Đây
cũng là cách thử 4 máy in ngày lắp máy mà không cần rút dây mạng (bài thử rút dây thật vẫn bắt buộc, xem B8).

### B5.9 Đợt 3 — tiền mặt lúc mất mạng

- Quầy dự phòng: nút **Đã nhận tiền mặt** ghi `cash_received` (số thực nhận mặc định = tạm tính, sửa được, có ghi chú).
  Phiên chuyển "đã về"; bàn nhận được khách mới (phiên tạm mới). Nút **In tổng kết**.
- Máy chủ: `cash_received` lên bảng nhật ký thành **khoản chờ chốt**. Đây chính là trạng thái "chờ xác nhận" của luật
  tiền: MEVO chưa ghi đồng nào là đã thu.
- POS — chốt một khoản: mở đúng màn Thanh toán của phiên đó, tiền mặt điền sẵn. Chốt bằng **một RPC bọc ngoài** mới:
  trong cùng một giao dịch gọi `collect_table_bill` nguyên trạng (đúng mọi kiểm tra: số tiền khớp máy chủ, ca đang mở,
  chống trùng), rồi lùi các mốc thời gian của lần thu đó về `occurred_at` của khoản chờ chốt, và đánh dấu khoản đã
  chốt. **Không sửa `collect_table_bill` và lõi đóng phiên.** Giờ lùi lấy từ dòng nhật ký trên máy chủ, không nhận từ
  trình duyệt.
  - Tối thiểu phải lùi: `bill_payments.collected_at`, `orders.payment_received_at` (hai cột báo cáo ngày dựa vào).
    Người làm phải liệt kê mọi nơi khác ghi giờ lúc thu (đóng phiên, hoàn tất đơn, sổ quỹ, trừ kho, công nợ…) và quyết
    từng nơi; ghi kết quả vào plan.
  - **Chỉ lùi giờ của khoản thu do chính lần chốt này tạo ra.** `collect_table_bill` trả `{ok: true, already: true}`
    cả khi **máy khác đã thu phiên đó bằng một lần thu khác** (mig 112a, nhánh "Máy khác đã thu hết nhóm này"), nên
    `ok` không có nghĩa là "khoản vừa tạo". Luật của hàm bọc:
    - mã chống trùng của lần thu được suy ra từ `event_id` của khoản chờ chốt (một khoản chờ chốt = đúng một mã);
    - khoản chờ chốt đã chốt rồi → trả lại kết quả đã lưu, không gọi thu, không đụng giờ;
    - `collect_table_bill` trả `already = false` → khoản thu vừa được tạo bởi lần chốt này: lùi giờ của **đúng
      `payment_id` đó**, lưu `payment_id` vào khoản chờ chốt, đánh dấu đã chốt;
    - trả `already = true` → phiên đã được thu bằng giao dịch khác (thu thường trên POS, có thể là chuyển khoản):
      **không sửa bất kỳ mốc giờ nào**, không ghi thêm tiền. Khoản chờ chốt chuyển sang trạng thái "đã thu bằng giao
      dịch khác — cần đối chiếu"; POS hiện cạnh nhau số tiền mặt nhận lúc mất mạng và khoản thu đã có (giờ, cách thu,
      ai thu) để thu ngân xác nhận (có lý do) rằng đó là cùng một lần khách trả, hoặc báo quản lý nếu khách trả hai lần.
  - **Ca:** tiền thu vào **ca đang mở lúc chốt**. Thường đó chính là ca của buổi mất mạng, nhưng **không chắc**: quản
    lý có 4G có thể đã kết ca trong lúc quầy mất mạng, hoặc POS nối lại trước MEVO In và ai đó kết ca khi nhật ký tiền
    mặt chưa lên (lúc đó máy chủ chưa có khoản chờ chốt nào để chặn). Xử lý, theo thứ tự ưu tiên:
    1. Quy trình (tờ dán ở quầy): không kết ca khi quầy đang mất mạng hoặc khi POS còn băng nhắc.
    2. Hộp Kết ca hiện đúng băng nhắc của B5.7 (nhắc, không khoá); và máy chủ chặn kết ca khi đã có khoản chờ chốt.
    3. Lúc chốt, nếu `occurred_at` của khoản **sớm hơn giờ mở của ca đang mở** (ca gốc đã kết): không gắn im lặng.
       POS báo rõ "Khoản này nhận lúc HH:MM, thuộc ca đã kết. Ca đó đang thừa đúng số này; chốt bây giờ thì ca hiện
       tại lệch đúng số này", bắt buộc ghi chú, lưu ghi chú vào khoản. So giờ là đủ để nhận ra; **không** chép mã ca
       vào bản chép sẵn và **không** dựng luồng đối chiếu ca riêng (B11, điểm 5).
- Số thực nhận ≠ số máy chủ tính: POS hiện cả hai số và phần lệch. Thiếu → thu ngân sửa bill bằng công cụ hiện có (bỏ
  món, giảm giá, có lý do) cho tới khi khớp rồi chốt. Thừa → chốt theo số máy chủ tính, POS nhắc phần thừa đang nằm
  trong két để xử lý lúc kết ca. Không tự động sửa gì.
- **Chặn kết ca** khi quán còn khoản chờ chốt (kiểm ở máy chủ trong `close_cash_shift`, migration riêng), câu báo:
  "Còn N bàn đã nhận tiền mặt lúc mất mạng chưa chốt." Khoản ghi nhầm thì "Bỏ qua" có lý do.
- Thứ tự bàn quay vòng: chốt khoản của lượt khách trước → POS gọi lại RPC nhận vào bill → phiên tạm của lượt khách sau
  được mở → khoản chờ chốt của lượt sau (nếu có) mới chốt được.
- Chốt từng bàn một, không có nút chốt hàng loạt (mỗi lần chốt là một lần ghi tiền thật).

## B6. Bẫy đã biết

- `list_open_table_sessions` cho phiên hết hạn theo thời gian im lặng. Sau một buổi mất mạng dài, lần đọc đầu tiên của
  POS có thể cho hết hạn hàng loạt phiên **trước khi** nhật ký được nhận → RPC nhận vào bill phải chịu được (B5.6).
- Nhân viên có 4G riêng vẫn gửi đơn được trong lúc quầy mất mạng; đơn nằm chờ duyệt và có thể trùng với món thu ngân
  nhập tay. Xử lý bằng quy trình (bộ đàm báo ngừng gửi) + cảnh báo Đợt 1, không bằng code chặn.
- **Quán đặt chính sách xuống bếp là `automatic`** (đơn tự vào bếp, không qua Duyệt): thiết kế này nhắm quán có cả hai
  kênh là `pos_confirmation` (Yên Garden, Bảo Lương). Với kênh `automatic`, đơn gửi bằng 4G lúc quầy mất mạng không phải
  đơn chờ duyệt; khi MEVO In nối lại, `auto_kitchen_print_enqueue` chỉ tự in cho đơn trong 30 phút gần nhất. Việc tối
  thiểu phải làm ở Đợt 1: băng "vừa có mạng lại" đếm **mọi** đơn không phải nguồn `pos` tạo trong khoảng mất mạng (không
  chỉ đơn chờ duyệt), và với đơn tự vào bếp thì ghi "kiểm tra bếp đã có phiếu chưa". Không sửa `auto_kitchen_print_enqueue`,
  không khoá việc đổi chính sách.
- **Thao tác POS "máy chủ đã nhận, phản hồi bị mất" đúng lúc mạng rớt:** bản chép sẵn chưa kịp có thao tác đó, nên Quầy
  dự phòng không thấy. Nhập lại ở Quầy dự phòng sinh mã mới → cả hai lượt cùng vào bill dù từng lượt đều chống trùng.
  Xử lý bằng quy trình (ghi giấy, có mạng lại thì xem bill, bỏ lượt trùng) + nhãn gợi ý "Kiểm tra trùng" (B5.6); không
  làm cầu nối POS → Quầy dự phòng. Với **thu tiền**: Đợt 3 đã chịu được nhờ luật `already` ở B5.9.
- Đồng hồ máy quầy có thể sai → luôn hiệu chỉnh theo giờ máy chủ lúc chép gần nhất; máy chủ từ chối giờ vô lý.
- Giảm giá theo món có thể có khung giờ: nhập 18:50, gửi 21:00 → phải tính giá theo 18:50 (B5.6), nếu không tạm tính
  đã in sẽ lệch với bill.
- Giá bị sửa trên máy chủ trong lúc quầy mất mạng (chủ quán sửa từ xa): bill theo giá máy chủ; phần lệch với tạm tính
  hiện ra ở bước chốt (Đợt 3). Trước Đợt 3 thu ngân tự thấy khi thu trên POS.
- Token máy in bị thu hồi trong lúc mất mạng (ghép lại ở máy khác): nhật ký chưa gửi không được mất; cửa sổ ghép máy
  phải nhắc còn nhật ký chưa gửi, và sau khi ghép lại cùng quán thì gửi tiếp.
- MEVO In bản mới phải cài lại trên máy quầy (bản cài một chạm hiện có); bản cũ 0.2.0 vẫn in bình thường với máy chủ mới.

## B7. Thứ để người làm quyết

Tên bảng / RPC / cột; định dạng tệp trên đĩa; công nghệ giao diện trong cửa sổ Electron (không tải gì từ mạng lúc
chạy); cách dùng chung mã công thức; nhịp chép cụ thể (miễn đạt độ tươi ở B5.2); cách POS nhận biết có sự kiện
`pending` (thêm vào một lần đọc sẵn có hay một lần đọc mới); bố cục chi tiết trong cửa sổ (theo phác A3); chia task
theo `docs/WORKFLOW.md`.

## B8. Kiểm thử và "xong" của từng đợt

Mỗi đợt có checklist riêng ở `docs/testing/mat-mang/`, dừng chờ anh Tú báo PASS (luật test của `CLAUDE.md`).

- **Đợt 1:** vitest cho hàm thuần quyết định băng / nhãn. Test tay trên Bảo Lương: tắt mạng máy 2 phút, gửi một đơn
  từ điện thoại dùng 4G, bật mạng → thấy băng + nhãn, Duyệt / Từ chối chạy như cũ. Tờ quy trình in được trên A4.
- **Đợt 2:** PGlite (`supabase/tests`) cho RPC chép / gửi / nhận: chống trùng, giá theo `occurred_at`, món tạm hết,
  phiên hết hạn, phiên đã thu, bàn trống / bàn có khách, quyền, quán khác. vitest cho nhật ký (hỏng dòng cuối, dựng
  lại trạng thái), mẫu phiếu, chia trạm. Test tay **với 4 máy in thật ngày 24–25/11**: rút dây mạng thật; nhập món cho
  bàn đang mở và bàn trống; phiếu ra đúng máy; tắt máy bật lại vẫn còn; cắm mạng → món vào đúng bill một lần, không
  phiếu bếp nào in lại; tập dượt không để lại gì trên máy chủ. `python scripts/verify.py` xanh (hoặc chỉ còn nợ cũ).
  Thêm ba bài bắt buộc: (1) **thứ tự nối lại** — một phiếu `queued` từ trước lúc mất mạng và một phiếu đã In lại ở Quầy
  dự phòng đều **không** tự in ra khi cắm mạng lại (kể cả khi tắt máy rồi bật lại lúc đã có mạng); (2) **băng nhắc** —
  còn sự kiện `failed` chưa xử lý thì băng không tắt, và màn Thanh toán của đúng bàn đó có dòng cảnh báo; (3) **kiểm
  tra trùng** — thêm món trên POS, chặn phản hồi (máy chủ đã lưu), nhập lại ở Quầy dự phòng → có mạng lại bàn đó có nhãn.
- **Đợt 3:** như trên, thêm `npm run test:race` (chốt đua với thu thường, hai máy cùng chốt), test giờ lùi qua mốc
  ngày kinh doanh, chặn kết ca, bàn quay vòng hai lượt khách. Thêm: phiên đã được máy khác thu (kể cả chuyển khoản)
  rồi mới chốt → **không mốc giờ nào của khoản cũ bị đổi**, khoản chờ chốt sang "cần đối chiếu"; gọi chốt hai lần cho
  cùng một khoản → một khoản thu; ca gốc đã kết rồi mới chốt → có cảnh báo và bắt ghi chú.

## B9. Tài liệu phải cập nhật khi làm

`docs/PROJECT.md` (phạm vi + dòng "ý tưởng hoãn"), một dòng ở `docs/decisions.md`, `docs/features/` cho từng đợt,
`CLAUDE.md §6` nếu có công thức chép thêm, hướng dẫn cài MEVO In, tờ quy trình mất mạng (bản in).

## B10. Những điểm cần anh Tú duyệt (em đã tự chọn, anh sửa được)

1. **Chia ba đợt và lịch ở A6** — Đợt 3 (phần tiền) làm sau khai trương.
2. **Ngưỡng:** mất mạng 60 giây mới báo; lượt món chờ từ 10 phút hiện nhãn hỏi lại khách.
3. **MEVO In được đọc** thực đơn và bill đang mở của quán (để chép sẵn) và **được gửi nhật ký lên**; nó **không** được
   tự ghi món vào bill. Việc đó do POS của thu ngân đang đăng nhập làm.
4. **Danh sách việc Quầy dự phòng không làm** (A5), nhất là: không chuyển khoản, không giảm giá, không sửa món cũ.
5. **Đợt 3 đụng luồng thanh toán:** thêm một hàm chốt bọc ngoài hàm thu tiền hiện có (không sửa hàm thu tiền), ghi giờ
   thu thật; chặn kết ca khi còn khoản chờ chốt; chốt từng bàn một.
6. **Chế độ tập dượt** có trong Đợt 2.
7. **Quy trình:** khi quầy báo mất mạng, nhân viên ngừng gửi đơn qua điện thoại, ghi giấy / ghi chú rồi đọc cho thu ngân.
8. **Phần cứng nên có** (ngoài phần mềm): router có SIM 4G dự phòng hoặc ít nhất một dây USB + điện thoại phát 4G cho
   máy quầy; UPS cho máy quầy, modem, router.
9. **Sau khi có mạng lại, POS chỉ NHẮC, không khoá nút Thanh toán.** Băng nhắc hiện cho tới khi mọi lượt món nhập lúc
   mất mạng đã vào bill hoặc đã được xử lý tay, và màn Thanh toán ghi rõ tình trạng của đúng bàn đang thu. Thu ngân
   làm theo băng nhắc thì không thu thiếu; chỉ khi cố tình bỏ qua mới có thể thu thiếu. Em chọn nhắc vì khoá cứng có
   thể chặn nhầm việc bán ngày thường.
10. **Quầy dự phòng không đăng nhập.** Thu ngân chỉ chọn tên mình trong danh sách (tự khai). MEVO In vì vậy được chép
    thêm tên những người vận hành POS của quán.
11. **Khách tự quét QR ở bàn trống trong lúc quầy mất mạng:** món thu ngân nhập cho bàn đó được gộp vào bill mà khách
    vừa mở (coi là cùng một nhóm khách).
12. **Phiếu in đang chờ từ trước lúc mất mạng không tự in ra khi có mạng lại**; thu ngân chọn In lại hoặc Bỏ ở băng
    phiếu lỗi.
13. **Trước khi có Đợt 3**, nếu mất mạng cả tối thì tiền tối đó nằm trong báo cáo của ngày hôm sau.
14. **Chỉ nhắm quán duyệt đơn ở POS** (cả hai kênh `pos_confirmation`). Quán cho đơn tự vào bếp chỉ được cảnh báo, chưa
    được xử lý trọn.
15. **Việc bấm trên POS đúng lúc mạng rớt được xử lý bằng quy trình, không bằng code nặng:** thu ngân ghi giấy, có mạng
    lại thì xem bill và bỏ lượt trùng; máy chỉ gắn nhãn "Kiểm tra trùng" để nhắc. Em không làm phần chuyển dữ liệu từ
    POS sang Quầy dự phòng.
16. **Không kết ca khi quầy đang mất mạng hoặc POS còn băng nhắc** (kể cả quản lý kết hộ bằng 4G). Nếu vẫn lỡ kết, lúc
    chốt tiền POS báo rõ ca nào thừa, ca nào lệch và bắt ghi chú; MEVO không tự dời tiền giữa hai ca.

## B11. Lượt review của Codex (2026-11-18) — tiếp thu gì, không làm gì

Anh Tú dặn: chỗ hợp lý thì tiếp thu; chỗ quy trình và con người xử lý được thì không thêm code rắc rối. Cả năm điểm
đều đã đối chiếu với mã thật trước khi quyết.

| # | Codex nêu | Đúng không | Quyết | Sửa ở |
|---|---|---|---|---|
| 1 | Thao tác POS máy chủ đã nhận nhưng quầy không biết → nhập lại ở Quầy dự phòng thành trùng | Đúng | **Tiếp thu vấn đề, không làm cầu nối POS → Quầy dự phòng.** Quy trình (ghi giấy, xem bill, bỏ lượt trùng) + một cờ gợi ý rẻ trên máy chủ | A2 kịch bản 1 và 3, A4, B5.4, B5.6, B5.7, B6, B10.15 |
| 2 | Dùng lần hỏi việc in để dò mạng thì phiếu cũ đã thành `printing` trước khi kịp vô hiệu hoá | Đúng (`print_agent_poll`, mig 114) | **Tiếp thu trọn.** Trạng thái phục hồi: ngừng hỏi việc in, dò mạng bằng lời gọi gửi nhật ký, xong mới in tiếp | A4, B5.3, B8 |
| 3 | "Đã gửi xong" chưa phải "đã vào bill"; băng nhắc bỏ sót sự kiện `failed` | Đúng | **Tiếp thu trọn**, vẫn giữ "nhắc, không khoá". Băng tính cả `failed`; màn Thanh toán báo theo đúng bàn | A4, B5.3, B5.7, B8, B10.9 |
| 4 | Hàm chốt bọc ngoài có thể lùi giờ của khoản thu khác vì `already: true` | Đúng (`collect_table_bill`, mig 112a) | **Tiếp thu trọn.** Chỉ lùi giờ khoản do chính lần chốt này tạo; còn lại sang đối chiếu | A4, B5.9, B8 |
| 5 | "Ca cũ chắc chắn còn mở" không luôn đúng | Đúng | **Tiếp thu vấn đề, làm gọn hơn đề xuất.** Quy trình cấm kết ca lúc mất mạng + nhắc ở hộp Kết ca + cảnh báo khi chốt vào ca khác. Không chép mã ca, không dựng luồng đối chiếu ca | A2 kịch bản 4, B5.9, B8, B10.16 |
