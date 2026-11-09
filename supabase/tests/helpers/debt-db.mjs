import { readFile } from 'node:fs/promises'
import { openCashShiftDb } from './cash-shift-db.mjs'

// Fixture cho mig 123 (công nợ khách hàng). Dựng trên openCashShiftDb: helper đó đã làm đúng các bước plan
// công nợ Task 1 Step 2 cần — openCollectDb({ lock: true }) (112a + 112b), stub mig 116 đúng hợp đồng
// (is_store_back_office, is_store_pos_operator có store_manager, ids.manager), store_workflow_settings + ba hàm
// ngày kinh doanh nguyên văn mig 111, rồi mig 122. Ở đây chỉ nạp thêm 123 và các hàm tiện cho test công nợ.
// withDebt = false: dừng ở 122 (dùng để chụp prod-defs/123).
// through = '122b': nạp thêm 118 (kho) + 122b như thứ tự prod, rồi 123 (báo cáo tài chính mig 125 cần cả kho).
const url = (path) => new URL(path, import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

// Trigger mig 040 (nguyên văn): phiên đóng thì session_tables.is_open = false — "bàn trống ngay" kiểm được.
// Helper thu tiền không có trigger này.
const SESSION_TABLES_SYNC_040 = `
  create or replace function sync_session_tables_open() returns trigger
  language plpgsql as $$
  begin
    update session_tables
       set is_open = (new.status = 'open')
     where session_id = new.id
       and is_open <> (new.status = 'open');
    return null;
  end $$;
  create trigger trg_session_tables_sync_open
    after update of status on table_sessions
    for each row
    when (old.status is distinct from new.status)
    execute function sync_session_tables_open();
`

export async function openDebtDb({ withDebt = true, through = '122' } = {}) {
  const base = await openCashShiftDb({ lock: true, through })
  try {
    return await extend(base, withDebt)
  } catch (err) {
    await base.db.close()
    throw err
  }
}

async function extend(base, withDebt) {
  const { db, ids, login, one } = base
  await db.exec(SESSION_TABLES_SYNC_040)
  if (withDebt) await db.exec(await load(url('../../migrations/123_customer_debt.sql')))

  // Xoá dữ liệu công nợ trước (tham chiếu bill_payments / cash_shifts), rồi phần của helper ca, rồi khách nợ
  // (bill_payments tham chiếu khách nên xoá khách sau cùng).
  async function reset() {
    await db.exec('RESET ROLE')
    if (withDebt) await db.exec('DELETE FROM debt_payment_allocations; DELETE FROM debt_payments;')
    await base.reset()
    if (withDebt) await db.exec('DELETE FROM debt_customers;')
  }

  const debt = (amount) => ({ instrument: 'debt', amount })

  // Chèn thẳng một khách nợ (role postgres), trả id.
  async function customer({ name = 'Cty Hoà Bình', phone = null, kind = 'company', active = true, store = ids.store } = {}) {
    await db.exec('RESET ROLE')
    const r = await one(`INSERT INTO debt_customers(store_id, name, phone, kind, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [store, name, phone, kind, active, ids.owner])
    return r.id
  }

  async function collectDebtBill(sessionIds, lines, cashGiven, requestId, { customerId = null, newCustomer = null } = {}, uid = ids.cashier) {
    await login(uid)
    try {
      return (await db.query(
        'SELECT collect_table_bill($1::uuid[], $2::jsonb, $3::int, $4::uuid, $5::uuid, $6::jsonb) AS r',
        [sessionIds, JSON.stringify(lines), cashGiven, requestId, customerId,
          newCustomer === null ? null : JSON.stringify(newCustomer)])).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
    }
  }

  // Gọi RPC dưới role authenticated, auth.uid() = uid. args là mảng (tham số vị trí) hoặc object (tham số tên).
  // Giá trị object / mảng object → chuỗi JSON (jsonb); chuỗi JSON truyền sẵn thì giữ nguyên.
  async function rpc(uid, name, args = []) {
    const positional = Array.isArray(args)
    const keys = positional ? args.map((_, i) => i) : Object.keys(args)
    const params = keys.map((k) => {
      const v = args[k]
      const isJson = (v !== null && typeof v === 'object' && !Array.isArray(v))
        || (Array.isArray(v) && v.some((x) => x !== null && typeof x === 'object'))
      return isJson ? JSON.stringify(v) : v
    })
    const call = keys.map((k, i) => (positional ? `$${i + 1}` : `${k} => $${i + 1}`)).join(', ')
    await login(uid)
    try {
      return (await db.query(`SELECT public.${name}(${call}) AS r`, params)).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
    }
  }

  async function enableShift(storeId = ids.store) {
    await base.setShiftRequired(storeId, true)
  }

  async function openShift(opening = 500000, uid = ids.cashier) {
    await db.exec('RESET ROLE')
    return (await one(`INSERT INTO cash_shifts(store_id, status, opened_by, opening_cash)
      VALUES ($1, 'open', $2, $3) RETURNING id`, [ids.store, uid, opening])).id
  }

  // Đóng ca bằng tay (bỏ qua RPC): CHECK cash_shifts_closed_numbers bắt đủ số đếm. Số test đã đặt sẵn (vd.
  // expected_cash) thì giữ nguyên.
  async function closeShiftRow(id) {
    await db.exec('RESET ROLE')
    await db.query(`UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $2,
        counted_cash = COALESCE(counted_cash, 0), expected_cash = COALESCE(expected_cash, 0),
        difference = COALESCE(difference, 0) WHERE id = $1`, [id, ids.cashier])
  }

  async function outstanding(customerId) {
    await db.exec('RESET ROLE')
    return Number((await one('SELECT COALESCE(SUM(outstanding), 0) AS n FROM debt_customer_bills($1)', [customerId])).n)
  }

  return { ...base, reset, debt, customer, collectDebtBill, rpc, enableShift, openShift, closeShiftRow, outstanding }
}
