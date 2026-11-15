# T-003 — Trả nợ verify

- `admin-web/lib/server-client-boundary.test.ts`: timeout riêng 30s (vẫn quét đầy đủ, không skip).
- `supabase/tests/048_pos_table_areas.test.mjs`: import PGlite qua `pathToFileURL` như test 049 (chạy được trên Windows).
- `mini-app/src/types/app-config.d.ts`: khai báo module `*app-config.json`. Chỉ được dùng khi file thật vắng (source lõi); worktree quán có file thật thì TS dùng file thật.
- Không đổi hành vi nghiệp vụ.
