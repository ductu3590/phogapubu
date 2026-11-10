-- Mig 128: list_open_table_sessions trả thêm cờ `needs_pos_confirmation` cho từng đơn.
--
-- Vì sao: đơn "tự vào bếp" (chính sách xuống bếp = automatic cho kênh của nó) vẫn nằm ở status 'pending' trong DB —
-- bếp / phần mềm in hiểu là đã vào bếp (orderInKitchen), nhưng POS và màn nhân viên coi MỌI đơn 'pending' là "chờ
-- duyệt": hiện ở hàng việc, ô bàn vàng, khoá nút Thanh toán cho tới khi ai đó bấm Duyệt (test CFG bài 7, Bảo Lương:
-- đơn nhân viên với staff_order_release_policy = automatic đã tự in phiếu bếp mà POS vẫn đòi xác nhận).
--
-- Cờ = 'pending' + không phải món ghi tay / món đặt trước + chính sách của KÊNH đơn (nhân viên → staff_order_release_policy,
-- còn lại → kitchen_release_policy) là 'pos_confirmation'. Đọc chính sách lúc đọc (store_workflow_snapshot, có giá trị
-- mặc định khi quán chưa có dòng cài đặt) → đổi chính sách là danh sách đổi theo, không viết lại đơn cũ.
-- Client (lib/pos-work-queue.ts isReviewableOrder) đọc cờ này; RPC cũ chưa có cờ thì rơi về luật cũ.
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Mỗi neo một dòng, phải khớp đúng một lần; không khớp thì RAISE
-- (đã vá rồi cũng RAISE — không chạy lại lần hai).

DO $mig$
DECLARE
  v_sig   regprocedure := 'public.list_open_table_sessions(uuid)'::regprocedure;
  v_def   text := pg_get_functiondef(v_sig);
  v_pairs text[][] := ARRAY[
    [$a$  v_rows jsonb;$a$,
     $n$  v_rows jsonb;
  v_kitchen_policy text; -- mig 128
  v_staff_policy text;$n$],
    [$a$  PERFORM public.expire_stale_table_sessions(p_store_id);$a$,
     $n$  PERFORM public.expire_stale_table_sessions(p_store_id);

  -- mig 128: chính sách xuống bếp theo kênh, để đánh dấu đơn nào thật sự chờ POS duyệt.
  SELECT w ->> 'kitchen_release_policy', w ->> 'staff_order_release_policy'
    INTO v_kitchen_policy, v_staff_policy
    FROM (SELECT public.store_workflow_snapshot(p_store_id) AS w) x;$n$],
    [$a$           COALESCE(order_data.orders, '[]'::jsonb) AS orders,$a$,
     $n$           COALESCE((
             SELECT jsonb_agg(e.value || jsonb_build_object('needs_pos_confirmation',
                      e.value ->> 'status' = 'pending'
                      AND e.value ->> 'order_source' NOT IN ('pos', 'reservation_preorder')
                      AND CASE WHEN e.value ->> 'order_source' = 'staff' THEN v_staff_policy ELSE v_kitchen_policy END
                          IS DISTINCT FROM 'automatic')
                    ORDER BY e.ordinality)
               FROM jsonb_array_elements(order_data.orders) WITH ORDINALITY AS e(value, ordinality)
           ), '[]'::jsonb) AS orders,$n$]
  ];
  v_anchor text;
  v_count  integer;
  i        integer;
BEGIN
  IF position('mig 128' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 128: list_open_table_sessions đã được vá rồi';
  END IF;
  FOR i IN 1 .. array_length(v_pairs, 1) LOOP
    v_anchor := v_pairs[i][1];
    v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'mig 128: neo % khớp % lần (cần đúng 1) — thân hàm prod đã khác, không vá: %', i, v_count, v_anchor;
    END IF;
    v_def := replace(v_def, v_anchor, v_pairs[i][2]);
  END LOOP;
  EXECUTE v_def;
END
$mig$;
