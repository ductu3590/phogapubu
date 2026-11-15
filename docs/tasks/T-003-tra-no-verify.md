---
id: T-003
title: Trả nợ verify — test chập chờn, typecheck mini-app, test DB 048 trên Windows
agent: backend-dev
status: done
depends_on: [T-000, T-001]
paths:
  - admin-web/lib/server-client-boundary.test.ts
  - supabase/tests/048_pos_table_areas.test.mjs
  - mini-app/src/app.tsx
  - mini-app/src/index.ts
  - mini-app/src/services/category/category.api.ts
  - mini-app/src/types/**
---
## Mục tiêu
Đưa 3 bước nợ cũ của verify về xanh **không đổi hành vi**. Để sau T-001 nếu đụng cùng file mini-app (T-001 sửa `mini-app/src`).

## Việc
1. `admin-web/lib/server-client-boundary.test.ts`: test quét file mất ~7.7s khi chạy cả bộ → đặt timeout riêng cho test này
   (KHÔNG hạ chất lượng kiểm, KHÔNG skip).
2. `supabase/tests/048_pos_table_areas.test.mjs`: import PGlite theo cùng cách 31 file khác (`pathToFileURL(process.env.PGLITE_MODULE)`).
3. `mini-app` typecheck 4 lỗi: `SnackbarProvider` (type zmp-ui), `../app-config.json` vắng ở source lõi (cần khai báo type
   không làm hỏng build worktree quán — vd. `src/types/app-config.d.ts`), `category.api.ts` `SelectQueryError` (sửa select/kiểu, không đổi dữ liệu trả về).

## Tiêu chí chấp nhận
- [ ] `python scripts/verify.py` xanh hoàn toàn, baseline về 0 cho 3 bước này
- [ ] Không file nghiệp vụ nào đổi hành vi (diff chỉ gồm test + khai báo type + ép kiểu)
- [ ] `npm run build` trong một worktree quán (anh Tú chạy) vẫn qua sau khi merge
