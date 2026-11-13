# Kiểm tra bổ sung cho verify

Mỗi file `*.sh` ở đây được `python scripts/verify.py` chạy theo thứ tự tên. Exit khác 0 = verify đỏ.

Ví dụ khi friction log cho thấy cần:
- `10-db-types.sh` — kiểm type DB đã sinh lại sau migration: `pnpm db:types && git diff --exit-code src/contracts/db.ts`
- `20-e2e.sh` — chạy Playwright e2e: `pnpm exec playwright test --reporter=line`
- `30-no-console.sh` — chặn `console.log` sót trong `src/`.

Thêm/sửa file ở đây do orchestrator làm (không bị bảo vệ), nhưng **không được** dùng để bỏ qua bước khác của verify.
