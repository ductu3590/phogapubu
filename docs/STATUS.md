# Hiện trạng dự án — mevo

> Ảnh chụp lúc áp harness (2026-11-13). /adopt điền từ code thật + `.harness/adopt-report.md`. Mỗi task done cập nhật dòng tương ứng.
> Mọi đánh giá phải có **bằng chứng** (file, route, test, ảnh chụp) — không ghi theo trí nhớ hay README cũ.

## Tóm tắt
- Đã chạy được: 
- Đang dở: 
- Chưa làm: 
- Nợ kỹ thuật lớn nhất: 

## Tính năng
| Tính năng | Trạng thái | Bằng chứng | Có test? | Ghi chú |
|---|---|---|---|---|
| <tên> | ✅ chạy / 🟡 dở / ❌ chưa / 💥 hỏng | `src/app/login/page.tsx`, ảnh `.harness/screens/login.png` | không | |

## Việc đang dở khi áp harness
| Nguồn | Nội dung | Xử lý |
|---|---|---|
| nhánh `feature/x` | +12 commit, 3 tuần trước | → T-00N (`python scripts/task.py start T-00N --from feature/x`) |
| file chưa commit | `src/...` | anh quyết: commit / cất sang nhánh wip / bỏ |
| TODO/FIXME | 23 chỗ, nhiều nhất `src/...` | gom vào task liên quan |

## Vùng không đụng (legacy)
<!-- Anh Tú chỉ định. Được thêm vào gates.json → legacy. -->

## Nợ cũ (baseline)
<!-- python scripts/baseline.py show — dán kết quả vào đây khi chụp baseline. Mục tiêu: về 0. -->
