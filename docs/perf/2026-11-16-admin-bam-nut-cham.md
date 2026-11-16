# Vì sao bấm nút trên admin (mevo.vn) chậm — đo 2026-11-16

Đo bằng Chrome trên production, tài khoản chủ quán Yên Garden, từ Việt Nam. Số dạng `byte đầu / xong` (ms), 3 lần.

| Yêu cầu | Thời gian | Ghi chú |
|---|---|---|
| File tĩnh (favicon, không qua proxy) | 65 / 65 | khứ hồi trình duyệt ↔ Vercel edge `hkg1` |
| URL không tồn tại, qua `proxy.ts` | ~200 | proxy gọi `supabase.auth.getUser()` mọi request: +~135ms |
| Bấm Thực đơn / Hoá đơn / POS (RSC) | ~350 / 880–1075 | |
| Báo cáo / Cài đặt | ~350 / 640–780 | |
| **Sơ đồ bàn & QR** | ~330 / **3100–3360** | payload **384KB**, 61 ảnh QR PNG |
| Bấm thật trên rail (điều hướng mềm) | Món 1150, Hoá đơn 980, Thu chi 875, Báo cáo 730, Công nợ 670 | |

## Nguyên nhân (xếp theo mức ảnh hưởng)

1. **Máy chủ web và DB ở hai nước.** `admin-web/vercel.json` ép hàm chạy ở `sin1` (Singapore) từ MVP; Supabase
   project `dlkgdpexjtyynbotkwka` ở **`ap-south-1` (Mumbai)**. Mỗi câu hỏi DB là một chuyến Singapore↔Mumbai
   (~60–100ms), và một lần bấm có 5–8 chuyến NỐI TIẾP: proxy `getUser` → `loadOperator` `getUser` → `mevo_operators`
   → các truy vấn của trang (vd. `menu/page.tsx`: categories → toppings → get_print_settings → discounts, từng cái
   `await` riêng). Cộng lại ~600–900ms chỉ để chờ mạng.
2. **Sơ đồ bàn & QR dựng sẵn QR cho MỌI bàn trên máy chủ mỗi lần mở** (`app/admin/tables/page.tsx`,
   `generateTableQR` × 61 bàn) rồi gửi cả 61 ảnh data-URL về → 3 giây, 384KB.
3. **`getUser()` là chuyến mạng tới Supabase Auth**, chạy 2 lần mỗi request (proxy + `loadOperator`).
4. Truy vấn độc lập trong một trang chạy tuần tự thay vì `Promise.all` (rõ nhất ở `menu/page.tsx`).

## Hướng sửa

Đã làm 2026-11-16 (nhánh `claude/timeline-ui-buttons-43fcde`, chưa deploy): đổi vùng sang `bom1`; Sơ đồ bàn & QR vẽ QR
ở trình duyệt (payload trang còn ~33KB với 25 bàn, không còn ảnh nhúng). Hai mục cuối dưới đây chưa làm.


- **Đổi vùng hàm Vercel sang `bom1` (Mumbai)** cạnh DB: 1 dòng `vercel.json`. Đổi lại mỗi request thêm ~1 chuyến
  hkg↔Mumbai (~80ms) nhưng mỗi chuyến DB còn ~2–5ms. Ước lượng bấm nút còn ~350–500ms. Rủi ro thấp, đảo lại được.
- Sơ đồ bàn & QR: vẽ QR ở trình duyệt (hoặc chỉ lúc in), không dựng 61 ảnh trên máy chủ.
- Gộp truy vấn độc lập bằng `Promise.all` ở `menu/page.tsx` và các trang khác.
- Lâu dài: chuyển ký JWT sang khoá bất đối xứng để dùng `getClaims()` (xác thực tại chỗ, không chuyến mạng) — đụng
  auth, cần thiết kế riêng.
