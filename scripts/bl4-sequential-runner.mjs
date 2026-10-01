import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tests = [
  'scripts/bl4-test-env.test.mjs',
  '065_reservation_customer_access.test.mjs',
  '066_reservation_preorders.test.mjs',
  '067_reservation_preorder_lifecycle.test.mjs',
  '069_reservation_preorder_release.test.mjs',
  '071_reservation_preorder_lock_on_submit.test.mjs',
  '072_reservation_preorder_assigned_tables.test.mjs',
  '073_reservation_table_ordering.test.mjs',
  '074_reservation_customer_call_tasks.test.mjs',
  '075_reservation_prearrival_table_lock.test.mjs',
  '076_reservation_hold_blocks_existing_qr_session.test.mjs',
  '077_pos_reject_pending_order.test.mjs',
  '078a_bl4_prearrival_hold.test.mjs',
  '079_reservation_delivery_recovery.test.mjs',
  '080_reservation_zca_dispatch.test.mjs',
  '083_reservation_zca_dispatch_config.test.mjs',
].map(name => name.startsWith('scripts/') ? resolve(root, name) : resolve(root, 'supabase', 'tests', name))

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PGLITE_MODULE: resolve(root, 'admin-web', 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js'),
  },
})
process.exit(result.status ?? 1)
