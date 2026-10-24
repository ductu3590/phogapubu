# Landing mevo.vn — cấu trúc, deploy, kiểm tra

Quyết định (2026-10-23): **phương án A** — landing nằm ngay tại `/` của project Vercel `phogapubu` (Root Directory `admin-web`).
Khu quản lý giữ nguyên URL (`/login`, `/admin`, `/staff`, `/mevo`, `/kitchen`, `/print`, `/api/*`, `/privacy`, `/terms`).
**Không đổi DNS, không đổi domain, không cần redirect** → Bảo Lương/Pubu không bị ảnh hưởng.

## Code nằm ở đâu
| Việc | File |
|---|---|
| Đổi SĐT / Zalo / email / vùng phục vụ / link video nền | `admin-web/lib/landing/site.ts` |
| Sửa chữ: mô hình quán, dịch vụ, sản phẩm, quy trình, dải chạy ngang, hỏi đáp | `admin-web/lib/landing/content.ts` |
| Bố cục các section (giao diện tối, video nền, hiệu ứng trượt lên) | `admin-web/components/landing/*.tsx` |
| CSS hiệu ứng + dải chạy ngang | khối "Landing mevo.vn" trong `admin-web/app/globals.css` |
| Title/meta/OG/JSON-LD | `admin-web/app/page.tsx` |
| sitemap / robots | `admin-web/app/sitemap.ts`, `admin-web/app/robots.ts` |
| Ảnh chia sẻ (1200×630) | `admin-web/public/og.png` |
| Chuyển người đã đăng nhập từ `/` về `/admin` | `admin-web/proxy.ts` + `lib/auth/session-cookie.ts` |

**Video nền tự host trên CDN Vercel** (quyết định 2026-10-24): file nằm ở `admin-web/public/landing/`
(`hero.mp4`, `feature-order.mp4`, `feature-realtime.mp4`), phục vụ từ chính `mevo.vn`.
- Lấy file lần đầu (máy anh Tú, sandbox của Claude bị chặn host `cdn.sceneai.art`):
  `node scripts/fetch-landing-videos.mjs` → `git add admin-web/public/landing` → commit → push.
  Có `ffmpeg` thì script tự nén 720p không tiếng.
- Khi chưa có file, trang tự dùng link gốc sceneai.art làm dự phòng (`VIDEOS` trong `site.ts`). Commit xong 3 file
  thì xoá link dự phòng.
- Video chỉ tải khi cuộn tới, bỏ qua khi máy bật tiết kiệm dữ liệu / giảm chuyển động; hỏng hết thì nền gradient vẫn hiện.

**Không ghi tên quán khách hàng** trên landing (quyết định 2026-10-24): chỉ nêu giải pháp, công nghệ.

Thêm ảnh chụp màn hình thật: thả file vào `admin-web/public/landing/`, thay `<ShotPlaceholder>` bằng `next/image`.
Khi có địa chỉ cố định: thêm `address` vào JSON-LD trong `app/page.tsx`.

## Deploy (không cần chỉnh DNS)
1. Push nhánh `feat/landing-mevo-vn` → Vercel tự tạo **Preview URL** (xem trong PR).
2. Mở Preview URL trên điện thoại, duyệt giao diện + chạy checklist bên dưới.
3. Merge vào `main` → Vercel deploy production lên `mevo.vn`.
4. Sau khi lên: Google Search Console → thêm `https://mevo.vn/sitemap.xml`; thử chia sẻ link lên Zalo/Facebook để kiểm ảnh OG.
5. Rollback nếu cần: Vercel → Deployments → bản trước → *Promote to Production* (hoặc `git revert` commit merge).

Tuỳ chọn sau này: thêm domain `admin.mevo.vn` làm alias cùng project (Vercel → Settings → Domains) — chưa cần, và KHÔNG cắt `mevo.vn/login`.

## Checklist kiểm tra login Bảo Lương / Pubu (làm trên Preview, rồi làm lại trên mevo.vn sau khi merge)
- [ ] `/login` hiện form đăng nhập; đăng nhập tài khoản Bảo Lương (chủ quán) → vào `/admin/pos`.
- [ ] Đăng nhập tài khoản nhân viên Bảo Lương → vào `/staff`.
- [ ] Đăng nhập `pubu@mevo.vn` → vào `/admin`.
- [ ] Đang đăng nhập, mở lại `mevo.vn` (gõ tay hoặc bookmark) → tự chuyển về `/admin` (không kẹt ở landing).
- [ ] Máy POS đang mở sẵn: tải lại trang, PIN khoá màn hình vẫn còn (cùng origin nên không mất).
- [ ] `/privacy`, `/terms` vẫn mở được (Zalo console đang trỏ vào).
- [ ] Mini App Zalo: đặt thử 1 đơn → đơn vào POS (webhook `/api/zalo-webhook/<storeId>` vẫn nhận).
- [ ] Chưa đăng nhập, vào `/admin` → bị đưa về `/login` như cũ.
- [ ] Landing: nút Zalo mở `zalo.me/0962814888`, nút Gọi bấm ra số `0962 814 888`, chip menu cuộn đúng mục, không cuộn ngang trên điện thoại.

## Kết quả kiểm tra khi build (Lighthouse, bản build production chạy local)
- Giao diện tối (2026-10-24): mobile Performance 87–90 (giả lập 4G, dao động giữa các lần đo; đo throttling thật: 90,
  LCP 2.5s) · Accessibility 100 · Best Practices 96 · SEO 100. Desktop: 100 · 100 · 96 · 100.
- Best Practices 96 chỉ vì sandbox không tải được video CDN (lỗi console mạng); trên Vercel video tải được thì hết lỗi.
- Phần lớn LCP mobile là 8 file font Be Vietnam Pro preload từ layout gốc (dùng chung với khu quản lý) — đo lại bằng
  PageSpeed Insights trên Preview URL để có số thật.
