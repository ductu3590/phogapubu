import { readFile } from 'node:fs/promises'
import { openDebtDb } from './debt-db.mjs'

// Fixture cho mig 125 (báo cáo tài chính). Dựng trên openDebtDb({ through: '122b' }):
//   112a + 112b (thu tiền kết hợp) → stub 116 đúng hợp đồng (is_store_back_office, quản lý) → 111 thật
//   → 118 (kho) → 122 (ca + sổ thu chi) → 122b → 123 (công nợ).
// Thêm ở đây: cột / bảng mig 117 đọc mà helper chưa có (danh mục món), rồi 117. CHƯA nạp 125: test chụp
// get_bills_report trước khi vá (beforePatch) rồi mới gọi apply125().
// Dữ liệu mẫu (seedFinance) dựng bằng RPC thật dưới vai chủ quán, rồi dời mốc giờ về ngày cần (role postgres).
const url = (path) => new URL(path, import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')
const fixedId = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// menu_items của helper kho chỉ có (id, store_id, name); 117 đọc thêm category_id và bảng menu_categories.
const SALES_EXTRAS = `
  ALTER TABLE menu_items ADD COLUMN category_id uuid, ADD COLUMN price integer;
  CREATE TABLE menu_categories(id uuid PRIMARY KEY, store_id uuid, name text, sort_order int DEFAULT 0);
`

/** Giờ VN → timestamptz. */
export const at = (date, hms) => `${date} ${hms}+07`

export async function openFinanceDb() {
  const base = await openDebtDb({ through: '122b' })
  const { db, ids, rid, one, login } = base
  try {
    await db.exec('RESET ROLE')
    await db.exec(SALES_EXTRAS)
    await db.exec(await load(url('../../migrations/117_sales_reports.sql')))
    // Superadmin MEVO: is_store_back_office KHÔNG tính vai này (hợp đồng mig 116).
    await db.query(`INSERT INTO auth.users(id, email) VALUES ($1, 'mevo@mevo.vn')`, [fixedId(6)])
    await db.query(`INSERT INTO mevo_operators(user_id, store_id, role, is_active) VALUES ($1, NULL, 'mevo_superadmin', true)`, [fixedId(6)])
  } catch (err) {
    await db.close()
    throw err
  }

  Object.assign(ids, {
    admin: fixedId(6),
    catLau: fixedId(31), catDo: fixedId(32),
    mLauThai: fixedId(41), mLauRieu: fixedId(42), mBiaHN: fixedId(43), mBiaHoi: fixedId(44),
  })

  // Gọi RPC (tham số vị trí) dưới role authenticated. rpc(...) = chủ quán; rpcAs(uid, ...) cho vai khác.
  async function rpcAs(uid, name, ...args) {
    const call = args.map((_, i) => `$${i + 1}`).join(', ')
    await login(uid)
    try {
      return (await db.query(`SELECT public.${name}(${call}) AS r`, args)).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
    }
  }
  const rpc = (name, ...args) => rpcAs(ids.owner, name, ...args)

  // A04 một ngày dưới quyền chủ quán (cùng hàm của helper thu tiền, nhận quán).
  async function report(date, storeId = ids.store, uid = ids.owner) {
    return rpcAs(uid, 'get_bills_report', storeId, date)
  }

  async function apply125() {
    await db.exec('RESET ROLE')
    await db.exec(await load(url('../../migrations/125_financial_reports.sql')))
  }

  // Thay inventory_cogs (118) bằng hàm trả đúng JSON cho trước, để số giá vốn cố định trong test lãi lỗ.
  // Giữ chữ ký, SECURITY DEFINER và quyền như bản 118. restoreCogs() nạp lại đúng định nghĩa đang có trước stub.
  let cogsDef = null
  async function stubCogs(json) {
    await db.exec('RESET ROLE')
    if (cogsDef === null) {
      cogsDef = (await one("SELECT pg_get_functiondef('public.inventory_cogs(uuid,date,date)'::regprocedure) AS d")).d
    }
    const body = JSON.stringify(json).replace(/'/g, "''")
    await db.exec(`CREATE OR REPLACE FUNCTION public.inventory_cogs(p_store_id uuid, p_from date, p_to date)
      RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $stub$ SELECT '${body}'::jsonb $stub$`)
  }
  async function restoreCogs() {
    if (cogsDef === null) return
    await db.exec('RESET ROLE')
    await db.exec(cogsDef)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Dữ liệu mẫu
  // ---------------------------------------------------------------------------------------------------------------
  const PRICE = { lauThai: 300000, lauRieu: 250000, biaHN: 20000, biaHoi: 150000 }

  async function seedMenu() {
    await db.query(`INSERT INTO menu_categories(id, store_id, name, sort_order) VALUES
      ($1, $3, 'Lẩu', 1), ($2, $3, 'Đồ uống', 2)`, [ids.catLau, ids.catDo, ids.store])
    await db.query(`INSERT INTO menu_items(id, store_id, name, category_id, price) VALUES
      ($1, $5, 'Lẩu thái', $6, 300000), ($2, $5, 'Lẩu riêu', $6, 250000),
      ($3, $5, 'Bia Hà Nội lon', $7, 20000), ($4, $5, 'Bia hơi', $7, 150000)`,
    [ids.mLauThai, ids.mLauRieu, ids.mBiaHN, ids.mBiaHoi, ids.store, ids.catLau, ids.catDo])
  }

  // Một bàn: phiên mở + một đơn có dòng món (tổng = Σ giá × SL, trước giảm), thu bằng collect_table_bill thật
  // dưới vai chủ quán, rồi dời giờ thu về paidAt. Trả { session, order, payment_id }.
  // `orders`: nhiều lượt gọi trong cùng bàn (mỗi phần tử là danh sách dòng món); mặc định một lượt = `items`.
  async function tableBill({ items, orders = [items], discount, lines, cashGiven = null, customerId = null, paidAt }) {
    await db.exec('RESET ROLE')
    const session = await base.session({ discount })
    const orderIds = []
    for (const lineItems of orders) {
      const total = lineItems.reduce((s, [, , price, qty]) => s + price * qty, 0)
      const order = await base.order(session, total)
      orderIds.push(order)
      for (const [menuId, name, price, qty] of lineItems) {
        await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, item_name, item_price, quantity, selected_toppings)
          VALUES ($1, $2, $3, $4, $5, $6, '[]')`, [rid(), order, menuId, name, price, qty])
      }
    }
    const r = await base.collectDebtBill([session], lines, cashGiven, rid(), { customerId }, ids.owner)
    if (!r?.ok) throw new Error(`thu bill lỗi: ${JSON.stringify(r)}`)
    await db.exec('RESET ROLE')
    // Mỗi lượt gọi một mốc giờ riêng (lượt sau muộn hơn 10 phút): A04 sắp order_ids theo created_at.
    for (const [i, id] of orderIds.entries()) {
      await db.query(`UPDATE orders SET payment_received_at = $2, completed_at = $2, updated_at = $2,
          confirmed_at = $2::timestamptz - interval '60 minutes' + $3 * interval '10 minutes',
          created_at = $2::timestamptz - interval '90 minutes' + $3 * interval '10 minutes'
        WHERE id = $1`, [id, paidAt, i])
    }
    await db.query('UPDATE bill_payments SET collected_at = $2 WHERE id = $1', [r.payment_id, paidAt])
    await db.query(`UPDATE table_sessions SET closed_at = $2, opened_at = $2::timestamptz - interval '2 hours'
      WHERE id = $1`, [session, paidAt])
    return { session, orders: orderIds, payment_id: r.payment_id }
  }

  // Bill thu trước mig 112a: phiên 'paid', đơn có payment_received_at, KHÔNG có bill_payment_id.
  async function legacyBill({ items, instrument, paidAt }) {
    await db.exec('RESET ROLE')
    const total = items.reduce((s, [, , price, qty]) => s + price * qty, 0)
    const s = rid()
    const o = rid()
    await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, opened_at, closed_at, closed_by, close_reason)
      VALUES ($1, $2, $3, 'closed', $4::timestamptz - interval '2 hours', $4, $5, 'paid')`, [s, ids.store, ids.t2, paidAt, ids.cashier])
    await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, false)', [s, ids.t2])
    await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, payment_amount,
        payment_method, payment_instrument, payment_received_at, payment_received_via, payment_received_by,
        completed_at, created_at, updated_at, confirmed_at)
      VALUES ($1, $2, $3, $4, 'paid', $5, $5, 'cash', $6, $7, 'owner', $8, $7,
        $7::timestamptz - interval '90 minutes', $7, $7::timestamptz - interval '1 hour')`,
    [o, ids.store, ids.t2, s, total, instrument, paidAt, ids.cashier])
    for (const [menuId, name, price, qty] of items) {
      await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, item_name, item_price, quantity, selected_toppings)
        VALUES ($1, $2, $3, $4, $5, $6, '[]')`, [rid(), o, menuId, name, price, qty])
    }
    return { session: s, order: o }
  }

  // Đơn không phiên (khoá bill O:): ví Zalo (callback ghi đã nhận tiền → nhóm 'khác'), hoặc tiền mặt kiểu cũ
  // status 'paid' mà KHÔNG có payment_received_at (A04 rơi về completed_at).
  async function looseOrder({ items, kind, at: when }) {
    await db.exec('RESET ROLE')
    const total = items.reduce((s, [, , price, qty]) => s + price * qty, 0)
    const o = rid()
    if (kind === 'wallet') {
      await db.query(`INSERT INTO orders(id, store_id, status, total_amount, payment_amount, payment_method, payment_instrument,
          payment_received_at, payment_received_via, order_type, created_at, updated_at, confirmed_at)
        VALUES ($1, $2, 'confirmed', $3, $3, 'zalo_checkout', 'wallet', $4, 'zalo_callback', 'pickup',
          $4::timestamptz - interval '15 minutes', $4, $4::timestamptz - interval '10 minutes')`, [o, ids.store, total, when])
    } else {
      await db.query(`INSERT INTO orders(id, store_id, status, total_amount, payment_amount, payment_method, order_type,
          completed_at, created_at, updated_at)
        VALUES ($1, $2, 'paid', $3, $3, 'cash', 'pickup', $4, $4::timestamptz - interval '20 minutes', $4)`,
      [o, ids.store, total, when])
    }
    for (const [menuId, name, price, qty] of items) {
      await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, item_name, item_price, quantity, selected_toppings)
        VALUES ($1, $2, $3, $4, $5, $6, '[]')`, [rid(), o, menuId, name, price, qty])
    }
    return o
  }

  async function debtPayment(customerId, amount, method, businessDate) {
    const r = await rpc('debt_collect', customerId, amount, method, null, null, rid())
    await db.exec('RESET ROLE')
    await db.query('UPDATE debt_payments SET business_date = $2 WHERE id = $1', [r.debt_payment_id, businessDate])
    return r.debt_payment_id
  }

  async function categoryId(kind, name) {
    await db.exec('RESET ROLE')
    return (await one('SELECT id FROM cash_book_categories WHERE store_id = $1 AND kind = $2 AND name = $3',
      [ids.store, kind, name])).id
  }

  async function cashEntry(kind, method, name, amount, businessDate) {
    const cat = await categoryId(kind, name)
    const r = await rpc('cash_book_create', kind, method, cat, amount, `Mẫu ${name}`, null, rid())
    const id = r.id ?? r.entry?.id
    if (!id) throw new Error(`ghi phiếu lỗi: ${JSON.stringify(r)}`)
    await db.exec('RESET ROLE')
    await db.query('UPDATE cash_book_entries SET business_date = $2 WHERE id = $1', [id, businessDate])
    return id
  }

  const L = (menu, name, price, qty) => [menu, name, price, qty]
  const cash = (amount) => ({ instrument: 'cash', amount })
  const bank = (amount) => ({ instrument: 'bank', amount })
  const debt = (amount) => ({ instrument: 'debt', amount })

  // Bảng dữ liệu của plan Task 7 (quán bắt đầu ngày 05:00). Trả các id để test sau tra lại.
  async function seedFinance() {
    await db.exec('RESET ROLE')
    await base.setShiftRequired(ids.store, false)
    await base.setDayStart(ids.store, '05:00')
    await seedMenu()
    const dien = await base.customer({ name: 'Cty Điện lực', kind: 'company' })
    const hung = await base.customer({ name: 'Anh Hùng', kind: 'person', phone: '0912345678' })
    const binh = await base.customer({ name: 'Chú Bình', kind: 'person' })
    const lan = await base.customer({ name: 'Cô Lan', kind: 'person' })
    const D1 = '2026-12-01'
    const D2 = '2026-12-02'

    const bills = {}
    // X gọi hai lượt (15 + 10 lon): một bill hai đơn, để số bill khác số đơn.
    bills.X = await tableBill({
      orders: [[L(ids.mBiaHN, 'Bia Hà Nội lon', PRICE.biaHN, 15)], [L(ids.mBiaHN, 'Bia Hà Nội lon', PRICE.biaHN, 10)]],
      lines: [cash(500000)],
      cashGiven: 500000, paidAt: at(D1, '19:00:00') })
    bills.Y = await tableBill({
      items: [L(ids.mLauThai, 'Lẩu thái', PRICE.lauThai, 3), L(ids.mBiaHoi, 'Bia hơi (Tháp)', PRICE.biaHoi, 1)],
      discount: ['amount', 50000], lines: [cash(300000), bank(700000)], cashGiven: 300000, paidAt: at(D1, '20:00:00') })
    bills.Z = await tableBill({
      items: [L(ids.mLauThai, 'Lẩu thái', PRICE.lauThai, 2), L(ids.mBiaHN, 'Bia Hà Nội lon', PRICE.biaHN, 10)],
      lines: [debt(800000)], customerId: dien, paidAt: at(D1, '21:00:00') })
    bills.W = await tableBill({ items: [L(ids.mLauThai, 'Lẩu thái', PRICE.lauThai, 2)],
      lines: [cash(200000), debt(400000)], cashGiven: 200000, customerId: hung, paidAt: at(D1, '22:00:00') })
    bills.L = await legacyBill({ items: [L(ids.mBiaHoi, 'Bia hơi (Tháp)', PRICE.biaHoi, 1)], instrument: 'bank',
      paidAt: at(D1, '23:00:00') })
    // Ví Zalo 120.000 ngày 12-01 (nhóm 'khác', khoá O:); tiền mặt kiểu cũ 80.000 ngày 11-20 (rơi về completed_at).
    bills.wallet = await looseOrder({ items: [L(ids.mBiaHN, 'Bia Hà Nội lon', PRICE.biaHN, 6)], kind: 'wallet',
      at: at(D1, '18:00:00') })
    bills.legacyCash = await looseOrder({ items: [L(ids.mBiaHN, 'Bia Hà Nội lon', PRICE.biaHN, 4)], kind: 'legacy_cash',
      at: at('2026-11-20', '13:00:00') })
    bills.V = await tableBill({ items: [L(ids.mBiaHN, 'Bia Hà Nội lon', PRICE.biaHN, 15)], lines: [bank(300000)],
      paidAt: at(D2, '19:30:00') })
    // Nợ cũ: Chú Bình (13 ngày trước 12-03), Cô Lan (44 ngày).
    bills.binh = await tableBill({ items: [L(ids.mLauThai, 'Lẩu thái', 100000, 1)], lines: [debt(100000)],
      customerId: binh, paidAt: at('2026-11-20', '20:00:00') })
    bills.lan = await tableBill({ items: [L(ids.mLauRieu, 'Lẩu riêu', PRICE.lauRieu, 1)], lines: [debt(250000)],
      customerId: lan, paidAt: at('2026-10-20', '20:00:00') })

    // Trả nợ ngày 12-02: Điện lực CK 500.000; Anh Hùng TM 100.000 rồi huỷ, sau đó TM 400.000.
    const debtPayments = {}
    debtPayments.dien = await debtPayment(dien, 500000, 'bank', D2)
    debtPayments.hungVoided = await debtPayment(hung, 100000, 'cash', D2)
    await rpc('debt_payment_void', debtPayments.hungVoided, 'Ghi nhầm')
    debtPayments.hung = await debtPayment(hung, 400000, 'cash', D2)

    // Sổ thu chi 12-01..12-02.
    const entries = {}
    entries.topUp = await cashEntry('receipt', 'cash', 'Nộp thêm vào két', 1000000, D1)
    entries.otherIncome = await cashEntry('receipt', 'bank', 'Thu khác', 50000, D2)
    entries.market = await cashEntry('payment', 'cash', 'Đi chợ', 300000, D1)
    entries.salary = await cashEntry('payment', 'bank', 'Lương - thưởng', 500000, D2)
    entries.draw = await cashEntry('payment', 'cash', 'Chủ quán rút', 2000000, D2)
    entries.ice = await cashEntry('payment', 'cash', 'Đá', 70000, D1)
    await rpc('cash_book_void', entries.ice, 'Ghi nhầm')
    // Nhập hàng: danh mục hệ thống, không ghi tay được → hàm nội bộ dưới superuser (như 122b tạo từ phiếu nhập).
    await db.exec('RESET ROLE')
    const purchaseCat = await categoryId('payment', 'Nhập hàng')
    entries.purchase = (await one(`SELECT public.cash_book_create_internal($1, 'payment', 'cash', $2, 600000,
        'Phiếu nhập mẫu', NULL, 'inventory_receipt', $3, $4, $5) AS id`,
    [ids.store, purchaseCat, rid(), ids.owner, rid()])).id
    await db.query('UPDATE cash_book_entries SET business_date = $2 WHERE id = $1', [entries.purchase, D1])

    return { customers: { dien, hung, binh, lan }, bills, debtPayments, entries }
  }

  return {
    ...base, db, ids, rpc, rpcAs, report, apply125, stubCogs, restoreCogs, seedFinance,
  }
}
