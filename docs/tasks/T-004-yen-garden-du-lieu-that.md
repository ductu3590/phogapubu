---
id: T-004
title: Yên Garden — dọn dữ liệu mẫu, nhập dữ liệu thật trước go-live
agent: orchestrator
status: blocked
depends_on: [T-001]
paths:
  - docs/testing/yen-garden/**
---
## Mục tiêu
Quán `yen-garden` trên prod chỉ còn dữ liệu thật trước chạy thử 27/11.

## Chờ anh Tú (blocked)
Menu thật (~15/11), sơ đồ bàn >40 bàn / 3 khu + tên bàn theo khu (A1…), Zalo App ID, quyết định nén lại ảnh món.

## Việc (qua `/admin`, `/mevo` hoặc SQL qua MCP — xoá dữ liệu prod phải HỎI TRƯỚC, liệt kê đúng dòng sẽ xoá)
1. Xoá dữ liệu mẫu: bàn "Bàn mẫu 1/2", 3 danh mục + 5 topping có chữ "(mẫu)", 9 món ảnh Unsplash, đơn thử ở Bàn mẫu 1.
2. Nhập menu thật, tạo bàn hàng loạt theo khu (mig 121), cấu hình 4 trạm in (Quầy, Bếp, Nướng, Bar).
3. Kiểm chính sách duyệt đơn (`pos_confirmation` mặc định, admin đổi được) và tài khoản 5 vai đã tạo.

## Tiêu chí chấp nhận
- [ ] Truy vấn SQL kiểm: 0 bản ghi tên chứa "(mẫu)" / "Bàn mẫu" của quán `yen-garden`
- [ ] Mini App Yên Garden mở menu thật, POS hiện đúng sơ đồ 3 khu
- [ ] Checklist ngắn `docs/testing/yen-garden/GO-LIVE.md` được anh Tú PASS
