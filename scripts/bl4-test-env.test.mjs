import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { loadBl4TestEnvironment } from './bl4-test-env.mjs'

test('nạp cấu hình BL-4 cục bộ nhưng không ghi đè biến terminal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mevo-bl4-env-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = join(directory, '.env.bl4-test.local')
  await writeFile(filePath, [
    '# Không được commit file này',
    'BL4_TEST_DATABASE_URL="postgresql://postgres:secret@db.test.example:5432/postgres"',
    'BL4_TEST_ALLOWED_HOST=db.test.example',
    'BL4_TEST_OWNER_ID=test-owner-id',
  ].join('\n'))
  const env = { BL4_TEST_OWNER_ID: 'terminal-owner' }

  const loaded = loadBl4TestEnvironment({ filePath, env })

  assert.equal(loaded, true)
  assert.equal(env.BL4_TEST_DATABASE_URL, 'postgresql://postgres:secret@db.test.example:5432/postgres')
  assert.equal(env.BL4_TEST_ALLOWED_HOST, 'db.test.example')
  assert.equal(env.BL4_TEST_OWNER_ID, 'terminal-owner')
})
