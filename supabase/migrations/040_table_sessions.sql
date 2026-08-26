-- 040_table_sessions.sql — BL-1 (b): phiên bàn, nền của "gọi nhiều lượt, trả một lần"
-- Spec: docs/superpowers/specs/2026-08-26-postpay-table-session-print-design.md §3
--
-- MỘT BÀN, NHIỀU ĐIỆN THOẠI, MỘT HOÁ ĐƠN. Bốn người cùng bàn mỗi người gọi từ máy mình phải
-- chung một bill → không gộp theo zalo_user_id, cũng KHÔNG gộp theo table_id trần (bàn quay
-- vòng thì khách sau thấy hoá đơn khách trước).
--
-- File này CHỈ dựng bảng + ràng buộc. RPC mở/đóng phiên nằm ở BL-2 (042) và BL-4 (043);
-- tới hết BL-1 bảng này còn rỗng và không ai ghi vào nó.

-- ============================================================
-- 1) Bảng
-- ============================================================
create table if not exists table_sessions (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id),
  table_id        uuid not null references tables(id),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz null,
  close_reason    text null,
  closed_by       uuid null,           -- auth.uid() của người bấm thu tiền (audit)
  instrument      text null,           -- khách trả bằng gì, ghi lúc ĐÓNG phiên
  needs_review_at timestamptz null,    -- phiên quá hạn, CHỜ nhân viên xử lý (§3.6)
  total_amount    int not null default 0
);

alter table table_sessions drop constraint if exists table_sessions_close_reason_check;
alter table table_sessions add constraint table_sessions_close_reason_check
  check (close_reason in ('paid','void'));

alter table table_sessions drop constraint if exists table_sessions_instrument_check;
alter table table_sessions add constraint table_sessions_instrument_check
  check (instrument in ('cash','bank'));

-- Phiên đóng thì phải nói rõ vì sao đóng; phiên mở thì không được có lý do đóng.
alter table table_sessions drop constraint if exists table_sessions_close_state_check;
alter table table_sessions add constraint table_sessions_close_state_check
  check ((closed_at is null and close_reason is null)
      or (closed_at is not null and close_reason is not null));

-- MỘT bàn chỉ có ĐÚNG MỘT phiên mở tại một thời điểm.
-- Chốt chặn ở DB chứ không ở app code: hai máy khách bấm "Gửi đơn" cùng giây thì một cái phải
-- thua ở tầng index, không phụ thuộc vào việc RPC có nhớ kiểm tra hay không.
create unique index if not exists table_sessions_one_open_per_table
  on table_sessions(table_id) where closed_at is null;

create index if not exists table_sessions_open_by_store_idx
  on table_sessions(store_id) where closed_at is null;

-- ============================================================
-- 2) orders.table_session_id — FK phải là COMPOSITE (§3.2)
-- ============================================================
-- FK đơn lẻ (table_session_id → table_sessions.id) KHÔNG đảm bảo đơn và phiên cùng quán,
-- cùng bàn. Chỉ cần một chỗ gán nhầm là bill bàn 5 nuốt đơn bàn 2 — và sai kiểu đó thì
-- không ai phát hiện cho tới lúc khách cãi nhau ở quầy.
alter table orders add column if not exists table_session_id uuid null;

alter table table_sessions drop constraint if exists table_sessions_id_store_table_key;
alter table table_sessions add constraint table_sessions_id_store_table_key
  unique (id, store_id, table_id);

alter table orders drop constraint if exists orders_session_same_store_table_fk;
alter table orders add constraint orders_session_same_store_table_fk
  foreign key (table_session_id, store_id, table_id)
  references table_sessions(id, store_id, table_id);

-- ⚠️ FK nhiều cột mặc định MATCH SIMPLE: có BẤT KỲ cột nào NULL thì KHÔNG kiểm tra.
--    Đúng thứ ta cần — đơn prepay và đơn takeaway có table_session_id/table_id NULL nên đi
--    qua tự do; đơn postpay tại bàn có đủ 3 cột nên bị soi chặt.
--    ĐỪNG đổi sang MATCH FULL: nó sẽ chặn mọi đơn takeaway.

create index if not exists orders_table_session_idx
  on orders(table_session_id) where table_session_id is not null;

-- ============================================================
-- 3) RLS — bảng này quyết định AI NỢ BAO NHIÊU TIỀN
-- ============================================================
-- Supabase cấp sẵn quyền cho anon/authenticated trên bảng mới trong schema public.
-- Không revoke = mini-app khách sửa thẳng phiên qua REST.
alter table table_sessions enable row level security;

revoke all on table_sessions from anon;
revoke all on table_sessions from authenticated;

-- ĐỌC: operator đúng quán (nếp mig 019) + role kitchen cho màn quầy (nếp mig 007a).
grant select on table_sessions to authenticated;
grant select on table_sessions to kitchen;

drop policy if exists "op_select_table_sessions" on table_sessions;
create policy "op_select_table_sessions" on table_sessions
  for select to authenticated using (is_store_scoped_operator(store_id));

drop policy if exists "kitchen_select_table_sessions" on table_sessions;
create policy "kitchen_select_table_sessions" on table_sessions
  for select to kitchen using (store_id = kitchen_store_id());

-- GHI: KHÔNG policy nào, KHÔNG grant nào. Mọi INSERT/UPDATE chỉ qua RPC SECURITY DEFINER
-- đã kiểm quyền (create_order ở 042, close/void ở 043). Khách xem tạm tính qua RPC
-- get_table_bill (044), không đọc thẳng bảng.
