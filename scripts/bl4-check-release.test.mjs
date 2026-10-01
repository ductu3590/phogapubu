import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const script = path.join(root, 'scripts', 'bl4-check-release.mjs')
function command(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bl4-release-'))
  mkdirSync(path.join(dir, 'mini-app'))
  writeFileSync(path.join(dir, 'mini-app', 'app-config.json'), JSON.stringify({ app: { title: 'BL4 test' }, webviewUrls: ['https://example.test'] }))
  writeFileSync(path.join(dir, 'mini-app', '.env'), 'APP_ID=app-test\nVITE_ZALO_APP_ID=app-test\nZMP_TOKEN=secret\n')
  command(dir, 'init'); command(dir, 'config', 'user.email', 'test@example.test'); command(dir, 'config', 'user.name', 'Test')
  command(dir, 'add', '.'); command(dir, 'commit', '-m', 'fixture')
  return { dir, commit: command(dir, 'rev-parse', 'HEAD') }
}
function run(dir, commit) { return spawnSync(process.execPath, [script, '--instance', dir, '--expected-commit', commit, '--expected-app-id', 'app-test'], { encoding: 'utf8' }) }

test('release checker accepts a clean instance with matching commit and App ID', () => {
  const f = fixture(); try { const result = run(f.dir, f.commit); assert.equal(result.status, 0); assert.match(result.stdout, /"ok":true/); assert.doesNotMatch(result.stdout, /secret/); } finally { rmSync(f.dir, { recursive: true, force: true }) }
})
test('release checker refuses dirty instance and mismatched App ID', () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.dir, 'dirty.txt'), 'x'); assert.notEqual(run(f.dir, f.commit).status, 0)
    rmSync(path.join(f.dir, 'dirty.txt')); writeFileSync(path.join(f.dir, 'mini-app', '.env'), 'APP_ID=wrong\nVITE_ZALO_APP_ID=wrong\n')
    command(f.dir, 'add', 'mini-app/.env'); command(f.dir, 'commit', '-m', 'wrong app')
    const result = run(f.dir, f.commit); assert.notEqual(result.status, 0); assert.match(result.stderr, /App ID/)
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})
