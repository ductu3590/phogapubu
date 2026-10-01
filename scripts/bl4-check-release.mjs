import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function fail(message) { throw new Error(`RELEASE BLOCKED: ${message}`) }
function arg(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) fail(`thiếu ${name}`)
  return process.argv[index + 1]
}
function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }
function envValue(raw, key) { return raw.match(new RegExp(`^${key}=([^\\r\\n]*)`, 'm'))?.[1]?.trim() ?? null }

try {
  const instance = resolve(arg('--instance'))
  const expectedCommit = arg('--expected-commit')
  const expectedAppId = arg('--expected-app-id')
  const miniApp = resolve(instance, 'mini-app')
  if (!existsSync(miniApp)) fail('instance không có thư mục mini-app')
  if (git(instance, 'status', '--porcelain')) fail('instance còn thay đổi chưa commit')
  for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
    try { git(instance, 'rev-parse', '--verify', '-q', state); fail(`instance còn ${state}`) } catch (error) {
      if (String(error.message).includes(`instance còn ${state}`)) throw error
    }
  }
  execFileSync('git', ['-C', instance, 'merge-base', '--is-ancestor', expectedCommit, 'HEAD'])
  const config = JSON.parse(readFileSync(resolve(miniApp, 'app-config.json'), 'utf8'))
  if (!config?.app?.title || !Array.isArray(config.webviewUrls) || config.webviewUrls.length === 0) fail('app-config.json thiếu title hoặc webviewUrls')
  const envPath = resolve(miniApp, '.env')
  if (!existsSync(envPath)) fail('thiếu .env của instance')
  const env = readFileSync(envPath, 'utf8')
  const appId = envValue(env, 'APP_ID') ?? envValue(env, 'VITE_ZALO_APP_ID')
  const publicAppId = envValue(env, 'VITE_ZALO_APP_ID')
  if (!appId || !publicAppId || appId !== publicAppId || appId !== expectedAppId) fail('App ID không khớp expected instance')
  console.log(JSON.stringify({ ok: true, instance, expectedCommit, appIdConfigured: true, configValid: true }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
