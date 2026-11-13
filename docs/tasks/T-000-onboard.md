---
id: T-000
title: Onboarding harness cho code đang có (verify chạy được, contracts hiện trạng, chỉ đường)
agent: orchestrator
status: todo
depends_on: []
paths: ["**"]
---
## Mục tiêu
Đưa dự án đang làm dở vào khuôn harness **mà không sửa hành vi** của code hiện có. Sau task này các task khác chạy song song được.

## Việc cần làm
1. `python scripts/verify.py` chạy được đến cuối (đỏ cũng được — miễn là đỏ vì lỗi code, không vì thiếu công cụ). Thiếu script `typecheck`/`test` thì **thêm mới** vào package.json (thêm thì được, sửa script cũ bị cổng chặn).
2. Nếu verify đỏ vì nợ cũ: báo anh Tú chạy `python scripts/baseline.py capture` (agent không tự chụp baseline được). Sau đó verify phải xanh với nhãn "nợ cũ".
3. Contracts hiện trạng: gom type/schema đang dùng chung giữa FE/BE vào `src/contracts/` (hoặc ghi rõ trong ARCHITECTURE.md chúng đang nằm ở đâu nếu chưa nên di chuyển). **Không đổi shape dữ liệu.**
4. Viết test đặc tả (characterization test) cho 1–3 luồng quan trọng nhất trong `docs/STATUS.md` — test ghi lại hành vi hiện tại, kể cả hành vi có vẻ sai (đánh dấu `BUG:`).
5. Kiểm `python scripts/run.py start` + `python scripts/ui_shot.py /` (nếu có UI). Sai `dev_cmd`/`port` → sửa `.harness/config.json`.
6. Điền mục "Chỉ đường nhanh" trong ARCHITECTURE.md cho các chỗ hay sửa.

## Tiêu chí chấp nhận
- [ ] `python scripts/verify.py` xanh (có thể kèm "nợ cũ" đã được anh chụp baseline)
- [ ] Có ít nhất 1 test đặc tả chạy trong verify
- [ ] `python scripts/run.py start` chạy được
- [ ] `docs/ARCHITECTURE.md` mô tả đúng cấu trúc thật, có vị trí contracts
- [ ] Không file code nghiệp vụ nào bị đổi hành vi (diff chỉ gồm: test mới, contracts gom lại, config, docs)
