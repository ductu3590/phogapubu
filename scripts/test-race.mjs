#!/usr/bin/env node
// Chạy bộ test tranh chấp (race) của các RPC tiền trên một Postgres THẬT trong Docker.
//
//   node scripts/test-race.mjs                 dựng container tạm → nạp toàn bộ migration → chạy test → xoá container
//   node scripts/test-race.mjs --keep          như trên nhưng GIỮ container (in tên + chuỗi kết nối) để soi tay
//   node scripts/test-race.mjs --reuse <tên>   chạy test trên container đã giữ từ lần trước (tên phải bắt đầu mevo-race-)
//   node scripts/test-race.mjs -- <tham số của node --test>   vd. -- --test-name-pattern="Ca"
//
// Biến môi trường: RACE_ITERATIONS (số vòng lặp mỗi kịch bản, mặc định 25), RACE_PG_IMAGE (ảnh Postgres).
//
// ⛔ Script này KHÔNG BAO GIỜ nối tới DB nào khác ngoài container nó tự dựng (cổng ngẫu nhiên trên 127.0.0.1).
//    Không có tuỳ chọn nhận chuỗi kết nối từ ngoài — cố ý, để không ai trỏ nhầm vào prod.
import { spawnSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const RACE_DIR = join(ROOT, 'supabase', 'tests', 'race')
const NAME_PREFIX = 'mevo-race-'
// Ảnh Supabase Postgres: có sẵn role anon / authenticated / service_role, schema auth, auth.uid(),
// publication supabase_realtime, pg_net, vault. Ưu tiên ảnh đã có trên máy để khỏi kéo về.
const IMAGE_CANDIDATES = [
  'public.ecr.aws/supabase/postgres:17.11.0.004',
  'public.ecr.aws/supabase/postgres:17.11.0.011',
  'public.ecr.aws/supabase/postgres:17.11.0.006',
  'supabase/postgres:17.6.1.178',
]

const argv = process.argv.slice(2)
const passthroughAt = argv.indexOf('--')
const ownArgs = passthroughAt === -1 ? argv : argv.slice(0, passthroughAt)
const nodeTestArgs = passthroughAt === -1 ? [] : argv.slice(passthroughAt + 1)
const keep = ownArgs.includes('--keep')
const reuseAt = ownArgs.indexOf('--reuse')
const reuseName = reuseAt === -1 ? null : ownArgs[reuseAt + 1]

const log = (msg) => console.log(`[race] ${msg}`)

function docker(args, { input, allowFail = false } = {}) {
  const res = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (res.error) throw new Error(`Không chạy được docker: ${res.error.message}`)
  if (res.status !== 0 && !allowFail) {
    throw new Error(`docker ${args.slice(0, 3).join(' ')}… lỗi (${res.status}):\n${res.stdout}\n${res.stderr}`)
  }
  return res
}

function pickImage() {
  if (process.env.RACE_PG_IMAGE) return process.env.RACE_PG_IMAGE
  for (const image of IMAGE_CANDIDATES) {
    if (docker(['image', 'inspect', image], { allowFail: true }).status === 0) return image
  }
  return IMAGE_CANDIDATES[0] // chưa có ảnh nào: docker run sẽ tự kéo
}

function hostPort(name) {
  const out = docker(['port', name, '5432/tcp']).stdout.trim().split('\n')[0]
  const port = Number(out.slice(out.lastIndexOf(':') + 1))
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Không đọc được cổng của container: ${out}`)
  return port
}

function containerPassword(name) {
  const env = docker(['inspect', '-f', '{{range .Config.Env}}{{println .}}{{end}}', name]).stdout
  const line = env.split('\n').find((l) => l.startsWith('POSTGRES_PASSWORD='))
  if (!line) throw new Error('Container không có POSTGRES_PASSWORD')
  return line.slice('POSTGRES_PASSWORD='.length).trim()
}

function psql(name, password, sql, { allowFail = false } = {}) {
  return docker(['exec', '-e', `PGPASSWORD=${password}`, name,
    'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { allowFail })
}

async function waitReady(name, password) {
  // Lúc init, server tạm chỉ nghe unix socket; nối TCP được nghĩa là server thật đã lên.
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const res = psql(name, password,
      "select 1 from pg_namespace where nspname = 'auth' and exists (select 1 from pg_roles where rolname = 'authenticated')",
      { allowFail: true })
    if (res.status === 0 && res.stdout.trim() === '1') return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('Postgres trong container không sẵn sàng sau 180 giây')
}

// ---------------------------------------------------------------------------------------------------
// Migration "đúng từng byte" = byte ĐÃ COMMIT, không phải byte trong thư mục làm việc.
// Trên Windows (core.autocrlf=true) git đổi LF → CRLF lúc checkout cho mọi file text, nên file trong
// thư mục làm việc KHÔNG còn là byte đã commit: mig 115/108/… neo vào chuỗi nhiều dòng sẽ không khớp
// thân hàm do 103b (file -text, giữ nguyên byte) tạo ra. Vì vậy: file nào .gitattributes đánh dấu
// `-text` thì giữ nguyên byte; file còn lại đổi CRLF → LF (đúng phép biến đổi git làm khi commit).
// Sau đó đối chiếu SHA-1 với blob trong index để chắc chắn đang nạp đúng byte đã commit.
// ---------------------------------------------------------------------------------------------------
function loadMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) // so theo mã ký tự = thứ tự LC_ALL=C với tên ASCII
  const rel = (f) => `supabase/migrations/${f}`

  const binary = new Set()
  const indexSha = new Map()
  const attr = spawnSync('git', ['check-attr', 'text', '--stdin'],
    { cwd: ROOT, input: files.map(rel).join('\n'), encoding: 'utf8' })
  const gitOk = attr.status === 0 && !attr.error
  if (gitOk) {
    for (const line of attr.stdout.split('\n')) {
      const m = /^(.*): text: (\S+)$/.exec(line.trim())
      if (m && m[2] === 'unset') binary.add(m[1])
    }
    const ls = spawnSync('git', ['ls-files', '-s', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' })
    for (const line of ls.stdout.split('\n')) {
      const m = /^\d+ ([0-9a-f]{40}) \d+\t(.*)$/.exec(line)
      if (m) indexSha.set(m[2], m[1])
    }
  } else {
    log('⚠ không gọi được git: nạp migration đúng byte trong thư mục làm việc (chỉ đúng khi checkout không đổi CRLF)')
  }

  const out = []
  const differs = []
  for (const f of files) {
    let bytes = readFileSync(join(MIGRATIONS_DIR, f))
    if (gitOk && !binary.has(rel(f)) && bytes.includes(0x0d)) {
      bytes = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
    }
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    const expected = indexSha.get(rel(f))
    if (gitOk && expected !== sha) differs.push(`${f}${expected ? '' : ' (chưa có trong index)'}`)
    out.push({ name: f, bytes })
  }
  if (differs.length) log(`⚠ ${differs.length} migration khác bản trong git index (đang sửa dở / file mới): ${differs.join(', ')}`)
  return out
}

function buildSchema(name, password) {
  const migrations = loadMigrations()
  const dir = mkdtempSync(join(tmpdir(), 'mevo-race-mig-'))
  try {
    for (const m of migrations) writeFileSync(join(dir, m.name), m.bytes)
    docker(['exec', name, 'rm', '-rf', '/tmp/mevo-migrations'])
    docker(['cp', `${dir}/.`, `${name}:/tmp/mevo-migrations`])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  // Chạy như prod: role postgres (không superuser, có BYPASSRLS), từng file một, dừng ở lỗi đầu tiên.
  const loop = [
    'cd /tmp/mevo-migrations || exit 3',
    'n=0',
    'for f in $(ls | LC_ALL=C sort); do',
    '  out=$(psql -U postgres -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 >/dev/null)',
    '  if [ $? -ne 0 ]; then echo "MIGRATION_FAILED $f"; echo "$out" | tail -n 25; exit 1; fi',
    '  n=$((n+1))',
    'done',
    'echo "MIGRATIONS_OK $n"',
  ].join('\n')
  const started = Date.now()
  const res = docker(['exec', '-e', `PGPASSWORD=${password}`, '-e', 'LC_ALL=C', name, 'bash', '-c', loop], { allowFail: true })
  if (res.status !== 0) throw new Error(`Nạp migration thất bại:\n${res.stdout}\n${res.stderr}`)
  log(`${res.stdout.trim()} (${migrations.length} file, ${((Date.now() - started) / 1000).toFixed(1)} giây)`)
}

function resolvePgModule() {
  const require = createRequire(join(ROOT, 'admin-web', 'package.json'))
  try {
    return require.resolve('pg')
  } catch {
    throw new Error('Chưa cài `pg`: chạy `npm install` trong admin-web/ (pg là devDependency).')
  }
}

function runTests(env) {
  const files = readdirSync(RACE_DIR).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(RACE_DIR, f))
  // Không có file nào thì `node --test` sẽ tự quét cả repo — chặn lại.
  if (files.length === 0) throw new Error(`Không thấy file *.test.mjs trong ${RACE_DIR}`)
  return new Promise((done) => {
    // Từng file một: mỗi file tự dựng quán riêng nhưng dùng chung một Postgres, chạy tuần tự cho dễ đọc kết quả.
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...nodeTestArgs, ...files],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } })
    child.on('exit', (code) => done(code ?? 1))
  })
}

async function main() {
  let pgModule
  try {
    pgModule = resolvePgModule()
    if (docker(['version', '--format', '{{.Server.Version}}'], { allowFail: true }).status !== 0) {
      throw new Error('Docker chưa chạy — bật Docker Desktop rồi chạy lại.')
    }
  } catch (err) {
    console.error(`[race] LỖI: ${err.message}`)
    process.exit(1)
  }

  let name = reuseName
  let created = false
  let password
  const cleanup = () => {
    if (created && !keep) {
      docker(['rm', '-f', '-v', name], { allowFail: true })
      log(`đã xoá container ${name}`)
      created = false
    }
  }
  process.on('SIGINT', () => { cleanup(); process.exit(130) })
  process.on('SIGTERM', () => { cleanup(); process.exit(143) })

  let exitCode = 1
  const started = Date.now()
  try {
    if (name) {
      if (!name.startsWith(NAME_PREFIX)) throw new Error(`--reuse chỉ nhận container tên bắt đầu bằng ${NAME_PREFIX}`)
      password = containerPassword(name)
      log(`dùng lại container ${name} (không nạp lại migration)`)
    } else {
      name = `${NAME_PREFIX}${process.pid}-${randomBytes(3).toString('hex')}`
      password = randomBytes(12).toString('hex')
      const image = pickImage()
      log(`dựng container ${name} từ ${image}`)
      // -p 127.0.0.1::5432 → Docker tự chọn một cổng trống, chỉ nghe trên máy này.
      docker(['run', '-d', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1::5432', image])
      created = true
      await waitReady(name, password)
      buildSchema(name, password)
    }
    const port = hostPort(name)
    if (keep || reuseName) log(`kết nối: postgres://postgres:${password}@127.0.0.1:${port}/postgres`)
    exitCode = await runTests({
      RACE_PG_HOST: '127.0.0.1',
      RACE_PG_PORT: String(port),
      RACE_PG_PASSWORD: password,
      RACE_PG_MODULE: pgModule,
    })
  } catch (err) {
    console.error(`[race] LỖI: ${err.message}`)
    exitCode = 1
  } finally {
    if (created && keep) log(`GIỮ container ${name} — xoá bằng: docker rm -f -v ${name}`)
    cleanup()
  }
  log(`xong sau ${((Date.now() - started) / 1000).toFixed(0)} giây, mã thoát ${exitCode}`)
  process.exit(exitCode)
}

main()
