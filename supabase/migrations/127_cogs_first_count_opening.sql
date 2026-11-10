-- Mig 127: giá vốn (inventory_cogs) coi phần ĐẾM DƯ của lần kiểm kho ĐẦU TIÊN là tồn đầu, không phải "dùng âm".
--
-- Vì sao: nguyên liệu có phiếu kiểm trong kỳ thì SL dùng = tồn đầu + nhập − huỷ − tồn cuối (mig 118). Quán bắt đầu dùng
-- kho bằng một phiếu kiểm khai tồn đầu (máy 0 → đếm 5 kg thịt): 5 kg đó không đi qua phiếu nhập nào nên công thức ra
-- SL dùng = 0 + 1,5 − 6,5 = −5 → giá vốn nguyên liệu ÂM (Bảo Lương 01–10/11: −630.000đ), lãi gộp lớn hơn cả doanh thu.
-- Tháng go-live nào cũng dính đúng số tiền tồn đầu khai báo.
--
-- Sửa: với mỗi hàng, lần kiểm posted ĐẦU TIÊN (chưa từng có phiếu kiểm nào trước nó) nếu nằm trong kỳ thì phần đếm DƯ
-- so với tồn máy ngay trước lúc kiểm được coi như hàng vào kho:
--   * nguyên liệu: cộng vào SL dùng (bù đúng phần "tự sinh") → SL dùng = đầu + nhập + dư_kiểm_đầu − huỷ − cuối;
--   * mọi loại: nếu dòng kiểm có giá, vào bình quân giá kỳ như một dòng nhập (SL dư × giá ghi ở phiếu kiểm).
-- Phần đếm THIẾU ở lần kiểm đầu giữ nguyên (là hao hụt / dùng thật). Các lần kiểm sau giữ nguyên như 118: kiểm dư lần
-- sau là sai số đếm, vẫn làm giảm SL dùng (thấy được ở thẻ kho). Lần kiểm đầu nằm TRƯỚC kỳ thì không đổi gì: tồn đầu kỳ
-- đã gồm nó và giá của nó đã vào giá đầu kỳ (pr). Tồn máy trước lúc kiểm tính lại bằng inventory_stock_at (mốc < lúc
-- kiểm), KHÔNG đọc system_qty vì đó chỉ là ảnh chụp lúc lưu (nhập ghi lùi sau đó làm nó lệch).
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE), KHÔNG chép thân hàm từ file 118. Mỗi neo một dòng, phải khớp
-- đúng một lần; không khớp thì RAISE (đã vá rồi cũng RAISE — không chạy lại lần hai).

DO $mig$
DECLARE
  v_sig   regprocedure := 'public.inventory_cogs(uuid,date,date)'::regprocedure;
  v_def   text := pg_get_functiondef(v_sig);
  v_pairs text[][] := ARRAY[
    -- 1) CTE lần kiểm đầu tiên của từng hàng, chỉ giữ cái nằm trong kỳ, kèm phần đếm dư so với tồn máy ngay trước đó.
    [$a$  pr AS ($a$,
     $n$  -- mig 127: lần kiểm ĐẦU TIÊN của hàng nằm trong kỳ → phần đếm dư = tồn đầu khai báo (xem đầu file 127).
  fc0 AS (
    SELECT DISTINCT ON (dl.inventory_item_id) dl.inventory_item_id, d.effective_at AS at, dl.counted_qty, dl.unit_cost
      FROM public.inventory_document_lines dl
      JOIN public.inventory_documents d ON d.id = dl.document_id
     WHERE d.store_id = p_store_id AND d.kind = 'count' AND d.status = 'posted'
     ORDER BY dl.inventory_item_id, d.effective_at, d.created_at, d.doc_no
  ),
  fc AS (
    SELECT f.inventory_item_id, f.unit_cost,
           greatest(f.counted_qty - coalesce((SELECT st.qty FROM public.inventory_stock_at(p_store_id, f.at) st
                                               WHERE st.inventory_item_id = f.inventory_item_id), 0), 0) AS gain
      FROM fc0 f
     WHERE f.at >= v_f AND f.at < v_t
  ),
  pr AS ($n$],
    -- 2) Cột của lần kiểm đầu trên base: gain (SL dư), rq_p / rv_p (SL / tiền vào dùng cho bình quân giá kỳ).
    [$a$           coalesce(mv.counted, false) AS counted,$a$,
     $n$           coalesce(mv.counted, false) AS counted,
           coalesce(fc.gain, 0) AS gain,
           coalesce(mv.rq, 0) + CASE WHEN fc.unit_cost IS NOT NULL THEN coalesce(fc.gain, 0) ELSE 0 END AS rq_p,
           coalesce(mv.rv, 0)::numeric
             + CASE WHEN fc.unit_cost IS NOT NULL THEN coalesce(fc.gain, 0) * fc.unit_cost ELSE 0 END AS rv_p,$n$],
    [$a$      LEFT JOIN sold ON sold.inventory_item_id = i.id$a$,
     $n$      LEFT JOIN sold ON sold.inventory_item_id = i.id
      LEFT JOIN fc ON fc.inventory_item_id = i.id$n$],
    -- 3) SL dùng của nguyên liệu bù phần dư của lần kiểm đầu.
    [$a$                WHEN b.counted THEN b.open + b.rq - b.wq - b.close END AS qty_used,$a$,
     $n$                WHEN b.counted THEN b.open + b.rq + b.gain - b.wq - b.close END AS qty_used,$n$],
    -- 4) Bình quân giá kỳ dùng rq_p / rv_p thay rq / rv.
    [$a$           CASE WHEN c.qo + c.rq > 0 AND c.prior IS NOT NULL THEN c.qo * c.pr_num + c.rv * c.pr_den$a$,
     $n$           CASE WHEN c.qo + c.rq_p > 0 AND c.prior IS NOT NULL THEN c.qo * c.pr_num + c.rv_p * c.pr_den$n$],
    [$a$                WHEN c.qo + c.rq > 0 THEN c.rv$a$,
     $n$                WHEN c.qo + c.rq_p > 0 THEN c.rv_p$n$],
    [$a$           CASE WHEN c.qo + c.rq > 0 AND c.prior IS NOT NULL THEN c.pr_den * (c.qo + c.rq)$a$,
     $n$           CASE WHEN c.qo + c.rq_p > 0 AND c.prior IS NOT NULL THEN c.pr_den * (c.qo + c.rq_p)$n$],
    [$a$                WHEN c.qo + c.rq > 0 THEN c.qo + c.rq$a$,
     $n$                WHEN c.qo + c.rq_p > 0 THEN c.qo + c.rq_p$n$],
    [$a$           (c.qo + c.rq <= 0 AND c.last_cost IS NULL) AS no_price$a$,
     $n$           (c.qo + c.rq_p <= 0 AND c.last_cost IS NULL) AS no_price$n$]
  ];
  v_anchor text;
  v_count  integer;
  i        integer;
BEGIN
  IF position('mig 127:' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 127: inventory_cogs đã được vá rồi';
  END IF;
  FOR i IN 1 .. array_length(v_pairs, 1) LOOP
    v_anchor := v_pairs[i][1];
    v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'mig 127: neo % khớp % lần (cần đúng 1) — thân hàm prod đã khác, không vá: %', i, v_count, v_anchor;
    END IF;
    v_def := replace(v_def, v_anchor, v_pairs[i][2]);
  END LOOP;
  EXECUTE v_def;
END
$mig$;
